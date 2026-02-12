terraform {
  backend "s3" {
    bucket         = "placeholder"
    key            = "placeholder"
    region         = "us-east-1"
    dynamodb_table = "placeholder"
    encrypt        = true
  }
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

provider "aws" {
  region = "us-east-1"
}

data "terraform_remote_state" "foundation" {
  backend = "s3"

  config = {
    bucket = var.state_bucket_name
    key    = var.state_bucket_key
    region = var.state_region
  }
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# Get OpenAI API key from AWS Secrets Manager
data "aws_secretsmanager_secret" "openai_api_key" {
  name = "${var.project_name}-${var.environment}-openai-api-key"
}

data "aws_secretsmanager_secret_version" "openai_api_key" {
  secret_id = data.aws_secretsmanager_secret.openai_api_key.id
}

# DynamoDB Table for Voice Sessions
resource "aws_dynamodb_table" "voice_sessions" {
  name         = "${var.project_name}-${var.environment}-voice-sessions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled         = true
  }

  tags = {
    Environment = var.environment
    Service     = "voice-session-service"
    Name        = "Voice Sessions Table"
  }
}

# IAM Role for Voice Session Service Lambda
module "voice_session_service_iam_role" {
  source = "../../modules/lambda_iam_role"

  role_name = "voice-session-service-lambda-role-${var.environment}"

  dynamodb_table_arns = [
    aws_dynamodb_table.voice_sessions.arn,
  ]

  tags = {
    Environment = var.environment
    Service     = "voice-session-service"
  }
}

# Additional IAM Policy for Secrets Manager
resource "aws_iam_role_policy" "secrets_manager" {
  name = "voice-session-service-secrets-manager-${var.environment}"
  role = module.voice_session_service_iam_role.role_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          data.aws_secretsmanager_secret.openai_api_key.arn
        ]
      }
    ]
  })
}

# Lambda Function
module "voice_session_service_lambda" {
  source = "../../modules/lambda"

  function_name = "voice-session-${var.environment}-service"
  handler       = "dist/index.handler"
  runtime       = "nodejs20.x"
  filename      = abspath("${path.module}/../../../services/voice-session-service/function.zip")
  iam_role_arn  = module.voice_session_service_iam_role.role_arn

  environment_variables = {
    VOICE_SESSIONS_TABLE = aws_dynamodb_table.voice_sessions.name
    PROJECT_NAME         = var.project_name
    ENVIRONMENT          = var.environment
  }
}

# API Gateway Integration
module "lambda_api_link" {
  source = "../../modules/lambda_api_link"
  api_gateway_id      = data.terraform_remote_state.foundation.outputs.api_gateway_id
  api_gateway_root_id = data.terraform_remote_state.foundation.outputs.api_gateway_root_id
  lambda_function_arn  = module.voice_session_service_lambda.function_arn
  lambda_function_name = module.voice_session_service_lambda.function_name
  paths = ["voice-session"]
}

resource "aws_api_gateway_deployment" "deployment" {
  rest_api_id = data.terraform_remote_state.foundation.outputs.api_gateway_id

  depends_on = [module.lambda_api_link]
}

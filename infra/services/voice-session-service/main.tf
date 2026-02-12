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

# JWT secret for verifying access tokens (so userId can be read from Authorization header)
data "aws_secretsmanager_secret" "jwt_access_token_secret" {
  name = "${var.project_name}-${var.environment}-jwt-access-token-secret"
}

data "aws_secretsmanager_secret_version" "jwt_access_token_secret" {
  secret_id = data.aws_secretsmanager_secret.jwt_access_token_secret.id
}

locals {
  jwt_access_token_secret = try(
    jsondecode(data.aws_secretsmanager_secret_version.jwt_access_token_secret.secret_string)["key"],
    data.aws_secretsmanager_secret_version.jwt_access_token_secret.secret_string
  )
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

# SQS FIFO Queue for voice sessions (deduplication by userId via MessageDeduplicationId)
resource "aws_sqs_queue" "voice_session_queue" {
  name                        = "${var.project_name}-${var.environment}-voice-session-queue.fifo"
  fifo_queue                  = true
  content_based_deduplication  = true
  visibility_timeout_seconds  = 60
  message_retention_seconds   = 86400
  receive_wait_time_seconds   = 0
  tags = {
    Environment = var.environment
    Service     = "voice-session-service"
  }
}

# IAM Role for Voice Session Service Lambda (only sends to SQS; no DynamoDB)
module "voice_session_service_iam_role" {
  source = "../../modules/lambda_iam_role"

  role_name = "voice-session-service-lambda-role-${var.environment}"

  dynamodb_table_arns = []

  tags = {
    Environment = var.environment
    Service     = "voice-session-service"
  }
}

# Additional IAM Policy for Secrets Manager (OpenAI + JWT)
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
      },
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [data.aws_secretsmanager_secret.jwt_access_token_secret.arn]
      }
    ]
  })
}

# IAM Policy for SQS: this Lambda only sends session records to the queue
resource "aws_iam_role_policy" "sqs" {
  name = "voice-session-service-sqs-${var.environment}"
  role = module.voice_session_service_iam_role.role_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = [aws_sqs_queue.voice_session_queue.arn]
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
    VOICE_SESSION_QUEUE_URL  = aws_sqs_queue.voice_session_queue.url
    PROJECT_NAME             = var.project_name
    ENVIRONMENT              = var.environment
    JWT_ACCESS_TOKEN_SECRET  = local.jwt_access_token_secret
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

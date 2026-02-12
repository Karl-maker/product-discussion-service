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

data "aws_secretsmanager_secret" "openai_api_key" {
  name = "${var.project_name}-${var.environment}-openai-api-key"
}

# JWT secret for verifying access tokens (same as eislett-education-payment-service)
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

# DynamoDB Table for Conversation Packages
resource "aws_dynamodb_table" "conversation_packages" {
  name         = "${var.project_name}-${var.environment}-conversation-packages"
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

  tags = {
    Environment = var.environment
    Service     = "conversation-package-service"
    Name        = "Conversation Packages Table"
  }
}

# DynamoDB Table for Transcript Analysis Results (by userId); TTL 90 days
resource "aws_dynamodb_table" "analysis_results" {
  name         = "${var.project_name}-${var.environment}-conversation-analysis-results"
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
    enabled        = true
  }

  tags = {
    Environment = var.environment
    Service     = "conversation-package-service"
    Name        = "Transcript Analysis Results Table"
  }
}

# IAM Role for Conversation Package Service Lambda
module "conversation_package_service_iam_role" {
  source = "../../modules/lambda_iam_role"

  role_name = "conversation-package-service-lambda-role-${var.environment}"

  dynamodb_table_arns = [
    aws_dynamodb_table.conversation_packages.arn,
    aws_dynamodb_table.analysis_results.arn,
  ]

  tags = {
    Environment = var.environment
    Service     = "conversation-package-service"
  }
}

resource "aws_iam_role_policy" "secrets_manager" {
  name = "conversation-package-service-secrets-manager-${var.environment}"
  role = module.conversation_package_service_iam_role.role_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [
          data.aws_secretsmanager_secret.openai_api_key.arn,
          data.aws_secretsmanager_secret.jwt_access_token_secret.arn
        ]
      }
    ]
  })
}

# Lambda Function (conversation-package-service code)
# Timeout 28s: analyze-transcript calls OpenAI; API Gateway max integration timeout is 29s
module "conversation_package_service_lambda" {
  source = "../../modules/lambda"

  function_name = "conversation-package-${var.environment}-service"
  handler       = "dist/index.handler"
  runtime       = "nodejs20.x"
  timeout       = 28
  filename      = abspath("${path.module}/../../../services/conversation-package-service/function.zip")
  iam_role_arn  = module.conversation_package_service_iam_role.role_arn

  environment_variables = {
    CONVERSATION_PACKAGES_TABLE = aws_dynamodb_table.conversation_packages.name
    ANALYSIS_RESULTS_TABLE      = aws_dynamodb_table.analysis_results.name
    PROJECT_NAME                = var.project_name
    ENVIRONMENT                 = var.environment
    JWT_ACCESS_TOKEN_SECRET     = local.jwt_access_token_secret
  }
}

# API Gateway Integration
module "lambda_api_link" {
  source = "../../modules/lambda_api_link"
  api_gateway_id       = data.terraform_remote_state.foundation.outputs.api_gateway_id
  api_gateway_root_id  = data.terraform_remote_state.foundation.outputs.api_gateway_root_id
  lambda_function_arn  = module.conversation_package_service_lambda.function_arn
  lambda_function_name = module.conversation_package_service_lambda.function_name
  paths                = ["packages"]
}

resource "aws_api_gateway_deployment" "deployment" {
  rest_api_id = data.terraform_remote_state.foundation.outputs.api_gateway_id

  depends_on = [module.lambda_api_link]
}

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

# DynamoDB Table for Conversation Users (profile by userId)
resource "aws_dynamodb_table" "conversation_users" {
  name         = "${var.project_name}-${var.environment}-conversation-users"
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
    Service     = "conversation-user-service"
    Name        = "Conversation Users Table"
  }
}

# IAM Role for Conversation User Service Lambda
module "conversation_user_service_iam_role" {
  source = "../../modules/lambda_iam_role"

  role_name = "conversation-user-service-lambda-role-${var.environment}"

  dynamodb_table_arns = [
    aws_dynamodb_table.conversation_users.arn,
  ]

  tags = {
    Environment = var.environment
    Service     = "conversation-user-service"
  }
}

# Lambda Function
module "conversation_user_service_lambda" {
  source = "../../modules/lambda"

  function_name = "conversation-user-service"
  handler       = "dist/index.handler"
  runtime       = "nodejs20.x"
  filename      = abspath("${path.cwd}/services/conversation-user-service/function.zip")
  iam_role_arn  = module.conversation_user_service_iam_role.role_arn

  environment_variables = {
    CONVERSATION_USERS_TABLE = aws_dynamodb_table.conversation_users.name
  }
}

# API Gateway Integration
module "lambda_api_link" {
  source = "../../modules/lambda_api_link"
  api_gateway_id       = data.terraform_remote_state.foundation.outputs.api_gateway_id
  api_gateway_root_id  = data.terraform_remote_state.foundation.outputs.api_gateway_root_id
  lambda_function_arn  = module.conversation_user_service_lambda.function_arn
  lambda_function_name = module.conversation_user_service_lambda.function_name
  paths                = ["users"]
}

resource "aws_api_gateway_deployment" "deployment" {
  rest_api_id = data.terraform_remote_state.foundation.outputs.api_gateway_id

  depends_on = [module.lambda_api_link]
}

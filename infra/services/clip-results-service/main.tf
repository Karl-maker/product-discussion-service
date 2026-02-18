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

# ---------------------------------------------------------------------------
# DynamoDB table for clip results (attempts, snapshot, likes)
# PK/SK: USER#userId / ATTEMPT#clipId#ts, USER#userId / LIKE#clipId, CLIP#clipId / SNAPSHOT
# ---------------------------------------------------------------------------
resource "aws_dynamodb_table" "clip_results" {
  name         = "${var.project_name}-${var.environment}-clip-results"
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
    Service     = "clip-results-service"
    Name        = "Clip Results Table"
  }
}

# ---------------------------------------------------------------------------
# IAM role for clip-results Lambda
# ---------------------------------------------------------------------------
module "clip_results_iam_role" {
  source = "../../modules/lambda_iam_role"

  role_name = "clip-results-service-lambda-role-${var.environment}"

  dynamodb_table_arns = [
    aws_dynamodb_table.clip_results.arn,
  ]

  tags = {
    Environment = var.environment
    Service     = "clip-results-service"
  }
}

# ---------------------------------------------------------------------------
# Lambda (clip-results-service)
# ---------------------------------------------------------------------------
module "clip_results_service_lambda" {
  source = "../../modules/lambda"

  function_name = "clip-results-${var.environment}-service"
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 28
  filename      = abspath("${path.module}/../../../services/clip-results-service/function.zip")
  iam_role_arn  = module.clip_results_iam_role.role_arn

  environment_variables = {
    CLIP_RESULTS_TABLE = aws_dynamodb_table.clip_results.name
  }
}

# ---------------------------------------------------------------------------
# API Gateway: route /clip-results to this Lambda
# ---------------------------------------------------------------------------
module "lambda_api_link" {
  source = "../../modules/lambda_api_link"

  api_gateway_id       = data.terraform_remote_state.foundation.outputs.api_gateway_id
  api_gateway_root_id  = data.terraform_remote_state.foundation.outputs.api_gateway_root_id
  lambda_function_arn  = module.clip_results_service_lambda.function_arn
  lambda_function_name = module.clip_results_service_lambda.function_name
  paths                = ["clip-results"]
}

resource "aws_api_gateway_deployment" "deployment" {
  rest_api_id = data.terraform_remote_state.foundation.outputs.api_gateway_id

  depends_on = [module.lambda_api_link]
}

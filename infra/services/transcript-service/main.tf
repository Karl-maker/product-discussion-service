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

# DynamoDB Table for Transcripts
resource "aws_dynamodb_table" "transcripts" {
  name         = "${var.project_name}-${var.environment}-transcripts"
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
    Service     = "transcript-service"
    Name        = "Transcripts Table"
  }
}

# SNS Topic for Transcript Events
resource "aws_sns_topic" "transcript_events" {
  name = "${var.project_name}-${var.environment}-transcript-events"

  tags = {
    Environment = var.environment
    Service     = "transcript-service"
    Name        = "Transcript Events Topic"
  }

  lifecycle {
    ignore_changes = [tags]
  }
}

# IAM Role for Transcript Service Lambda
module "transcript_service_iam_role" {
  source = "../../modules/lambda_iam_role"

  role_name = "transcript-service-lambda-role-${var.environment}"

  dynamodb_table_arns = [
    aws_dynamodb_table.transcripts.arn,
  ]

  tags = {
    Environment = var.environment
    Service     = "transcript-service"
  }
}

# Additional IAM Policy for SNS Publishing
resource "aws_iam_role_policy" "sns_publish" {
  name = "transcript-service-sns-publish-${var.environment}"
  role = module.transcript_service_iam_role.role_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sns:Publish"
        ]
        Resource = [
          aws_sns_topic.transcript_events.arn
        ]
      }
    ]
  })
}

# Lambda Function
module "transcript_service_lambda" {
  source = "../../modules/lambda"

  function_name = "transcript-service"
  handler       = "dist/index.handler"
  runtime       = "nodejs20.x"
  filename      = abspath("${path.cwd}/services/transcript-service/function.zip")
  iam_role_arn  = module.transcript_service_iam_role.role_arn

  environment_variables = {
    TRANSCRIPTS_TABLE          = aws_dynamodb_table.transcripts.name
    TRANSCRIPT_EVENTS_TOPIC_ARN = aws_sns_topic.transcript_events.arn
  }
}

# API Gateway Integration
module "lambda_api_link" {
  source = "../../modules/lambda_api_link"
  api_gateway_id      = data.terraform_remote_state.foundation.outputs.api_gateway_id
  api_gateway_root_id = data.terraform_remote_state.foundation.outputs.api_gateway_root_id
  lambda_function_arn  = module.transcript_service_lambda.function_arn
  lambda_function_name = module.transcript_service_lambda.function_name
  paths = ["transcripts"]
}

resource "aws_api_gateway_deployment" "deployment" {
  rest_api_id = data.terraform_remote_state.foundation.outputs.api_gateway_id

  depends_on = [module.lambda_api_link]
}

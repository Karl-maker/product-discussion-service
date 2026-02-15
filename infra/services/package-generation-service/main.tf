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

# Resolve voice session queue if not passed (same naming as voice-session-service)
data "aws_sqs_queue" "voice_session" {
  count = var.voice_session_queue_arn != "" ? 0 : 1
  name  = "${var.project_name}-${var.environment}-voice-session-queue.fifo"
}

locals {
  voice_session_queue_arn = var.voice_session_queue_arn != "" ? var.voice_session_queue_arn : (length(data.aws_sqs_queue.voice_session) > 0 ? data.aws_sqs_queue.voice_session[0].arn : "")
  voice_session_queue_url = var.voice_session_queue_url != "" ? var.voice_session_queue_url : (length(data.aws_sqs_queue.voice_session) > 0 ? data.aws_sqs_queue.voice_session[0].url : "")
}

data "aws_secretsmanager_secret" "openai_api_key" {
  name = "${var.project_name}-${var.environment}-openai-api-key"
}

# SNS topic: package generated events (email, etc. can subscribe)
resource "aws_sns_topic" "package_generated" {
  name = "${var.project_name}-${var.environment}-package-generated"
  tags = {
    Environment = var.environment
    Service     = "package-generation-service"
  }
}

# Generation state: last processed timestamp per user+language
resource "aws_dynamodb_table" "generation_state" {
  name         = "${var.project_name}-${var.environment}-package-generation-state"
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
    Service     = "package-generation-service"
    Name        = "Package Generation State"
  }
}

# Conversation packages and analysis results use same naming as conversation-service (tables must exist)
locals {
  conversation_packages_table_name = "${var.project_name}-${var.environment}-conversation-packages"
  analysis_results_table_name     = "${var.project_name}-${var.environment}-conversation-analysis-results"
}

# IAM role for package-generation Lambda
module "package_generation_iam_role" {
  source = "../../modules/lambda_iam_role"

  role_name = "package-generation-service-lambda-role-${var.environment}"

  dynamodb_table_arns = [
    aws_dynamodb_table.generation_state.arn,
  ]

  tags = {
    Environment = var.environment
    Service     = "package-generation-service"
  }
}

# Policy: read analysis results, read+write conversation packages (same table names as conversation-service).
# Include GSI so Lambda can Query by userId+createdAt for latest package.
resource "aws_iam_role_policy" "dynamodb_tables" {
  name   = "package-generation-dynamodb-${var.environment}"
  role   = module.package_generation_iam_role.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan", "dynamodb:BatchGetItem", "dynamodb:BatchWriteItem"]
        Resource = [
          "arn:aws:dynamodb:*:*:table/${local.conversation_packages_table_name}",
          "arn:aws:dynamodb:*:*:table/${local.conversation_packages_table_name}/index/userId-createdAt-index",
          "arn:aws:dynamodb:*:*:table/${local.analysis_results_table_name}",
        ]
      },
    ]
  })
}

resource "aws_iam_role_policy" "secrets_manager" {
  name   = "package-generation-secrets-${var.environment}"
  role   = module.package_generation_iam_role.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [data.aws_secretsmanager_secret.openai_api_key.arn]
      }
    ]
  })
}

resource "aws_iam_role_policy" "sqs_consume" {
  count  = local.voice_session_queue_arn != "" ? 1 : 0
  name   = "package-generation-sqs-${var.environment}"
  role   = module.package_generation_iam_role.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
        Resource = [local.voice_session_queue_arn]
      }
    ]
  })
}

resource "aws_iam_role_policy" "sns_publish" {
  name   = "package-generation-sns-${var.environment}"
  role   = module.package_generation_iam_role.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["sns:Publish"]
        Resource = [aws_sns_topic.package_generated.arn]
      }
    ]
  })
}

# Lambda: SQS consumer, batch 5
resource "aws_lambda_event_source_mapping" "voice_session_queue" {
  count            = local.voice_session_queue_arn != "" ? 1 : 0
  event_source_arn = local.voice_session_queue_arn
  function_name    = aws_lambda_function.package_generation.function_name
  batch_size       = 5
}

resource "aws_lambda_function" "package_generation" {
  function_name = "package-generation-${var.environment}-service"
  handler       = "dist/index.handler"
  runtime       = "nodejs20.x"
  timeout       = 180
  memory_size   = 1024
  filename         = abspath("${path.module}/../../../services/package-generation-service/function.zip")
  source_code_hash = filebase64sha256(abspath("${path.module}/../../../services/package-generation-service/function.zip"))
  role             = module.package_generation_iam_role.role_arn

  environment {
    variables = {
      GENERATION_STATE_TABLE        = aws_dynamodb_table.generation_state.name
      CONVERSATION_PACKAGES_TABLE   = local.conversation_packages_table_name
      ANALYSIS_RESULTS_TABLE        = local.analysis_results_table_name
      PACKAGE_GENERATED_TOPIC_ARN   = aws_sns_topic.package_generated.arn
      PROJECT_NAME                  = var.project_name
      ENVIRONMENT                   = var.environment
    }
  }
}

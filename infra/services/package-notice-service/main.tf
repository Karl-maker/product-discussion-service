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

# Resolve email queue by name if not passed (queue created by email-service in wittytalk-core-service)
data "aws_sqs_queue" "email_service" {
  count = var.email_service_queue_url != "" ? 0 : 1
  name  = "${var.project_name}-${var.environment}-email-service-queue"
}

locals {
  email_queue_url = var.email_service_queue_url != "" ? var.email_service_queue_url : (length(data.aws_sqs_queue.email_service) > 0 ? data.aws_sqs_queue.email_service[0].url : "")
  email_queue_arn = var.email_service_queue_arn != "" ? var.email_service_queue_arn : (length(data.aws_sqs_queue.email_service) > 0 ? data.aws_sqs_queue.email_service[0].arn : "")
  conversation_packages_table_name = "${var.project_name}-${var.environment}-conversation-packages"
  analysis_results_table_name       = "${var.project_name}-${var.environment}-conversation-analysis-results"
}

# DynamoDB: track last notice sent per user (TTL 7 days)
resource "aws_dynamodb_table" "notice_sent" {
  name         = "${var.project_name}-${var.environment}-package-notice-sent"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"

  attribute {
    name = "userId"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = {
    Environment = var.environment
    Service     = "package-notice-service"
    Name        = "Package Notice Sent"
  }
}

# IAM role for package-notice Lambda
module "package_notice_iam_role" {
  source = "../../modules/lambda_iam_role"

  role_name = "package-notice-service-lambda-role-${var.environment}"

  dynamodb_table_arns = [
    aws_dynamodb_table.notice_sent.arn,
  ]

  tags = {
    Environment = var.environment
    Service     = "package-notice-service"
  }
}

# Policy: read conversation packages + analysis results (same table names as conversation-service)
resource "aws_iam_role_policy" "dynamodb_read" {
  name   = "package-notice-dynamodb-read-${var.environment}"
  role   = module.package_notice_iam_role.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:Scan", "dynamodb:BatchGetItem"]
        Resource = [
          "arn:aws:dynamodb:*:*:table/${local.conversation_packages_table_name}",
          "arn:aws:dynamodb:*:*:table/${local.analysis_results_table_name}",
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:BatchWriteItem"]
        Resource = [aws_dynamodb_table.notice_sent.arn]
      },
    ]
  })
}

# Policy: send message to email-service SQS queue
resource "aws_iam_role_policy" "sqs_send" {
  count  = local.email_queue_arn != "" ? 1 : 0
  name   = "package-notice-sqs-send-${var.environment}"
  role   = module.package_notice_iam_role.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = [local.email_queue_arn]
      },
    ]
  })
}

# EventBridge rule: run on schedule (cron or rate)
resource "aws_cloudwatch_event_rule" "every_six_hours" {
  name                = "${var.project_name}-${var.environment}-package-notice-schedule"
  description         = "Trigger package-notice Lambda on schedule (configurable via schedule_cron_expression)"
  schedule_expression = var.schedule_cron_expression
  tags = {
    Environment = var.environment
    Service     = "package-notice-service"
  }
}

resource "aws_cloudwatch_event_target" "package_notice_lambda" {
  rule      = aws_cloudwatch_event_rule.every_six_hours.name
  target_id = "PackageNoticeLambda"
  arn       = aws_lambda_function.package_notice.arn
}

resource "aws_lambda_permission" "eventbridge" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.package_notice.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.every_six_hours.arn
}

# Lambda
resource "aws_lambda_function" "package_notice" {
  function_name = "package-notice-${var.environment}-service"
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 120
  memory_size   = 256
  filename      = abspath("${path.module}/../../../services/package-notice-service/function.zip")
  source_code_hash = filebase64sha256(abspath("${path.module}/../../../services/package-notice-service/function.zip"))
  role         = module.package_notice_iam_role.role_arn

  environment {
    variables = {
      CONVERSATION_PACKAGES_TABLE = local.conversation_packages_table_name
      NOTICE_SENT_TABLE           = aws_dynamodb_table.notice_sent.name
      ANALYSIS_RESULTS_TABLE      = local.analysis_results_table_name
      EMAIL_SERVICE_QUEUE_URL    = local.email_queue_url
      APP_BASE_URL               = var.app_base_url
      PROJECT_NAME               = var.project_name
      ENVIRONMENT                = var.environment
    }
  }
}

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

locals {
  conversation_packages_table_name = "${var.project_name}-${var.environment}-conversation-packages"
  analysis_results_table_name     = "${var.project_name}-${var.environment}-conversation-analysis-results"
}

# DynamoDB: track last lesson notice sent per user (TTL 7 days)
resource "aws_dynamodb_table" "notice_sent" {
  name         = "${var.project_name}-${var.environment}-lesson-notice-sent"
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
    Service     = "lesson-notice-service"
    Name        = "Lesson notice sent (TTL 7 days)"
  }
}

# IAM role for Lambda
module "lesson_notice_iam_role" {
  source = "../../modules/lambda_iam_role"

  role_name = "lesson-notice-service-lambda-role-${var.environment}"

  dynamodb_table_arns = [
    aws_dynamodb_table.notice_sent.arn,
    "${aws_dynamodb_table.notice_sent.arn}/index/*",
  ]

  tags = {
    Environment = var.environment
    Service     = "lesson-notice-service"
  }
}

# Policy: read conversation-packages and analysis-results (tables from conversation-service)
resource "aws_iam_role_policy" "read_packages_and_analysis" {
  name   = "lesson-notice-read-tables-${var.environment}"
  role   = module.lesson_notice_iam_role.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchGetItem"
        ]
        Resource = [
          "arn:aws:dynamodb:*:*:table/${local.conversation_packages_table_name}",
          "arn:aws:dynamodb:*:*:table/${local.analysis_results_table_name}",
          "arn:aws:dynamodb:*:*:table/${local.analysis_results_table_name}/index/*"
        ]
      }
    ]
  })
}

# Policy: optional user email table (if provided)
resource "aws_iam_role_policy" "read_user_email" {
  count  = var.user_email_table_name != "" ? 1 : 0
  name   = "lesson-notice-user-email-${var.environment}"
  role   = module.lesson_notice_iam_role.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem"]
        Resource = ["arn:aws:dynamodb:*:*:table/${var.user_email_table_name}"]
      }
    ]
  })
}

# Policy: send message to email SQS queue
resource "aws_iam_role_policy" "sqs_send" {
  name   = "lesson-notice-sqs-send-${var.environment}"
  role   = module.lesson_notice_iam_role.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = [var.email_queue_arn != "" ? var.email_queue_arn : "*"]
      }
    ]
  })
}

# Lambda
resource "aws_lambda_function" "lesson_notice" {
  function_name    = "lesson-notice-${var.environment}-service"
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  timeout          = 120
  memory_size      = 256
  filename         = abspath("${path.module}/../../../services/lesson-notice-service/function.zip")
  source_code_hash = filebase64sha256(abspath("${path.module}/../../../services/lesson-notice-service/function.zip"))
  role             = module.lesson_notice_iam_role.role_arn

  environment {
    variables = {
      CONVERSATION_PACKAGES_TABLE = local.conversation_packages_table_name
      NOTICE_SENT_TABLE           = aws_dynamodb_table.notice_sent.name
      EMAIL_QUEUE_URL             = var.email_queue_url
      USER_EMAIL_TABLE            = var.user_email_table_name
      ANALYSIS_RESULTS_TABLE      = local.analysis_results_table_name
      LESSON_BASE_URL              = var.lesson_base_url
    }
  }
}

# EventBridge rule: run on schedule
resource "aws_cloudwatch_event_rule" "every_6_hours" {
  name                = "${var.project_name}-${var.environment}-lesson-notice-schedule"
  description         = "Trigger lesson notice Lambda every 6 hours (configurable via schedule_cron)"
  schedule_expression = var.schedule_cron
}

resource "aws_cloudwatch_event_target" "lesson_notice_lambda" {
  rule      = aws_cloudwatch_event_rule.every_6_hours.name
  target_id = "LessonNoticeLambda"
  arn       = aws_lambda_function.lesson_notice.arn
}

resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.lesson_notice.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.every_6_hours.arn
}

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

data "terraform_remote_state" "transcript_service" {
  backend = "s3"

  config = {
    bucket = "${var.project_name}-${var.environment}-transcript-service-state"
    key    = "tf-infra/${var.environment}.tfstate"
    region = "us-east-1"
  }
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# Get OpenAI API key secret
data "aws_secretsmanager_secret" "openai_api_key" {
  name = "${var.project_name}-${var.environment}-openai-api-key"
}

# DynamoDB Table for Conversation Plans
resource "aws_dynamodb_table" "conversation_plans" {
  name         = "${var.project_name}-${var.environment}-conversation-plans"
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

  attribute {
    name = "GSI1PK"
    type = "S"
  }

  attribute {
    name = "GSI1SK"
    type = "S"
  }

  global_secondary_index {
    name            = "GSI1"
    hash_key        = "GSI1PK"
    range_key       = "GSI1SK"
    projection_type = "ALL"
  }

  tags = {
    Environment = var.environment
    Service     = "conversation-service"
    Name        = "Conversation Plans Table"
  }
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
    Service     = "conversation-service"
    Name        = "Conversation Packages Table"
  }
}

# DynamoDB Table for Conversations
resource "aws_dynamodb_table" "conversations" {
  name         = "${var.project_name}-${var.environment}-conversations"
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

  attribute {
    name = "GSI1PK"
    type = "S"
  }

  attribute {
    name = "GSI1SK"
    type = "S"
  }

  global_secondary_index {
    name            = "GSI1"
    hash_key        = "GSI1PK"
    range_key       = "GSI1SK"
    projection_type = "ALL"
  }

  tags = {
    Environment = var.environment
    Service     = "conversation-service"
    Name        = "Conversations Table"
  }
}

# IAM Role for Conversation Service Lambda
module "conversation_service_iam_role" {
  source = "../../modules/lambda_iam_role"

  role_name = "conversation-service-lambda-role-${var.environment}"

  dynamodb_table_arns = [
    aws_dynamodb_table.conversation_plans.arn,
    "${aws_dynamodb_table.conversation_plans.arn}/index/*",
    aws_dynamodb_table.conversation_packages.arn,
    aws_dynamodb_table.conversations.arn,
    "${aws_dynamodb_table.conversations.arn}/index/*",
  ]

  tags = {
    Environment = var.environment
    Service     = "conversation-service"
  }
}

# Additional IAM Policy for SQS (usage event queue)
# ARN from var.usage_event_queue_arn or default same-account queue name
locals {
  usage_event_queue_arn = var.usage_event_queue_arn != "" ? var.usage_event_queue_arn : "arn:aws:sqs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:${var.project_name}-${var.environment}-usage-event-queue"
}

resource "aws_iam_role_policy" "sqs_send_message" {
  name = "conversation-service-sqs-send-${var.environment}"
  role = module.conversation_service_iam_role.role_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage"
        ]
        Resource = local.usage_event_queue_arn
      }
    ]
  })
}

# Additional IAM Policy for Secrets Manager (OpenAI API key)
resource "aws_iam_role_policy" "secrets_manager" {
  name = "conversation-service-secrets-manager-${var.environment}"
  role = module.conversation_service_iam_role.role_name

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

# Additional IAM Policy for SQS (receive and delete messages)
resource "aws_iam_role_policy" "sqs_receive" {
  name = "conversation-service-sqs-receive-${var.environment}"
  role = module.conversation_service_iam_role.role_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = [
          aws_sqs_queue.transcript_processing_queue.arn
        ]
      }
    ]
  })
}

# SQS Dead Letter Queue for Transcript Processing
resource "aws_sqs_queue" "transcript_processing_dlq" {
  name = "${var.project_name}-${var.environment}-conversation-transcript-dlq"

  tags = {
    Environment = var.environment
    Service     = "conversation-service"
    Name        = "Transcript Processing DLQ"
  }
}

# SQS Queue for Transcript Processing
resource "aws_sqs_queue" "transcript_processing_queue" {
  name                       = "${var.project_name}-${var.environment}-conversation-transcript-queue"
  visibility_timeout_seconds = 300  # 5 minutes
  message_retention_seconds  = 1209600  # 14 days
  receive_wait_time_seconds  = 20  # Long polling

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.transcript_processing_dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    Environment = var.environment
    Service     = "conversation-service"
    Name        = "Transcript Processing Queue"
  }
}

# SQS Queue Policy to allow SNS to send messages
resource "aws_sqs_queue_policy" "transcript_queue_policy" {
  queue_url = aws_sqs_queue.transcript_processing_queue.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "sns.amazonaws.com"
        }
        Action   = "sqs:SendMessage"
        Resource = aws_sqs_queue.transcript_processing_queue.arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = data.terraform_remote_state.transcript_service.outputs.transcript_events_topic_arn
          }
        }
      }
    ]
  })
}

# SNS Subscription: SQS Queue subscribes to Transcript Events Topic with filter
# Note: Filtering by sentBy happens in the message body, not attributes
# We'll filter in the code, but we can add a filter policy if SNS message attributes are set
resource "aws_sns_topic_subscription" "transcript_events_to_sqs" {
  topic_arn = data.terraform_remote_state.transcript_service.outputs.transcript_events_topic_arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.transcript_processing_queue.arn
  
  # Note: Filtering by sentBy="user" is done in the parse-event.ts handler
  # since the filter is based on message body content, not attributes
}

# Lambda Function
module "conversation_service_lambda" {
  source = "../../modules/lambda"

  function_name = "conversation-service"
  handler       = "dist/index.handler"
  runtime       = "nodejs20.x"
  filename      = abspath("${path.cwd}/services/conversation-service/function.zip")
  iam_role_arn  = module.conversation_service_iam_role.role_arn

  environment_variables = merge(
    {
      CONVERSATION_PLANS_TABLE    = aws_dynamodb_table.conversation_plans.name
      CONVERSATION_PACKAGES_TABLE = aws_dynamodb_table.conversation_packages.name
      CONVERSATIONS_TABLE         = aws_dynamodb_table.conversations.name
      PROJECT_NAME                = var.project_name
      ENVIRONMENT                 = var.environment
    },
    var.usage_event_queue_url != "" ? { USAGE_EVENT_QUEUE_URL = var.usage_event_queue_url } : {}
  )
}

# Lambda Function for SQS Processing (Transcript Events)
module "conversation_service_sqs_lambda" {
  source = "../../modules/lambda"

  function_name = "conversation-service-sqs-processor"
  handler       = "dist/sqs-handler.handler"
  runtime       = "nodejs20.x"
  filename      = abspath("${path.cwd}/services/conversation-service/function.zip")
  iam_role_arn  = module.conversation_service_iam_role.role_arn

  environment_variables = {
    CONVERSATION_PLANS_TABLE     = aws_dynamodb_table.conversation_plans.name
    CONVERSATION_PACKAGES_TABLE  = aws_dynamodb_table.conversation_packages.name
    CONVERSATIONS_TABLE          = aws_dynamodb_table.conversations.name
    PROJECT_NAME                 = var.project_name
    ENVIRONMENT                  = var.environment
  }
}

# Lambda Event Source Mapping (SQS Trigger)
resource "aws_lambda_event_source_mapping" "transcript_sqs_trigger" {
  event_source_arn = aws_sqs_queue.transcript_processing_queue.arn
  function_name    = module.conversation_service_sqs_lambda.function_arn
  batch_size       = 10
  maximum_batching_window_in_seconds = 5

  # Enable partial batch response for DLQ handling
  function_response_types = ["ReportBatchItemFailures"]
}

# API Gateway Integration
module "lambda_api_link" {
  source = "../../modules/lambda_api_link"
  api_gateway_id      = data.terraform_remote_state.foundation.outputs.api_gateway_id
  api_gateway_root_id = data.terraform_remote_state.foundation.outputs.api_gateway_root_id
  lambda_function_arn  = module.conversation_service_lambda.function_arn
  lambda_function_name = module.conversation_service_lambda.function_name
  paths = ["conversation-plans", "conversation-packages", "conversations"]
}

resource "aws_api_gateway_deployment" "deployment" {
  rest_api_id = data.terraform_remote_state.foundation.outputs.api_gateway_id

  depends_on = [module.lambda_api_link]
}

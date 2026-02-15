variable "state_bucket_name" {
  type = string
}

variable "state_region" {
  type = string
}

variable "state_bucket_key" {
  type = string
}

variable "environment" {
  type    = string
  default = "dev"
}

variable "project_name" {
  type        = string
  description = "Project name prefix for resource naming"
  default     = "eislett-education"
}

# EventBridge schedule: cron expression (UTC). Default: every 6 hours at minute 0.
variable "schedule_cron" {
  type        = string
  description = "EventBridge schedule expression (cron or rate). E.g. cron(0 */6 * * ? *) = every 6 hours"
  default     = "cron(0 */6 * * ? *)"
}

# Email queue URL (from email-service, e.g. wittytalk-core-service). Required for sending notices.
variable "email_queue_url" {
  type        = string
  description = "SQS queue URL for email-service (lesson notices are sent here)"
}

# Optional: queue ARN for IAM (if not set, policy uses * for SQS SendMessage)
variable "email_queue_arn" {
  type        = string
  description = "ARN of the email-service SQS queue (for IAM); if empty, policy allows all queues"
  default     = ""
}

# Optional: DynamoDB table name for user email lookup (PK=USER#userId, SK=PROFILE, attribute email). If not set, notices are skipped when email cannot be resolved.
variable "user_email_table_name" {
  type        = string
  description = "Optional: table name for userId -> email lookup (e.g. conversation-users with email attribute)"
  default     = ""
}

variable "lesson_base_url" {
  type        = string
  description = "Base URL for lesson links in emails"
  default     = "https://app.wittytalk.ai"
}

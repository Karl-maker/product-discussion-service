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

# EventBridge schedule: when to run the notice job (every 5 minutes by default)
variable "schedule_cron_expression" {
  type        = string
  description = "EventBridge schedule expression (cron or rate). Default: every 5 minutes."
  default     = "rate(5 minutes)"
}

# Email service queue: package-notice sends lesson notices here (consumed by email-service)
variable "email_service_queue_url" {
  type        = string
  description = "URL of the email-service SQS queue (e.g. from wittytalk-core-service email-service output). If empty, resolved by queue name."
  default     = ""
}

variable "email_service_queue_arn" {
  type        = string
  description = "ARN of the email-service SQS queue (for IAM). If empty, resolved by queue name."
  default     = ""
}

variable "app_base_url" {
  type        = string
  description = "Base URL for the app (e.g. https://app.wittytalk.ai) used in lesson links"
  default     = "https://app.wittytalk.ai"
}

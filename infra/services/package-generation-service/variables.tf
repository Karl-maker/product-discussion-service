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

# Voice session queue (consumer): pass from voice-session-service outputs or use queue name
variable "voice_session_queue_arn" {
  type        = string
  description = "ARN of the voice session FIFO SQS queue to consume from"
  default     = ""
}

variable "voice_session_queue_url" {
  type        = string
  description = "URL of the voice session FIFO SQS queue (optional; resolved by name if empty)"
  default     = ""
}

# Conversation users table (for user profile: profession, initialFluency, purposeOfUsage). If set, Lambda can read profile to personalize packages.
variable "conversation_users_table_name" {
  type        = string
  description = "Name of the conversation-users DynamoDB table (same project: project_name-environment-conversation-users)"
  default     = ""
}

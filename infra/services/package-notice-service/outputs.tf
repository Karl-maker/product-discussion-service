output "package_notice_lambda_arn" {
  value       = aws_lambda_function.package_notice.arn
  description = "ARN of the package-notice Lambda"
}

output "notice_sent_table_name" {
  value       = aws_dynamodb_table.notice_sent.name
  description = "DynamoDB table name for notice-sent tracking"
}

output "schedule_rule_arn" {
  value       = aws_cloudwatch_event_rule.every_six_hours.arn
  description = "EventBridge rule ARN (schedule)"
}

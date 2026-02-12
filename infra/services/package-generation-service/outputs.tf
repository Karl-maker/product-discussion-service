output "package_generated_topic_arn" {
  value       = aws_sns_topic.package_generated.arn
  description = "SNS topic ARN for package.generated events (subscribe for email, etc.)"
}

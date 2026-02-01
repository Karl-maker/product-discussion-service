output "conversation_users_table_name" {
  value       = aws_dynamodb_table.conversation_users.name
  description = "Name of the conversation users DynamoDB table"
}

output "conversation_users_table_arn" {
  value       = aws_dynamodb_table.conversation_users.arn
  description = "ARN of the conversation users DynamoDB table"
}

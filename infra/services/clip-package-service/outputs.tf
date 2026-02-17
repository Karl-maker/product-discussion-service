output "clip_bucket_name" {
  value       = aws_s3_bucket.clip.id
  description = "S3 bucket name for clip media"
}

output "clip_bucket_arn" {
  value       = aws_s3_bucket.clip.arn
  description = "S3 bucket ARN for clip media"
}

output "clip_cdn_domain" {
  value       = aws_cloudfront_distribution.clip.domain_name
  description = "CloudFront domain for clip CDN"
}

output "clip_cdn_url" {
  value       = "https://${aws_cloudfront_distribution.clip.domain_name}"
  description = "CloudFront URL for clip CDN"
}

output "clip_cdn_distribution_id" {
  value       = aws_cloudfront_distribution.clip.id
  description = "CloudFront distribution ID"
}

output "clip_packages_table_name" {
  value       = aws_dynamodb_table.clip_packages.name
  description = "DynamoDB table name for clip packages"
}

output "lambda_function_arn" {
  value       = module.clip_package_service_lambda.function_arn
  description = "Clip package service Lambda ARN"
}

output "lambda_function_name" {
  value       = module.clip_package_service_lambda.function_name
  description = "Clip package service Lambda name"
}

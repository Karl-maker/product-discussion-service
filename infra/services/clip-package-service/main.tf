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

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  clip_bucket_name = "${var.project_name}-${var.environment}-clip"
}

# ---------------------------------------------------------------------------
# S3 bucket for clip media (videos, thumbnails)
# ---------------------------------------------------------------------------
resource "aws_s3_bucket" "clip" {
  bucket = local.clip_bucket_name

  tags = {
    Environment = var.environment
    Service     = "clip-package-service"
    Name        = "Clip storage"
  }
}

resource "aws_s3_bucket_public_access_block" "clip" {
  bucket = aws_s3_bucket.clip.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "clip" {
  bucket = aws_s3_bucket.clip.id

  versioning_configuration {
    status = "Enabled"
  }
}

# ---------------------------------------------------------------------------
# CloudFront OAC and distribution (CDN for clip bucket)
# ---------------------------------------------------------------------------
resource "aws_cloudfront_origin_access_control" "clip" {
  name                              = "${local.clip_bucket_name}-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                 = "always"
  signing_protocol                 = "sigv4"
}

resource "aws_cloudfront_distribution" "clip" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "CDN for ${local.clip_bucket_name}"
  default_root_object = ""
  price_class         = "PriceClass_100"

  origin {
    domain_name              = aws_s3_bucket.clip.bucket_regional_domain_name
    origin_id                 = "S3-${aws_s3_bucket.clip.id}"
    origin_access_control_id = aws_cloudfront_origin_access_control.clip.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-${aws_s3_bucket.clip.id}"
    compress               = true
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 86400
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Environment = var.environment
    Service     = "clip-package-service"
  }
}

# Allow CloudFront to read from S3
resource "aws_s3_bucket_policy" "clip" {
  bucket = aws_s3_bucket.clip.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontServicePrincipal"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.clip.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.clip.arn
          }
        }
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.clip]
}

# ---------------------------------------------------------------------------
# DynamoDB table for clip package metadata
# ---------------------------------------------------------------------------
resource "aws_dynamodb_table" "clip_packages" {
  name         = "${var.project_name}-${var.environment}-clip-packages"
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
    name = "language"
    type = "S"
  }

  attribute {
    name = "createdAt"
    type = "S"
  }

  global_secondary_index {
    name            = "language-createdAt-index"
    hash_key        = "language"
    range_key       = "createdAt"
    projection_type = "ALL"
  }

  tags = {
    Environment = var.environment
    Service     = "clip-package-service"
    Name        = "Clip Packages Table"
  }
}

# ---------------------------------------------------------------------------
# IAM role for clip-package Lambda
# ---------------------------------------------------------------------------
module "clip_package_iam_role" {
  source = "../../modules/lambda_iam_role"

  role_name = "clip-package-service-lambda-role-${var.environment}"

  dynamodb_table_arns = [
    aws_dynamodb_table.clip_packages.arn,
  ]

  tags = {
    Environment = var.environment
    Service     = "clip-package-service"
  }
}

# Optional: allow Lambda to write to clip bucket (e.g. for presigned uploads or direct put)
resource "aws_iam_role_policy" "clip_s3" {
  name   = "clip-package-s3-${var.environment}"
  role   = module.clip_package_iam_role.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:ListBucket"]
        Resource = [aws_s3_bucket.clip.arn, "${aws_s3_bucket.clip.arn}/*"]
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# Lambda (clip-package-service)
# ---------------------------------------------------------------------------
module "clip_package_service_lambda" {
  source = "../../modules/lambda"

  function_name = "clip-package-${var.environment}-service"
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 28
  filename      = abspath("${path.module}/../../../services/clip-package-service/function.zip")
  iam_role_arn  = module.clip_package_iam_role.role_arn

  environment_variables = {
    CLIP_PACKAGES_TABLE = aws_dynamodb_table.clip_packages.name
    CLIP_BUCKET_NAME    = aws_s3_bucket.clip.id
    CLIP_CDN_DOMAIN     = aws_cloudfront_distribution.clip.domain_name
    CLIP_CDN_URL        = "https://${aws_cloudfront_distribution.clip.domain_name}"
  }
}

# ---------------------------------------------------------------------------
# API Gateway: route /clip-packages to this Lambda
# ---------------------------------------------------------------------------
module "lambda_api_link" {
  source = "../../modules/lambda_api_link"

  api_gateway_id       = data.terraform_remote_state.foundation.outputs.api_gateway_id
  api_gateway_root_id  = data.terraform_remote_state.foundation.outputs.api_gateway_root_id
  lambda_function_arn  = module.clip_package_service_lambda.function_arn
  lambda_function_name = module.clip_package_service_lambda.function_name
  paths                = ["clip-packages"]
}

resource "aws_api_gateway_deployment" "deployment" {
  rest_api_id = data.terraform_remote_state.foundation.outputs.api_gateway_id

  depends_on = [module.lambda_api_link]
}

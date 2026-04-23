output "github_actions_role_arn" {
  description = "IAM role ARN to use from GitHub Actions via OIDC."
  value       = aws_iam_role.github_actions_deploy.arn
}

output "ecs_cluster_name" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.main.name
}

output "backend_service_name" {
  description = "Backend ECS service name."
  value       = aws_ecs_service.backend.name
}

output "engine_service_name" {
  description = "Conversational engine ECS service name."
  value       = aws_ecs_service.engine.name
}

output "backend_task_family" {
  description = "Backend ECS task definition family."
  value       = aws_ecs_task_definition.backend.family
}

output "engine_task_family" {
  description = "Conversational engine ECS task definition family."
  value       = aws_ecs_task_definition.engine.family
}

output "backend_ecr_repository_url" {
  description = "Backend ECR repository URL."
  value       = aws_ecr_repository.backend.repository_url
}

output "engine_ecr_repository_url" {
  description = "Conversational engine ECR repository URL."
  value       = aws_ecr_repository.engine.repository_url
}

output "admin_bucket_name" {
  description = "S3 bucket for the admin site."
  value       = aws_s3_bucket.admin.bucket
}

output "media_bucket_name" {
  description = "S3 bucket for product media."
  value       = aws_s3_bucket.media.bucket
}

output "admin_distribution_id" {
  description = "CloudFront distribution ID for admin.stockaisle.com."
  value       = aws_cloudfront_distribution.admin.id
}

output "media_distribution_id" {
  description = "CloudFront distribution ID for media.stockaisle.com."
  value       = aws_cloudfront_distribution.media.id
}

output "alb_dns_name" {
  description = "Public ALB DNS name."
  value       = aws_lb.public.dns_name
}

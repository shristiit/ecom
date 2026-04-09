variable "aws_region" {
  description = "AWS region for the production stack."
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Project slug used in naming."
  type        = string
  default     = "stockaisle"
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "prod"
}

variable "domain_name" {
  description = "Primary apex domain."
  type        = string
  default     = "stockaisle.com"
}

variable "route53_zone_name" {
  description = "Existing public hosted zone name."
  type        = string
  default     = "stockaisle.com"
}

variable "github_repository" {
  description = "GitHub repository in owner/name format for the OIDC deploy role."
  type        = string
  default     = "shristiit/ecom"
}

variable "vpc_cidr" {
  description = "CIDR block for the production VPC."
  type        = string
  default     = "10.42.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for the public subnets used by ALB and ECS tasks."
  type        = list(string)
  default     = ["10.42.0.0/24", "10.42.1.0/24"]
}

variable "backend_image_tag" {
  description = "Initial backend image tag to deploy."
  type        = string
  default     = "latest"
}

variable "engine_image_tag" {
  description = "Initial conversational-engine image tag to deploy."
  type        = string
  default     = "latest"
}

variable "backend_desired_count" {
  description = "Desired ECS task count for backend."
  type        = number
  default     = 1
}

variable "engine_desired_count" {
  description = "Desired ECS task count for conversational engine."
  type        = number
  default     = 1
}

variable "alarm_email" {
  description = "Optional email endpoint for SNS alarm subscription."
  type        = string
  default     = ""
}

variable "existing_rds_security_group_id" {
  description = "Optional existing RDS security group ID to authorize backend and engine access."
  type        = string
  default     = ""
}

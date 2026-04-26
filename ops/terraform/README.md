# StockAisle AWS Terraform

This directory provisions the production AWS footprint for StockAisle:

- VPC with 2 public subnets
- public ALB for `api.stockaisle.com` and `engine.stockaisle.com`
- ECS Fargate services for `backend` and `conversational-engine`
- ECR repositories for both containers
- S3 + CloudFront for admin, superadmin, and media delivery
- Route 53 DNS records and ACM certificate
- SSM Parameter Store entries for non-sensitive runtime config
- Secrets Manager secret containers for sensitive values
- GitHub Actions OIDC deploy role
- SNS alarms

The intended primary app region is `eu-west-2` (London). CloudFront custom-domain certificates still need to be created in `us-east-1`, which Terraform handles separately.

## Usage

```bash
cd /Users/Apple/Desktop/ecom/ops/terraform
cp terraform.tfvars.example terraform.tfvars
cp backend.hcl.example backend.hcl
terraform init -backend-config=backend.hcl
terraform plan
terraform apply
```

For shared production state, initialize with an S3 backend file instead of local state:

```bash
terraform init -backend-config=backend.hcl
```

## After First Apply

1. Populate the created Secrets Manager secrets with real values.
2. Set the existing RDS security group ID if you want Terraform to open app access to RDS.
3. Copy these Terraform outputs into GitHub repository variables:
   - `github_actions_role_arn` -> `AWS_DEPLOY_ROLE_ARN`
   - `ecs_cluster_name` -> `AWS_ECS_CLUSTER`
   - `backend_service_name` -> `AWS_BACKEND_SERVICE`
   - `engine_service_name` -> `AWS_ENGINE_SERVICE`
   - `backend_task_family` -> `AWS_BACKEND_TASK_FAMILY`
   - `engine_task_family` -> `AWS_ENGINE_TASK_FAMILY`
   - `backend_ecr_repository_url` -> `AWS_BACKEND_ECR_REPOSITORY`
   - `engine_ecr_repository_url` -> `AWS_ENGINE_ECR_REPOSITORY`
   - `admin_bucket_name` -> `AWS_ADMIN_BUCKET`
   - `admin_distribution_id` -> `AWS_ADMIN_DISTRIBUTION_ID`
   - `superadmin_bucket_name` -> `AWS_SUPERADMIN_BUCKET`
   - `superadmin_distribution_id` -> `AWS_SUPERADMIN_DISTRIBUTION_ID`
4. Set GitHub repo variables for Terraform workflow bootstrap:
   - `AWS_TERRAFORM_ROLE_ARN`
   - `TF_STATE_BUCKET`
   - `TF_STATE_LOCK_TABLE`
   - `TF_STATE_KEY`
   - `TF_STATE_REGION`
   - `AWS_VPC_ID`
   - `AWS_PUBLIC_SUBNET_IDS`
   - `AWS_RDS_SECURITY_GROUP_ID`

## Notes

- ECS services intentionally ignore later `task_definition` changes so GitHub Actions can roll out new image revisions without Terraform immediately reverting them.
- The admin site is served through CloudFront at `admin.stockaisle.com`.
- The superadmin site is served through CloudFront at `master.stockaisle.com`.
- The media bucket is private and served through CloudFront at `media.stockaisle.com`.
- Add a real `backend.hcl` from the example below before the first shared/team apply so Terraform state is stored in S3 with a DynamoDB lock table.
- The Terraform state bucket/table can live in a different region from the production app stack. Set `TF_STATE_REGION` in GitHub Actions to match the S3 bucket and DynamoDB table region.
- If you already have an RDS database inside an existing VPC, set `AWS_VPC_ID` and `AWS_PUBLIC_SUBNET_IDS` so Terraform reuses that network instead of creating a separate VPC.
- Terraform plan/apply workflows assume a separate bootstrap/admin AWS role. The deploy role output by this stack is intentionally narrower and only meant for application releases.
- For a fresh London deployment, create the database manually first in `eu-west-2`, then feed the VPC ID, public subnet IDs, and RDS security group ID into the GitHub repository variables before `Terraform Apply`.
- This branch currently leaves existing RDS security-group ingress rules unmanaged by default. If the DB rules already exist and work, Terraform will not try to recreate them.

# StockAisle AWS Deployment

This repository now includes:

- Terraform infrastructure under [`ops/terraform`](/Users/Apple/Desktop/ecom/ops/terraform)
- production GitHub Actions workflows under [`.github/workflows`](/Users/Apple/Desktop/ecom/.github/workflows)
- a static landing site package under [`landing`](/Users/Apple/Desktop/ecom/landing)
- a production Docker image for the conversational engine under [`conversational-engine/Dockerfile`](/Users/Apple/Desktop/ecom/conversational-engine/Dockerfile)

## What Gets Deployed

- `stockaisle.com` and `www.stockaisle.com`: landing site on S3 + CloudFront
- `admin.stockaisle.com`: admin web app on S3 + CloudFront
- `api.stockaisle.com`: backend on ECS Fargate behind ALB
- `engine.stockaisle.com`: conversational engine on ECS Fargate behind ALB
- `media.stockaisle.com`: private S3 media bucket behind CloudFront

## GitHub Repository Variables To Set

Set these repository variables before running the workflows:

- `AWS_TERRAFORM_ROLE_ARN`
  Pre-existing AWS role for Terraform plan/apply. This is not the same as the app deploy role and is not bootstrapped by these workflows.
- `TF_STATE_BUCKET`
  Existing S3 bucket for Terraform remote state.
- `TF_STATE_LOCK_TABLE`
  Existing DynamoDB table for Terraform state locking.
- `TF_STATE_KEY`
  Optional state key. Recommended: `prod/terraform.tfstate`.
- `TF_STATE_REGION`
  Region of the Terraform state bucket and lock table. This can differ from the production app region.
- `AWS_RDS_SECURITY_GROUP_ID`
- `AWS_ALARM_EMAIL`

Set these repository variables after the first Terraform apply:

- `AWS_DEPLOY_ROLE_ARN` from Terraform output `github_actions_role_arn`
- `AWS_ECS_CLUSTER` from Terraform output `ecs_cluster_name`
- `AWS_BACKEND_SERVICE` from Terraform output `backend_service_name`
- `AWS_ENGINE_SERVICE` from Terraform output `engine_service_name`
- `AWS_BACKEND_TASK_FAMILY` from Terraform output `backend_task_family`
- `AWS_ENGINE_TASK_FAMILY` from Terraform output `engine_task_family`
- `AWS_BACKEND_ECR_REPOSITORY` from Terraform output `backend_ecr_repository_url`
- `AWS_ENGINE_ECR_REPOSITORY` from Terraform output `engine_ecr_repository_url`
- `AWS_ADMIN_BUCKET` from Terraform output `admin_bucket_name`
- `AWS_LANDING_BUCKET` from Terraform output `landing_bucket_name`
- `AWS_ADMIN_DISTRIBUTION_ID` from Terraform output `admin_distribution_id`
- `AWS_LANDING_DISTRIBUTION_ID` from Terraform output `landing_distribution_id`

## Secrets To Populate In AWS Secrets Manager

Backend secret containers created by Terraform:

- `stockaisle/prod/backend/DATABASE_URL`
- `stockaisle/prod/backend/JWT_SECRET`
- `stockaisle/prod/backend/OPENAI_API_KEY`
- `stockaisle/prod/backend/AUTH0_CLIENT_SECRET`
- `stockaisle/prod/backend/SSO_GOOGLE_CLIENT_SECRET`
- `stockaisle/prod/backend/SSO_AZUREAD_CLIENT_SECRET`

Conversational engine secret containers created by Terraform:

- `stockaisle/prod/engine/CONVERSATIONAL_ENGINE_DATABASE_URL`
- `stockaisle/prod/engine/CONVERSATIONAL_ENGINE_LLM_API_KEY`
- `stockaisle/prod/engine/CONVERSATIONAL_ENGINE_DEEPSEEK_API_KEY`

Rotate the currently exposed AI provider keys before go-live.

## Workflow Split

- `Deploy Production`: auto-runs on `master` branch pushes and can also be started manually.
  It now registers a new task definition revision, runs one-off ECS migrations with that exact image, and only then updates the ECS service.
- `Terraform Plan`: manual infrastructure plan.
- `Terraform Apply`: manual infrastructure apply.

## Recommended Order

1. Create the Route 53 public hosted zone for `stockaisle.com`.
2. Copy all currently active DNS records from GoDaddy into Route 53 before changing nameservers.
3. Create the Terraform remote-state S3 bucket and DynamoDB lock table.
4. Create or identify an AWS admin/bootstrap role and set `AWS_TERRAFORM_ROLE_ARN`.
5. Set the GitHub bootstrap variables, including `TF_STATE_REGION`.
6. Point the domain nameservers in GoDaddy to the Route 53 hosted zone.
7. Run `Terraform Apply`.
8. Populate Secrets Manager values.
9. Copy Terraform outputs into GitHub repository variables.
10. Run `Deploy Production` manually once.

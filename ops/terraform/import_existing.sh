#!/usr/bin/env bash

set -euo pipefail

project="${TF_VAR_project:-stockaisle}"
environment="${TF_VAR_environment:-prod}"
vpc_id="${TF_VAR_existing_vpc_id:-}"
account_id="$(aws sts get-caller-identity --query 'Account' --output text)"

name_prefix="${project}-${environment}"
namespace_name="stockaisle.local"

backend_repo="${project}/backend"
engine_repo="${project}/conversational-engine"

backend_log_group="/aws/ecs/${name_prefix}-backend"
engine_log_group="/aws/ecs/${name_prefix}-engine"

landing_bucket="${name_prefix}-landing-${account_id}"
admin_bucket="${name_prefix}-admin-${account_id}"
media_bucket="${name_prefix}-media-${account_id}"

alb_name="${name_prefix}-alb"
backend_tg_name="${name_prefix}-backend"
engine_tg_name="${name_prefix}-engine"
oac_name="${name_prefix}-s3"

backend_secret_names=(
  "DATABASE_URL"
  "JWT_SECRET"
  "OPENAI_API_KEY"
  "AUTH0_CLIENT_SECRET"
  "SSO_GOOGLE_CLIENT_SECRET"
  "SSO_AZUREAD_CLIENT_SECRET"
)

engine_secret_names=(
  "CONVERSATIONAL_ENGINE_DATABASE_URL"
  "CONVERSATIONAL_ENGINE_LLM_API_KEY"
  "CONVERSATIONAL_ENGINE_DEEPSEEK_API_KEY"
)

normalize_id() {
  local value="${1:-}"

  if [[ "$value" == "None" || "$value" == "null" ]]; then
    return 1
  fi

  if [[ -z "$value" ]]; then
    return 1
  fi

  printf '%s\n' "$value"
}

state_has() {
  local address="$1"
  terraform state show "$address" >/dev/null 2>&1
}

import_if_present() {
  local address="$1"
  local import_id="$2"

  if state_has "$address"; then
    echo "Terraform state already has ${address}"
    return 0
  fi

  if ! normalize_id "$import_id" >/dev/null; then
    echo "Skipping ${address}; no existing AWS resource found"
    return 0
  fi

  echo "Importing ${address}"
  terraform import -input=false "$address" "$import_id"
}

describe_secret_arn() {
  local secret_name="$1"
  aws secretsmanager describe-secret \
    --secret-id "$secret_name" \
    --query 'ARN' \
    --output text 2>/dev/null || true
}

describe_security_group_id() {
  local group_name="$1"

  aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=${group_name}" "Name=vpc-id,Values=${vpc_id}" \
    --query 'SecurityGroups[0].GroupId' \
    --output text 2>/dev/null || true
}

describe_load_balancer_arn() {
  local name="$1"

  aws elbv2 describe-load-balancers \
    --names "$name" \
    --query 'LoadBalancers[0].LoadBalancerArn' \
    --output text 2>/dev/null || true
}

describe_target_group_arn() {
  local name="$1"

  aws elbv2 describe-target-groups \
    --names "$name" \
    --query 'TargetGroups[0].TargetGroupArn' \
    --output text 2>/dev/null || true
}

describe_log_group_name() {
  local name="$1"

  aws logs describe-log-groups \
    --log-group-name-prefix "$name" \
    --query "logGroups[?logGroupName=='${name}'].logGroupName | [0]" \
    --output text 2>/dev/null || true
}

describe_bucket_name() {
  local name="$1"

  if aws s3api head-bucket --bucket "$name" >/dev/null 2>&1; then
    printf '%s\n' "$name"
  fi
}

describe_oac_id() {
  aws cloudfront list-origin-access-controls \
    --query "OriginAccessControlList.Items[?Name=='${oac_name}'].Id | [0]" \
    --output text 2>/dev/null || true
}

describe_iam_policy_arn() {
  local policy_name="$1"

  aws iam list-policies \
    --scope Local \
    --query "Policies[?PolicyName=='${policy_name}'].Arn | [0]" \
    --output text 2>/dev/null || true
}

describe_namespace_id() {
  aws servicediscovery list-namespaces \
    --query "Namespaces[?Name=='${namespace_name}'].Id | [0]" \
    --output text 2>/dev/null || true
}

describe_service_id() {
  local namespace_id="$1"
  local service_name="$2"

  aws servicediscovery list-services \
    --query "Services[?Name=='${service_name}' && NamespaceId=='${namespace_id}'].Id | [0]" \
    --output text 2>/dev/null || true
}

echo "Importing brownfield resources into Terraform state when they already exist in AWS"

import_if_present 'aws_ecr_repository.backend' "$backend_repo"
import_if_present 'aws_ecr_repository.engine' "$engine_repo"

import_if_present 'aws_cloudwatch_log_group.backend' "$(describe_log_group_name "$backend_log_group")"
import_if_present 'aws_cloudwatch_log_group.engine' "$(describe_log_group_name "$engine_log_group")"

for secret_name in "${backend_secret_names[@]}"; do
  import_if_present \
    "aws_secretsmanager_secret.backend[\"${secret_name}\"]" \
    "$(describe_secret_arn "${project}/${environment}/backend/${secret_name}")"
done

for secret_name in "${engine_secret_names[@]}"; do
  import_if_present \
    "aws_secretsmanager_secret.engine[\"${secret_name}\"]" \
    "$(describe_secret_arn "${project}/${environment}/engine/${secret_name}")"
done

if [[ -n "$vpc_id" ]]; then
  import_if_present 'aws_security_group.alb' "$(describe_security_group_id "${name_prefix}-alb")"
  import_if_present 'aws_security_group.backend' "$(describe_security_group_id "${name_prefix}-backend")"
  import_if_present 'aws_security_group.engine' "$(describe_security_group_id "${name_prefix}-engine")"
fi

import_if_present 'aws_lb.public' "$(describe_load_balancer_arn "$alb_name")"
import_if_present 'aws_lb_target_group.backend' "$(describe_target_group_arn "$backend_tg_name")"
import_if_present 'aws_lb_target_group.engine' "$(describe_target_group_arn "$engine_tg_name")"

import_if_present 'aws_s3_bucket.landing' "$(describe_bucket_name "$landing_bucket")"
import_if_present 'aws_s3_bucket.admin' "$(describe_bucket_name "$admin_bucket")"
import_if_present 'aws_s3_bucket.media' "$(describe_bucket_name "$media_bucket")"

import_if_present 'aws_cloudfront_origin_access_control.s3' "$(describe_oac_id)"

import_if_present 'aws_iam_role.ecs_task_execution' "${name_prefix}-ecs-execution"
import_if_present 'aws_iam_role.backend_task' "${name_prefix}-backend-task"
import_if_present 'aws_iam_role.engine_task' "${name_prefix}-engine-task"
import_if_present 'aws_iam_role.github_actions_deploy' "${name_prefix}-github-actions-deploy"
import_if_present 'aws_iam_policy.ecs_execution_config_access' "$(describe_iam_policy_arn "${name_prefix}-ecs-config-access")"

namespace_id="$(describe_namespace_id)"
import_if_present 'aws_service_discovery_private_dns_namespace.main' "$namespace_id"

if normalize_id "$namespace_id" >/dev/null; then
  import_if_present \
    'aws_service_discovery_service.engine' \
    "$(describe_service_id "$namespace_id" "conversational-engine")"
fi

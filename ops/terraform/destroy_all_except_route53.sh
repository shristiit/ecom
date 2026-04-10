#!/usr/bin/env bash

set -euo pipefail

project="${TF_VAR_project:-stockaisle}"
environment="${TF_VAR_environment:-prod}"
domain_name="${TF_VAR_domain_name:-stockaisle.com}"
vpc_id="${TF_VAR_existing_vpc_id:-}"
rds_security_group_id="${TF_VAR_existing_rds_security_group_id:-}"
account_id="$(aws sts get-caller-identity --query 'Account' --output text)"

name_prefix="${project}-${environment}"
namespace_name="svc.stockaisle.internal"

public_domain="${domain_name}"
www_domain="www.${domain_name}"
admin_domain="admin.${domain_name}"
api_domain="api.${domain_name}"
engine_domain="engine.${domain_name}"
media_domain="media.${domain_name}"

backend_repo="${project}/backend"
engine_repo="${project}/conversational-engine"

landing_bucket="${name_prefix}-landing-${account_id}"
admin_bucket="${name_prefix}-admin-${account_id}"
media_bucket="${name_prefix}-media-${account_id}"

alb_name="${name_prefix}-alb"
backend_tg_name="${name_prefix}-backend"
engine_tg_name="${name_prefix}-engine"
backend_service_name="${name_prefix}-backend"
engine_service_name="${name_prefix}-engine"
cluster_name="${name_prefix}-cluster"
backend_family="${name_prefix}-backend"
engine_family="${name_prefix}-engine"
oac_name="${name_prefix}-s3"

normalize_id() {
  local value="${1:-}"

  if [[ -z "$value" || "$value" == "None" || "$value" == "null" ]]; then
    return 1
  fi

  printf '%s\n' "$value"
}

log() {
  printf '\n[%s] %s\n' "$(date '+%H:%M:%S')" "$1"
}

describe_security_group_id() {
  local group_name="$1"

  aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=${group_name}" "Name=vpc-id,Values=${vpc_id}" \
    --query 'SecurityGroups[0].GroupId' \
    --output text 2>/dev/null || true
}

describe_load_balancer_arn() {
  aws elbv2 describe-load-balancers \
    --names "$alb_name" \
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

describe_listener_arns() {
  local load_balancer_arn="$1"

  aws elbv2 describe-listeners \
    --load-balancer-arn "$load_balancer_arn" \
    --query 'Listeners[].ListenerArn' \
    --output text 2>/dev/null || true
}

describe_distribution_id_by_alias() {
  local alias="$1"

  aws cloudfront list-distributions \
    --query "DistributionList.Items[?Aliases.Quantity > \`0\` && contains(Aliases.Items, '${alias}')].Id | [0]" \
    --output text 2>/dev/null || true
}

describe_oac_id() {
  aws cloudfront list-origin-access-controls \
    --query "OriginAccessControlList.Items[?Name=='${oac_name}'].Id | [0]" \
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
  local service_id=""

  service_id="$(
    aws servicediscovery list-services \
      --query "Services[?Name=='${service_name}' && NamespaceId=='${namespace_id}'].Id | [0]" \
      --output text 2>/dev/null || true
  )"

  if ! normalize_id "$service_id" >/dev/null; then
    service_id="$(
      aws servicediscovery list-services \
        --query "Services[?Name=='${service_name}'].Id | [0]" \
        --output text 2>/dev/null || true
    )"
  fi

  printf '%s\n' "$service_id"
}

delete_cloudfront_distribution_by_alias() {
  local alias="$1"
  local id=""
  local tmp=""
  local etag=""
  local new_etag=""

  id="$(describe_distribution_id_by_alias "$alias")"
  if ! normalize_id "$id" >/dev/null; then
    log "CloudFront distribution for ${alias} not found"
    return 0
  fi

  log "Deleting CloudFront distribution ${id} for alias ${alias}"

  tmp="$(mktemp)"
  aws cloudfront get-distribution-config --id "$id" > "$tmp"
  etag="$(jq -r '.ETag' "$tmp")"
  jq '.DistributionConfig.Enabled = false' "$tmp" > "${tmp}.config"
  aws cloudfront update-distribution \
    --id "$id" \
    --if-match "$etag" \
    --distribution-config "file://${tmp}.config" >/dev/null
  aws cloudfront wait distribution-deployed --id "$id"

  aws cloudfront get-distribution-config --id "$id" > "$tmp"
  new_etag="$(jq -r '.ETag' "$tmp")"
  aws cloudfront delete-distribution --id "$id" --if-match "$new_etag" >/dev/null

  rm -f "$tmp" "${tmp}.config"
}

delete_bucket() {
  local bucket="$1"
  local versions_json=""
  local delete_json=""
  local object_count=""

  if ! aws s3api head-bucket --bucket "$bucket" >/dev/null 2>&1; then
    log "S3 bucket ${bucket} not found"
    return 0
  fi

  log "Deleting S3 bucket ${bucket}"

  while true; do
    versions_json="$(aws s3api list-object-versions --bucket "$bucket" --output json 2>/dev/null || true)"
    object_count="$(jq '((.Versions // []) | length) + ((.DeleteMarkers // []) | length)' <<<"$versions_json")"

    if [[ "$object_count" == "0" ]]; then
      break
    fi

    delete_json="$(jq -c '{Objects: (((.Versions // []) | map({Key, VersionId})) + ((.DeleteMarkers // []) | map({Key, VersionId}))), Quiet: true}' <<<"$versions_json")"
    aws s3api delete-objects --bucket "$bucket" --delete "$delete_json" >/dev/null
  done

  aws s3 rm "s3://${bucket}" --recursive >/dev/null 2>&1 || true
  aws s3api delete-bucket --bucket "$bucket" >/dev/null
}

delete_ssm_parameters() {
  local names=""

  names="$(
    aws ssm describe-parameters \
      --parameter-filters "Key=Name,Option=BeginsWith,Values=/${project}/${environment}/" \
      --query 'Parameters[].Name' \
      --output text 2>/dev/null || true
  )"

  if ! normalize_id "$names" >/dev/null; then
    log "No SSM parameters found under /${project}/${environment}/"
    return 0
  fi

  log "Deleting SSM parameters under /${project}/${environment}/"
  read -r -a name_array <<<"$names"
  while ((${#name_array[@]} > 0)); do
    aws ssm delete-parameters --names "${name_array[@]:0:10}" >/dev/null
    name_array=("${name_array[@]:10}")
  done
}

delete_secrets() {
  local names=""

  names="$(
    aws secretsmanager list-secrets \
      --query "SecretList[?starts_with(Name, '${project}/${environment}/')].Name" \
      --output text 2>/dev/null || true
  )"

  if ! normalize_id "$names" >/dev/null; then
    log "No Secrets Manager secrets found under ${project}/${environment}/"
    return 0
  fi

  log "Deleting Secrets Manager secrets under ${project}/${environment}/"
  while IFS=$'\t' read -r -a secret_row; do
    for secret_name in "${secret_row[@]}"; do
      aws secretsmanager delete-secret \
        --secret-id "$secret_name" \
        --force-delete-without-recovery >/dev/null || true
    done
  done <<<"$names"
}

delete_service_scaling() {
  local service_name="$1"
  local policy_name="$2"
  local resource_id="service/${cluster_name}/${service_name}"

  aws application-autoscaling delete-scaling-policy \
    --service-namespace ecs \
    --scalable-dimension ecs:service:DesiredCount \
    --resource-id "$resource_id" \
    --policy-name "$policy_name" >/dev/null 2>&1 || true

  aws application-autoscaling deregister-scalable-target \
    --service-namespace ecs \
    --scalable-dimension ecs:service:DesiredCount \
    --resource-id "$resource_id" >/dev/null 2>&1 || true
}

delete_ecs_service() {
  local service_name="$1"

  aws ecs update-service \
    --cluster "$cluster_name" \
    --service "$service_name" \
    --desired-count 0 >/dev/null 2>&1 || true

  aws ecs delete-service \
    --cluster "$cluster_name" \
    --service "$service_name" \
    --force >/dev/null 2>&1 || true

  aws ecs wait services-inactive \
    --cluster "$cluster_name" \
    --services "$service_name" >/dev/null 2>&1 || true
}

delete_task_definition_family() {
  local family="$1"
  local task_arns=""

  task_arns="$(
    aws ecs list-task-definitions \
      --family-prefix "$family" \
      --status ACTIVE \
      --query 'taskDefinitionArns' \
      --output text 2>/dev/null || true
  )"

  if ! normalize_id "$task_arns" >/dev/null; then
    return 0
  fi

  while IFS=$'\t' read -r -a arn_row; do
    for task_arn in "${arn_row[@]}"; do
      aws ecs deregister-task-definition --task-definition "$task_arn" >/dev/null || true
    done
  done <<<"$task_arns"
}

delete_service_discovery() {
  local namespace_id=""
  local service_id=""
  local operation_id=""
  local status=""

  namespace_id="$(describe_namespace_id)"
  if ! normalize_id "$namespace_id" >/dev/null; then
    log "Cloud Map namespace ${namespace_name} not found"
    return 0
  fi

  service_id="$(describe_service_id "$namespace_id" "conversational-engine")"
  if normalize_id "$service_id" >/dev/null; then
    log "Deleting Cloud Map service ${service_id}"
    aws servicediscovery delete-service --id "$service_id" >/dev/null 2>&1 || true
  fi

  log "Deleting Cloud Map namespace ${namespace_id}"
  operation_id="$(aws servicediscovery delete-namespace --id "$namespace_id" --query 'OperationId' --output text 2>/dev/null || true)"
  if normalize_id "$operation_id" >/dev/null; then
    for _ in $(seq 1 60); do
      status="$(aws servicediscovery get-operation --operation-id "$operation_id" --query 'Operation.Status' --output text 2>/dev/null || true)"
      if [[ "$status" == "SUCCESS" ]]; then
        return 0
      fi
      if [[ "$status" == "FAIL" ]]; then
        log "Cloud Map namespace delete reported FAIL"
        return 1
      fi
      sleep 5
    done
  fi
}

delete_alb_stack() {
  local load_balancer_arn=""
  local listener_arns=""
  local backend_tg_arn=""
  local engine_tg_arn=""

  load_balancer_arn="$(describe_load_balancer_arn)"
  backend_tg_arn="$(describe_target_group_arn "$backend_tg_name")"
  engine_tg_arn="$(describe_target_group_arn "$engine_tg_name")"

  if normalize_id "$load_balancer_arn" >/dev/null; then
    log "Deleting ALB listeners for ${alb_name}"
    listener_arns="$(describe_listener_arns "$load_balancer_arn")"
    if normalize_id "$listener_arns" >/dev/null; then
      while IFS=$'\t' read -r -a listener_row; do
        for listener_arn in "${listener_row[@]}"; do
          aws elbv2 delete-listener --listener-arn "$listener_arn" >/dev/null 2>&1 || true
        done
      done <<<"$listener_arns"
    fi

    log "Deleting ALB ${alb_name}"
    aws elbv2 delete-load-balancer --load-balancer-arn "$load_balancer_arn" >/dev/null || true
    aws elbv2 wait load-balancers-deleted --load-balancer-arns "$load_balancer_arn" >/dev/null 2>&1 || true
  fi

  if normalize_id "$backend_tg_arn" >/dev/null; then
    aws elbv2 delete-target-group --target-group-arn "$backend_tg_arn" >/dev/null 2>&1 || true
  fi

  if normalize_id "$engine_tg_arn" >/dev/null; then
    aws elbv2 delete-target-group --target-group-arn "$engine_tg_arn" >/dev/null 2>&1 || true
  fi
}

delete_log_group() {
  local name="$1"
  aws logs delete-log-group --log-group-name "$name" >/dev/null 2>&1 || true
}

delete_ecr_repo() {
  local name="$1"
  aws ecr delete-repository --repository-name "$name" --force >/dev/null 2>&1 || true
}

delete_acm_certs() {
  local cert_arns=""

  cert_arns="$(
    aws acm list-certificates \
      --certificate-statuses ISSUED PENDING_VALIDATION INACTIVE EXPIRED VALIDATION_TIMED_OUT FAILED REVOKED \
      --query "CertificateSummaryList[?DomainName=='${public_domain}' || DomainName=='${www_domain}' || DomainName=='${admin_domain}' || DomainName=='${api_domain}' || DomainName=='${engine_domain}' || DomainName=='${media_domain}'].CertificateArn" \
      --output text 2>/dev/null || true
  )"

  if ! normalize_id "$cert_arns" >/dev/null; then
    log "No ACM certificates found for ${domain_name}"
    return 0
  fi

  log "Deleting ACM certificates"
  while IFS=$'\t' read -r -a cert_row; do
    for cert_arn in "${cert_row[@]}"; do
      aws acm delete-certificate --certificate-arn "$cert_arn" >/dev/null 2>&1 || true
    done
  done <<<"$cert_arns"
}

delete_oac() {
  local oac_id=""
  local etag=""

  oac_id="$(describe_oac_id)"
  if ! normalize_id "$oac_id" >/dev/null; then
    return 0
  fi

  etag="$(aws cloudfront get-origin-access-control --id "$oac_id" --query 'ETag' --output text 2>/dev/null || true)"
  if normalize_id "$etag" >/dev/null; then
    aws cloudfront delete-origin-access-control --id "$oac_id" --if-match "$etag" >/dev/null 2>&1 || true
  fi
}

delete_alarms_and_topic() {
  aws cloudwatch delete-alarms \
    --alarm-names \
    "${name_prefix}-backend-cpu-high" \
    "${name_prefix}-engine-cpu-high" \
    "${name_prefix}-alb-5xx" >/dev/null 2>&1 || true

  local topic_arn=""
  topic_arn="$(aws sns list-topics --query "Topics[?ends_with(TopicArn, ':${name_prefix}-alerts')].TopicArn | [0]" --output text 2>/dev/null || true)"
  if normalize_id "$topic_arn" >/dev/null; then
    aws sns delete-topic --topic-arn "$topic_arn" >/dev/null 2>&1 || true
  fi
}

delete_iam() {
  aws iam detach-role-policy \
    --role-name "${name_prefix}-ecs-execution" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy >/dev/null 2>&1 || true

  aws iam detach-role-policy \
    --role-name "${name_prefix}-ecs-execution" \
    --policy-arn "arn:aws:iam::${account_id}:policy/${name_prefix}-ecs-config-access" >/dev/null 2>&1 || true

  aws iam delete-role-policy \
    --role-name "${name_prefix}-backend-task" \
    --policy-name "${name_prefix}-backend-media" >/dev/null 2>&1 || true

  aws iam detach-role-policy \
    --role-name "${name_prefix}-github-actions-deploy" \
    --policy-arn "arn:aws:iam::${account_id}:policy/${name_prefix}-github-actions-deploy" >/dev/null 2>&1 || true

  aws iam delete-role --role-name "${name_prefix}-backend-task" >/dev/null 2>&1 || true
  aws iam delete-role --role-name "${name_prefix}-engine-task" >/dev/null 2>&1 || true
  aws iam delete-role --role-name "${name_prefix}-ecs-execution" >/dev/null 2>&1 || true
  aws iam delete-role --role-name "${name_prefix}-github-actions-deploy" >/dev/null 2>&1 || true

  aws iam delete-policy --policy-arn "arn:aws:iam::${account_id}:policy/${name_prefix}-ecs-config-access" >/dev/null 2>&1 || true
  aws iam delete-policy --policy-arn "arn:aws:iam::${account_id}:policy/${name_prefix}-github-actions-deploy" >/dev/null 2>&1 || true
}

delete_rds() {
  local cluster_ids=""
  local standalone_instance_ids=""
  local cluster_instance_ids=""

  if ! normalize_id "$rds_security_group_id" >/dev/null; then
    log "No existing RDS security group configured; skipping RDS deletion"
    return 0
  fi

  log "Deleting RDS resources attached to ${rds_security_group_id}"

  cluster_ids="$(
    aws rds describe-db-clusters \
      --query "DBClusters[?contains(VpcSecurityGroups[].VpcSecurityGroupId, '${rds_security_group_id}')].DBClusterIdentifier" \
      --output text 2>/dev/null || true
  )"

  if normalize_id "$cluster_ids" >/dev/null; then
    while IFS=$'\t' read -r -a cluster_row; do
      for cluster_id in "${cluster_row[@]}"; do
        cluster_instance_ids="$(
          aws rds describe-db-instances \
            --query "DBInstances[?DBClusterIdentifier=='${cluster_id}'].DBInstanceIdentifier" \
            --output text 2>/dev/null || true
        )"

        if normalize_id "$cluster_instance_ids" >/dev/null; then
          while IFS=$'\t' read -r -a instance_row; do
            for instance_id in "${instance_row[@]}"; do
              aws rds delete-db-instance \
                --db-instance-identifier "$instance_id" \
                --skip-final-snapshot \
                --delete-automated-backups >/dev/null 2>&1 || true
            done
          done <<<"$cluster_instance_ids"

          while IFS=$'\t' read -r -a instance_row; do
            for instance_id in "${instance_row[@]}"; do
              aws rds wait db-instance-deleted --db-instance-identifier "$instance_id" >/dev/null 2>&1 || true
            done
          done <<<"$cluster_instance_ids"
        fi

        aws rds delete-db-cluster \
          --db-cluster-identifier "$cluster_id" \
          --skip-final-snapshot >/dev/null 2>&1 || true
        aws rds wait db-cluster-deleted --db-cluster-identifier "$cluster_id" >/dev/null 2>&1 || true
      done
    done <<<"$cluster_ids"
  fi

  standalone_instance_ids="$(
    aws rds describe-db-instances \
      --query "DBInstances[?DBClusterIdentifier==\`null\` && contains(VpcSecurityGroups[].VpcSecurityGroupId, '${rds_security_group_id}')].DBInstanceIdentifier" \
      --output text 2>/dev/null || true
  )"

  if normalize_id "$standalone_instance_ids" >/dev/null; then
    while IFS=$'\t' read -r -a instance_row; do
      for instance_id in "${instance_row[@]}"; do
        aws rds delete-db-instance \
          --db-instance-identifier "$instance_id" \
          --skip-final-snapshot \
          --delete-automated-backups >/dev/null 2>&1 || true
      done
    done <<<"$standalone_instance_ids"

    while IFS=$'\t' read -r -a instance_row; do
      for instance_id in "${instance_row[@]}"; do
        aws rds wait db-instance-deleted --db-instance-identifier "$instance_id" >/dev/null 2>&1 || true
      done
    done <<<"$standalone_instance_ids"
  fi

  aws ec2 delete-security-group --group-id "$rds_security_group_id" >/dev/null 2>&1 || true
}

delete_app_security_groups() {
  local sg_id=""

  for group_name in "${name_prefix}-backend" "${name_prefix}-engine" "${name_prefix}-alb"; do
    sg_id="$(describe_security_group_id "$group_name")"
    if normalize_id "$sg_id" >/dev/null; then
      aws ec2 delete-security-group --group-id "$sg_id" >/dev/null 2>&1 || true
    fi
  done
}

log "Starting full stockaisle teardown while keeping Route53 resources"

delete_service_scaling "$backend_service_name" "${name_prefix}-backend-cpu"
delete_service_scaling "$engine_service_name" "${name_prefix}-engine-cpu"

delete_ecs_service "$backend_service_name"
delete_ecs_service "$engine_service_name"

delete_service_discovery

delete_alb_stack

delete_cloudfront_distribution_by_alias "$public_domain"
delete_cloudfront_distribution_by_alias "$admin_domain"
delete_cloudfront_distribution_by_alias "$media_domain"

delete_bucket "$landing_bucket"
delete_bucket "$admin_bucket"
delete_bucket "$media_bucket"

delete_oac

delete_ecr_repo "$backend_repo"
delete_ecr_repo "$engine_repo"

delete_task_definition_family "$backend_family"
delete_task_definition_family "$engine_family"
aws ecs delete-cluster --cluster "$cluster_name" >/dev/null 2>&1 || true

delete_log_group "/aws/ecs/${name_prefix}-backend"
delete_log_group "/aws/ecs/${name_prefix}-engine"

delete_ssm_parameters
delete_secrets
delete_alarms_and_topic
delete_acm_certs
delete_iam
delete_rds
delete_app_security_groups

log "Teardown completed. Route53 resources were intentionally left untouched."

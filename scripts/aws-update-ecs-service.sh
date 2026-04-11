#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "Usage: $0 <cluster> <service> <task-definition-arn>"
  exit 1
fi

CLUSTER="$1"
SERVICE="$2"
TASK_DEFINITION_ARN="$3"

print_service_diagnostics() {
  local service_json
  local container_name
  local log_group
  local log_prefix
  local task_arns
  local described_tasks
  local stream_names

  service_json="$(aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICE")"

  echo "--- ECS service summary ---" >&2
  jq -r '
    .services[0]
    | {
        status,
        desiredCount,
        runningCount,
        pendingCount,
        taskDefinition,
        deployments: [.deployments[] | {status, rolloutState, desiredCount, runningCount, pendingCount, taskDefinition}]
      }
  ' <<<"$service_json" >&2

  echo "--- ECS recent service events ---" >&2
  jq -r '.services[0].events[:10][] | "[\(.createdAt)] \(.message)"' <<<"$service_json" >&2 || true

  container_name="$(
    jq -r '.services[0].loadBalancers[0].containerName // empty' <<<"$service_json"
  )"
  if [ -z "$container_name" ]; then
    container_name="$(
      aws ecs describe-task-definition \
        --task-definition "$TASK_DEFINITION_ARN" \
        --query 'taskDefinition.containerDefinitions[0].name' \
        --output text 2>/dev/null || true
    )"
  fi

  log_group="$(
    aws ecs describe-task-definition \
      --task-definition "$TASK_DEFINITION_ARN" \
      --query "taskDefinition.containerDefinitions[?name=='${container_name}'].logConfiguration.options.\"awslogs-group\" | [0]" \
      --output text 2>/dev/null || true
  )"
  log_prefix="$(
    aws ecs describe-task-definition \
      --task-definition "$TASK_DEFINITION_ARN" \
      --query "taskDefinition.containerDefinitions[?name=='${container_name}'].logConfiguration.options.\"awslogs-stream-prefix\" | [0]" \
      --output text 2>/dev/null || true
  )"

  task_arns="$(
    {
      aws ecs list-tasks --cluster "$CLUSTER" --service-name "$SERVICE" --desired-status RUNNING --query 'taskArns' --output text
      aws ecs list-tasks --cluster "$CLUSTER" --service-name "$SERVICE" --desired-status STOPPED --query 'taskArns' --output text
    } | tr '\t' '\n' | awk 'NF' | head -n 6
  )"

  if [ -z "$task_arns" ]; then
    return 0
  fi

  described_tasks="$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks $task_arns)"

  echo "--- ECS task summary ---" >&2
  jq -r '
    .tasks[]
    | {
        taskArn,
        lastStatus,
        desiredStatus,
        healthStatus,
        stopCode,
        stoppedReason,
        containers: [.containers[] | {name, lastStatus, exitCode, reason, healthStatus}]
      }
  ' <<<"$described_tasks" >&2

  if [ -z "$log_group" ] || [ "$log_group" = "None" ] || [ -z "$log_prefix" ] || [ "$log_prefix" = "None" ] || [ -z "$container_name" ]; then
    return 0
  fi

  while IFS= read -r task_arn; do
    local task_id
    task_id="$(awk -F'/' '{print $NF}' <<<"$task_arn")"
    [ -n "$task_id" ] || continue

    stream_names="$(
      aws logs describe-log-streams \
        --log-group-name "$log_group" \
        --log-stream-name-prefix "${log_prefix}/" \
        --query "logStreams[?contains(logStreamName, '${task_id}')].logStreamName" \
        --output text 2>/dev/null || true
    )"

    while IFS= read -r stream_name; do
      [ -n "$stream_name" ] || continue
      echo "--- CloudWatch logs: ${log_group} / ${stream_name} ---" >&2
      aws logs get-log-events \
        --log-group-name "$log_group" \
        --log-stream-name "$stream_name" \
        --limit 200 \
        --query 'events[].message' \
        --output text \
        >&2 2>/dev/null || true
      echo "--- end logs ---" >&2
    done <<<"$(printf '%s\n' "$stream_names" | tr '\t' '\n')"
  done <<<"$task_arns"
}

aws ecs update-service \
  --cluster "$CLUSTER" \
  --service "$SERVICE" \
  --task-definition "$TASK_DEFINITION_ARN" \
  --force-new-deployment \
  > /dev/null

if ! aws ecs wait services-stable \
  --cluster "$CLUSTER" \
  --services "$SERVICE"; then
  print_service_diagnostics
  exit 1
fi

echo "Updated ${SERVICE} to ${TASK_DEFINITION_ARN}"

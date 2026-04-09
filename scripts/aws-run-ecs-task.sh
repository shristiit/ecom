#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 5 ]; then
  echo "Usage: $0 <cluster> <service> <task-definition-arn> <container-name> <command...>"
  exit 1
fi

CLUSTER="$1"
SERVICE="$2"
TASK_DEFINITION_ARN="$3"
CONTAINER_NAME="$4"
shift 4

SERVICE_JSON="$(aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICE")"
FAILURE_COUNT="$(jq -r '.failures | length' <<<"$SERVICE_JSON")"
if [ "$FAILURE_COUNT" != "0" ]; then
  jq -r '.failures[] | "\(.arn): \(.reason)"' <<<"$SERVICE_JSON" >&2
  exit 1
fi

SUBNETS_JSON="$(jq -c '.services[0].networkConfiguration.awsvpcConfiguration.subnets' <<<"$SERVICE_JSON")"
SECURITY_GROUPS_JSON="$(jq -c '.services[0].networkConfiguration.awsvpcConfiguration.securityGroups' <<<"$SERVICE_JSON")"
ASSIGN_PUBLIC_IP="$(jq -r '.services[0].networkConfiguration.awsvpcConfiguration.assignPublicIp // "DISABLED"' <<<"$SERVICE_JSON")"
LAUNCH_TYPE="$(jq -r '.services[0].launchType // "FARGATE"' <<<"$SERVICE_JSON")"
PLATFORM_VERSION="$(jq -r '.services[0].platformVersion // empty' <<<"$SERVICE_JSON")"

COMMAND_JSON="$(printf '%s\n' "$@" | jq -R . | jq -cs .)"
NETWORK_CONFIGURATION_JSON="$(
  jq -nc \
    --argjson subnets "$SUBNETS_JSON" \
    --argjson security_groups "$SECURITY_GROUPS_JSON" \
    --arg assign_public_ip "$ASSIGN_PUBLIC_IP" \
    '{awsvpcConfiguration:{subnets:$subnets,securityGroups:$security_groups,assignPublicIp:$assign_public_ip}}'
)"
OVERRIDES_JSON="$(
  jq -nc \
    --arg container_name "$CONTAINER_NAME" \
    --argjson command "$COMMAND_JSON" \
    '{containerOverrides:[{name:$container_name,command:$command}]}'
)"

RUN_ARGS=(
  ecs run-task
  --cluster "$CLUSTER"
  --task-definition "$TASK_DEFINITION_ARN"
  --launch-type "$LAUNCH_TYPE"
  --network-configuration "$NETWORK_CONFIGURATION_JSON"
  --overrides "$OVERRIDES_JSON"
  --count 1
  --started-by "github-actions-migration"
)

if [ -n "$PLATFORM_VERSION" ]; then
  RUN_ARGS+=(--platform-version "$PLATFORM_VERSION")
fi

RUN_OUTPUT="$(aws "${RUN_ARGS[@]}")"

TASK_ARN="$(jq -r '.tasks[0].taskArn // empty' <<<"$RUN_OUTPUT")"
if [ -z "$TASK_ARN" ]; then
  echo "Failed to start migration task" >&2
  echo "$RUN_OUTPUT" >&2
  exit 1
fi

aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$TASK_ARN"

TASK_OUTPUT="$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK_ARN")"
EXIT_CODE="$(
  jq -r \
    --arg container_name "$CONTAINER_NAME" \
    '.tasks[0].containers[] | select(.name == $container_name) | (.exitCode // "")' \
    <<<"$TASK_OUTPUT"
)"
STOPPED_REASON="$(jq -r '.tasks[0].stoppedReason // ""' <<<"$TASK_OUTPUT")"
CONTAINER_REASON="$(
  jq -r \
    --arg container_name "$CONTAINER_NAME" \
    '.tasks[0].containers[] | select(.name == $container_name) | (.reason // "")' \
    <<<"$TASK_OUTPUT"
)"

if [ -z "$EXIT_CODE" ] || [ "$EXIT_CODE" != "0" ]; then
  echo "Task ${TASK_ARN} failed. stoppedReason=${STOPPED_REASON} containerReason=${CONTAINER_REASON} exitCode=${EXIT_CODE}" >&2
  exit 1
fi

echo "Task ${TASK_ARN} completed successfully"

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

print_task_logs() {
  local task_output="$1"
  local task_id
  local log_group
  local log_prefix
  local log_stream
  local stream_names
  local attempt
  local describe_streams_output
  local describe_streams_status
  local get_events_status

  task_id="$(jq -r '.tasks[0].taskArn // ""' <<<"$task_output" | awk -F'/' '{print $NF}')"
  if [ -z "$task_id" ]; then
    return 0
  fi

  log_group="$(
    aws ecs describe-task-definition \
      --task-definition "$TASK_DEFINITION_ARN" \
      --query "taskDefinition.containerDefinitions[?name=='${CONTAINER_NAME}'].logConfiguration.options.\"awslogs-group\" | [0]" \
      --output text 2>/dev/null || true
  )"
  log_prefix="$(
    aws ecs describe-task-definition \
      --task-definition "$TASK_DEFINITION_ARN" \
      --query "taskDefinition.containerDefinitions[?name=='${CONTAINER_NAME}'].logConfiguration.options.\"awslogs-stream-prefix\" | [0]" \
      --output text 2>/dev/null || true
  )"

  if [ -z "$log_group" ] || [ "$log_group" = "None" ] || [ -z "$log_prefix" ] || [ "$log_prefix" = "None" ]; then
    return 0
  fi

  log_stream="${log_prefix}/${CONTAINER_NAME}/${task_id}"
  stream_names=""

  for attempt in 1 2 3 4 5; do
    describe_streams_output="$(
      aws logs describe-log-streams \
        --log-group-name "$log_group" \
        --log-stream-name-prefix "${log_prefix}/" \
        --query "logStreams[?contains(logStreamName, '${task_id}')].logStreamName" \
        --output text 2>&1
    )"
    describe_streams_status=$?
    if [ "$describe_streams_status" -ne 0 ]; then
      echo "Unable to read CloudWatch log streams for ${log_group}: ${describe_streams_output}" >&2
      return 0
    fi
    stream_names="$describe_streams_output"
    if [ -n "$stream_names" ] && [ "$stream_names" != "None" ]; then
      break
    fi
    sleep 3
  done

  if [ -z "$stream_names" ] || [ "$stream_names" = "None" ]; then
    stream_names="$log_stream"
  fi

  while IFS= read -r log_stream_name; do
    [ -n "$log_stream_name" ] || continue

    aws logs get-log-events \
      --log-group-name "$log_group" \
      --log-stream-name "$log_stream_name" \
      --limit 200 \
      --query 'events[].message' \
      --output text \
      > /tmp/aws-task-log-events.txt 2>/tmp/aws-task-log-events.err
    get_events_status=$?

    echo "--- CloudWatch logs: ${log_group} / ${log_stream_name} ---" >&2
    if [ "$get_events_status" -eq 0 ]; then
      cat /tmp/aws-task-log-events.txt >&2 2>/dev/null || true
    else
      cat /tmp/aws-task-log-events.err >&2 2>/dev/null || true
    fi
    echo "--- end logs ---" >&2
  done <<<"$(printf '%s\n' "$stream_names" | tr '\t' '\n')"
}

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
  print_task_logs "$TASK_OUTPUT"
  echo "Task ${TASK_ARN} failed. stoppedReason=${STOPPED_REASON} containerReason=${CONTAINER_REASON} exitCode=${EXIT_CODE}" >&2
  exit 1
fi

echo "Task ${TASK_ARN} completed successfully"

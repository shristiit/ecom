#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "Usage: $0 <task-family> <container-name> <image-uri>"
  exit 1
fi

TASK_FAMILY="$1"
CONTAINER_NAME="$2"
IMAGE_URI="$3"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

CURRENT_TASK_DEF_JSON="${TMP_DIR}/task-def.json"
NEXT_TASK_DEF_JSON="${TMP_DIR}/task-def-next.json"

aws ecs describe-task-definition \
  --task-definition "$TASK_FAMILY" \
  --query 'taskDefinition' \
  > "$CURRENT_TASK_DEF_JSON"

jq \
  --arg container_name "$CONTAINER_NAME" \
  --arg image_uri "$IMAGE_URI" \
  '
  del(
    .compatibilities,
    .taskDefinitionArn,
    .requiresAttributes,
    .revision,
    .status,
    .registeredAt,
    .registeredBy
  )
  | .containerDefinitions = (
      .containerDefinitions
      | map(
          if .name == $container_name
          then .image = $image_uri
          else .
          end
        )
    )
  ' \
  "$CURRENT_TASK_DEF_JSON" \
  > "$NEXT_TASK_DEF_JSON"

aws ecs register-task-definition \
  --cli-input-json "file://${NEXT_TASK_DEF_JSON}" \
  --query 'taskDefinition.taskDefinitionArn' \
  --output text

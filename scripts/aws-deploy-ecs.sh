#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 5 ]; then
  echo "Usage: $0 <cluster> <service> <task-family> <container-name> <image-uri>"
  exit 1
fi

CLUSTER="$1"
SERVICE="$2"
TASK_FAMILY="$3"
CONTAINER_NAME="$4"
IMAGE_URI="$5"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

NEW_TASK_DEF_ARN="$("${SCRIPT_DIR}/aws-register-ecs-task-def.sh" "$TASK_FAMILY" "$CONTAINER_NAME" "$IMAGE_URI")"
"${SCRIPT_DIR}/aws-update-ecs-service.sh" "$CLUSTER" "$SERVICE" "$NEW_TASK_DEF_ARN" > /dev/null

echo "Deployed ${SERVICE} with task definition ${NEW_TASK_DEF_ARN}"

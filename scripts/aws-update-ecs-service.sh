#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "Usage: $0 <cluster> <service> <task-definition-arn>"
  exit 1
fi

CLUSTER="$1"
SERVICE="$2"
TASK_DEFINITION_ARN="$3"

aws ecs update-service \
  --cluster "$CLUSTER" \
  --service "$SERVICE" \
  --task-definition "$TASK_DEFINITION_ARN" \
  --force-new-deployment \
  > /dev/null

aws ecs wait services-stable \
  --cluster "$CLUSTER" \
  --services "$SERVICE"

echo "Updated ${SERVICE} to ${TASK_DEFINITION_ARN}"

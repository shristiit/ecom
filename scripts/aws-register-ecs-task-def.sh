#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "Usage: $0 <task-family> <container-name> <image-uri>"
  exit 1
fi

TASK_FAMILY="$1"
CONTAINER_NAME="$2"
IMAGE_URI="$3"

build_runtime_env_json() {
  case "$CONTAINER_NAME" in
    backend)
      local database_url="${BACKEND_DATABASE_URL:-${DATABASE_URL:-}}"
      local jwt_secret="${BACKEND_JWT_SECRET:-${JWT_SECRET:-}}"
      local openai_api_key="${BACKEND_OPENAI_API_KEY:-${OPENAI_API_KEY:-disabled}}"
      local auth0_client_secret="${BACKEND_AUTH0_CLIENT_SECRET:-${AUTH0_CLIENT_SECRET:-disabled}}"
      local google_client_secret="${BACKEND_SSO_GOOGLE_CLIENT_SECRET:-${SSO_GOOGLE_CLIENT_SECRET:-disabled}}"
      local azuread_client_secret="${BACKEND_SSO_AZUREAD_CLIENT_SECRET:-${SSO_AZUREAD_CLIENT_SECRET:-disabled}}"

      if [ -z "$database_url" ]; then
        echo "Missing BACKEND_DATABASE_URL or DATABASE_URL for backend task definition" >&2
        exit 1
      fi

      if [ -z "$jwt_secret" ]; then
        echo "Missing BACKEND_JWT_SECRET or JWT_SECRET for backend task definition" >&2
        exit 1
      fi

      jq -nc \
        --arg database_url "$database_url" \
        --arg jwt_secret "$jwt_secret" \
        --arg openai_api_key "$openai_api_key" \
        --arg auth0_client_secret "$auth0_client_secret" \
        --arg google_client_secret "$google_client_secret" \
        --arg azuread_client_secret "$azuread_client_secret" \
        '[
          {name:"DATABASE_URL",value:$database_url},
          {name:"JWT_SECRET",value:$jwt_secret},
          {name:"OPENAI_API_KEY",value:$openai_api_key},
          {name:"AUTH0_CLIENT_SECRET",value:$auth0_client_secret},
          {name:"SSO_GOOGLE_CLIENT_SECRET",value:$google_client_secret},
          {name:"SSO_AZUREAD_CLIENT_SECRET",value:$azuread_client_secret}
        ]'
      ;;
    conversational-engine)
      local database_url="${ENGINE_DATABASE_URL:-${CONVERSATIONAL_ENGINE_DATABASE_URL:-${BACKEND_DATABASE_URL:-${DATABASE_URL:-}}}}"
      local llm_api_key="${ENGINE_LLM_API_KEY:-${CONVERSATIONAL_ENGINE_LLM_API_KEY:-${BACKEND_OPENAI_API_KEY:-${OPENAI_API_KEY:-disabled}}}}"
      local deepseek_api_key="${ENGINE_DEEPSEEK_API_KEY:-${CONVERSATIONAL_ENGINE_DEEPSEEK_API_KEY:-disabled}}"

      if [ -z "$database_url" ]; then
        echo "Missing ENGINE_DATABASE_URL, CONVERSATIONAL_ENGINE_DATABASE_URL, BACKEND_DATABASE_URL, or DATABASE_URL for engine task definition" >&2
        exit 1
      fi

      jq -nc \
        --arg database_url "$database_url" \
        --arg llm_api_key "$llm_api_key" \
        --arg deepseek_api_key "$deepseek_api_key" \
        '[
          {name:"CONVERSATIONAL_ENGINE_DATABASE_URL",value:$database_url},
          {name:"CONVERSATIONAL_ENGINE_LLM_API_KEY",value:$llm_api_key},
          {name:"CONVERSATIONAL_ENGINE_DEEPSEEK_API_KEY",value:$deepseek_api_key}
        ]'
      ;;
    *)
      jq -nc '[]'
      ;;
  esac
}

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

CURRENT_TASK_DEF_JSON="${TMP_DIR}/task-def.json"
NEXT_TASK_DEF_JSON="${TMP_DIR}/task-def-next.json"
RUNTIME_ENV_JSON="${TMP_DIR}/runtime-env.json"

build_runtime_env_json > "$RUNTIME_ENV_JSON"

aws ecs describe-task-definition \
  --task-definition "$TASK_FAMILY" \
  --query 'taskDefinition' \
  > "$CURRENT_TASK_DEF_JSON"

jq \
  --arg container_name "$CONTAINER_NAME" \
  --arg image_uri "$IMAGE_URI" \
  --slurpfile runtime_env "$RUNTIME_ENV_JSON" \
  '
  ($runtime_env[0] // []) as $runtime_env
  | ($runtime_env | map(.name)) as $runtime_names
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
          | .environment = (
              ((.environment // []) | map(select(.name as $name | ($runtime_names | index($name) | not))))
              + $runtime_env
            )
          | .secrets = (
              (.secrets // []) | map(select(.name as $name | ($runtime_names | index($name) | not)))
            )
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

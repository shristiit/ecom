#!/usr/bin/env bash

set -euo pipefail

project="${PROJECT:-stockaisle}"
environment="${ENVIRONMENT:-prod}"
region="${AWS_REGION:-eu-west-2}"

backend_prefix="${project}/${environment}/backend"
engine_prefix="${project}/${environment}/engine"

log() {
  echo "[bootstrap-secrets] $*"
}

secret_exists() {
  aws secretsmanager describe-secret \
    --region "${region}" \
    --secret-id "$1" \
    >/dev/null 2>&1
}

secret_has_current_value() {
  aws secretsmanager get-secret-value \
    --region "${region}" \
    --secret-id "$1" \
    --query 'SecretString' \
    --output text \
    >/dev/null 2>&1
}

read_secret_value() {
  aws secretsmanager get-secret-value \
    --region "${region}" \
    --secret-id "$1" \
    --query 'SecretString' \
    --output text \
    2>/dev/null || true
}

set_missing_secret_value() {
  local secret_name="$1"
  local secret_value="$2"

  if secret_has_current_value "${secret_name}"; then
    log "Keeping existing value for ${secret_name}"
    return 0
  fi

  if secret_exists "${secret_name}"; then
    aws secretsmanager put-secret-value \
      --region "${region}" \
      --secret-id "${secret_name}" \
      --secret-string "${secret_value}" \
      >/dev/null
    log "Set missing value for ${secret_name}"
    return 0
  fi

  aws secretsmanager create-secret \
    --region "${region}" \
    --name "${secret_name}" \
    --secret-string "${secret_value}" \
    >/dev/null
  log "Created ${secret_name}"
}

generate_jwt_secret() {
  openssl rand -hex 32
}

placeholder_if_empty() {
  local value="$1"
  if [[ -n "${value}" && "${value}" != "None" ]]; then
    printf '%s' "${value}"
    return 0
  fi

  printf '%s' "disabled"
}

infer_backend_database_url() {
  local value="${BACKEND_DATABASE_URL:-${DATABASE_URL:-}}"
  if [[ -n "${value}" ]]; then
    printf '%s' "${value}"
    return 0
  fi

  value="$(read_secret_value "${backend_prefix}/DATABASE_URL")"
  if [[ -n "${value}" && "${value}" != "None" ]]; then
    printf '%s' "${value}"
    return 0
  fi

  value="$(read_secret_value "${engine_prefix}/CONVERSATIONAL_ENGINE_DATABASE_URL")"
  if [[ -n "${value}" && "${value}" != "None" ]]; then
    printf '%s' "${value}"
    return 0
  fi

  return 1
}

infer_engine_database_url() {
  local value="${ENGINE_DATABASE_URL:-${CONVERSATIONAL_ENGINE_DATABASE_URL:-}}"
  if [[ -n "${value}" ]]; then
    printf '%s' "${value}"
    return 0
  fi

  value="$(read_secret_value "${engine_prefix}/CONVERSATIONAL_ENGINE_DATABASE_URL")"
  if [[ -n "${value}" && "${value}" != "None" ]]; then
    printf '%s' "${value}"
    return 0
  fi

  infer_backend_database_url
}

infer_backend_openai_key() {
  local value="${OPENAI_API_KEY:-}"
  if [[ -n "${value}" ]]; then
    printf '%s' "${value}"
    return 0
  fi

  value="$(read_secret_value "${backend_prefix}/OPENAI_API_KEY")"
  if [[ -n "${value}" && "${value}" != "None" ]]; then
    printf '%s' "${value}"
    return 0
  fi

  value="$(read_secret_value "${engine_prefix}/CONVERSATIONAL_ENGINE_LLM_API_KEY")"
  if [[ -n "${value}" && "${value}" != "None" ]]; then
    printf '%s' "${value}"
    return 0
  fi

  placeholder_if_empty ""
}

infer_engine_llm_key() {
  local value="${CONVERSATIONAL_ENGINE_LLM_API_KEY:-}"
  if [[ -n "${value}" ]]; then
    printf '%s' "${value}"
    return 0
  fi

  value="$(read_secret_value "${engine_prefix}/CONVERSATIONAL_ENGINE_LLM_API_KEY")"
  if [[ -n "${value}" && "${value}" != "None" ]]; then
    printf '%s' "${value}"
    return 0
  fi

  infer_backend_openai_key
}

infer_engine_deepseek_key() {
  local value="${CONVERSATIONAL_ENGINE_DEEPSEEK_API_KEY:-}"
  if [[ -n "${value}" ]]; then
    printf '%s' "${value}"
    return 0
  fi

  value="$(read_secret_value "${engine_prefix}/CONVERSATIONAL_ENGINE_DEEPSEEK_API_KEY")"
  if [[ -n "${value}" && "${value}" != "None" ]]; then
    printf '%s' "${value}"
    return 0
  fi

  placeholder_if_empty ""
}

ensure_required_secret() {
  local secret_name="$1"
  local secret_value="$2"

  if secret_has_current_value "${secret_name}"; then
    log "Keeping existing value for ${secret_name}"
    return 0
  fi

  if [[ -z "${secret_value}" || "${secret_value}" == "None" ]]; then
    log "Missing required value for ${secret_name}"
    return 1
  fi

  set_missing_secret_value "${secret_name}" "${secret_value}"
}

ensure_optional_secret() {
  local secret_name="$1"
  local secret_value="$2"
  set_missing_secret_value "${secret_name}" "$(placeholder_if_empty "${secret_value}")"
}

backend_database_url="$(infer_backend_database_url || true)"
engine_database_url="$(infer_engine_database_url || true)"
backend_openai_key="$(infer_backend_openai_key)"
engine_llm_key="$(infer_engine_llm_key)"
engine_deepseek_key="$(infer_engine_deepseek_key)"
jwt_secret="${JWT_SECRET:-}"
auth0_client_secret="${AUTH0_CLIENT_SECRET:-$(read_secret_value "${backend_prefix}/AUTH0_CLIENT_SECRET")}"
google_client_secret="${SSO_GOOGLE_CLIENT_SECRET:-$(read_secret_value "${backend_prefix}/SSO_GOOGLE_CLIENT_SECRET")}"
azuread_client_secret="${SSO_AZUREAD_CLIENT_SECRET:-$(read_secret_value "${backend_prefix}/SSO_AZUREAD_CLIENT_SECRET")}"

if [[ -z "${jwt_secret}" || "${jwt_secret}" == "None" ]]; then
  jwt_secret="$(read_secret_value "${backend_prefix}/JWT_SECRET")"
fi
if [[ -z "${jwt_secret}" || "${jwt_secret}" == "None" ]]; then
  jwt_secret="$(generate_jwt_secret)"
  log "Generated JWT secret because none existed"
fi

failures=0

ensure_required_secret "${backend_prefix}/DATABASE_URL" "${backend_database_url}" || failures=$((failures + 1))
ensure_required_secret "${backend_prefix}/JWT_SECRET" "${jwt_secret}" || failures=$((failures + 1))
ensure_optional_secret "${backend_prefix}/OPENAI_API_KEY" "${backend_openai_key}"
ensure_optional_secret "${backend_prefix}/AUTH0_CLIENT_SECRET" "${auth0_client_secret}"
ensure_optional_secret "${backend_prefix}/SSO_GOOGLE_CLIENT_SECRET" "${google_client_secret}"
ensure_optional_secret "${backend_prefix}/SSO_AZUREAD_CLIENT_SECRET" "${azuread_client_secret}"

ensure_required_secret "${engine_prefix}/CONVERSATIONAL_ENGINE_DATABASE_URL" "${engine_database_url}" || failures=$((failures + 1))
ensure_optional_secret "${engine_prefix}/CONVERSATIONAL_ENGINE_LLM_API_KEY" "${engine_llm_key}"
ensure_optional_secret "${engine_prefix}/CONVERSATIONAL_ENGINE_DEEPSEEK_API_KEY" "${engine_deepseek_key}"

if (( failures > 0 )); then
  log "Unable to bootstrap ${failures} required secret(s). Set DATABASE_URL values explicitly and rerun."
  exit 1
fi

log "Missing secrets bootstrap complete"

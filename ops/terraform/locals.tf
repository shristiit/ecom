data "aws_caller_identity" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_route53_zone" "primary" {
  name         = "${var.route53_zone_name}."
  private_zone = false
}

locals {
  name_prefix = "${var.project}-${var.environment}"

  use_existing_network = var.existing_vpc_id != ""
  existing_public_subnet_ids = [
    for subnet_id in compact(split(",", replace(var.existing_public_subnet_ids_csv, " ", ""))) :
    subnet_id
  ]
  vpc_id = local.use_existing_network ? var.existing_vpc_id : aws_vpc.main[0].id
  public_subnet_ids = local.use_existing_network ? local.existing_public_subnet_ids : [for subnet in aws_subnet.public : subnet.id]

  common_tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
    Repository  = var.github_repository
  }

  public_domain = var.domain_name
  www_domain    = "www.${var.domain_name}"
  admin_domain  = "admin.${var.domain_name}"
  api_domain    = "api.${var.domain_name}"
  engine_domain = "engine.${var.domain_name}"
  media_domain  = "media.${var.domain_name}"

  backend_ecr_repository = "${var.project}/backend"
  engine_ecr_repository  = "${var.project}/conversational-engine"

  landing_bucket_name = "${local.name_prefix}-landing-${data.aws_caller_identity.current.account_id}"
  admin_bucket_name   = "${local.name_prefix}-admin-${data.aws_caller_identity.current.account_id}"
  media_bucket_name   = "${local.name_prefix}-media-${data.aws_caller_identity.current.account_id}"

  ecs_cluster_name    = "${local.name_prefix}-cluster"
  backend_family_name = "${local.name_prefix}-backend"
  engine_family_name  = "${local.name_prefix}-engine"
  backend_service     = "${local.name_prefix}-backend"
  engine_service      = "${local.name_prefix}-engine"
  namespace_name      = "stockaisle.local"

  backend_container_name = "backend"
  engine_container_name  = "conversational-engine"

  backend_parameters = {
    NODE_ENV                  = "production"
    PORT                      = "4000"
    ACCESS_TOKEN_TTL          = "15m"
    REFRESH_TOKEN_TTL         = "7d"
    CORS_ORIGIN               = "https://${local.admin_domain},https://${local.public_domain}"
    CONVERSATIONAL_ENGINE_URL = "http://conversational-engine.${local.namespace_name}:8000"
    OPENAI_MODEL              = "gpt-4o-mini"
    OPENAI_BASE_URL           = "https://api.openai.com/v1"
    RESERVATION_TTL_MIN       = "30"
    S3_REGION                 = var.aws_region
    S3_BUCKET                 = local.media_bucket_name
    S3_PUBLIC_BASE_URL        = "https://${local.media_domain}"
    SSO_PROVIDERS             = ""
    AUTH0_DOMAIN              = ""
    AUTH0_CLIENT_ID           = ""
    AUTH0_AUDIENCE            = ""
    AUTH0_REDIRECT_URI        = "https://${local.api_domain}/api/auth/sso/auth0/callback"
    DEFAULT_SSO_ROLE_NAME     = "staff"
    SSO_GOOGLE_CLIENT_ID      = ""
    SSO_GOOGLE_REDIRECT_URI   = "https://${local.api_domain}/api/auth/sso/google/callback"
    SSO_AZUREAD_CLIENT_ID     = ""
    SSO_AZUREAD_TENANT_ID     = ""
    SSO_AZUREAD_REDIRECT_URI  = "https://${local.api_domain}/api/auth/sso/azuread/callback"
    SENTRY_DSN                = ""
  }

  backend_secret_names = toset([
    "DATABASE_URL",
    "JWT_SECRET",
    "OPENAI_API_KEY",
    "AUTH0_CLIENT_SECRET",
    "SSO_GOOGLE_CLIENT_SECRET",
    "SSO_AZUREAD_CLIENT_SECRET",
  ])

  engine_parameters = {
    CONVERSATIONAL_ENGINE_ENV                     = "production"
    CONVERSATIONAL_ENGINE_HOST                    = "0.0.0.0"
    CONVERSATIONAL_ENGINE_PORT                    = "8000"
    CONVERSATIONAL_ENGINE_LOG_LEVEL               = "INFO"
    CONVERSATIONAL_ENGINE_BACKEND_BASE_URL        = "https://${local.api_domain}/api"
    CONVERSATIONAL_ENGINE_LLM_BASE_URL            = "https://api.openai.com/v1"
    CONVERSATIONAL_ENGINE_MODEL_BEST              = "gpt-4.1"
    CONVERSATIONAL_ENGINE_MODEL_OK                = "gpt-4.1-mini"
    CONVERSATIONAL_ENGINE_EMBEDDINGS_MODEL        = "text-embedding-3-small"
    CONVERSATIONAL_ENGINE_AGENT_MODEL_TIERS       = "products:best,purchasing:best,inventory:ok,reporting:ok,help:ok,orchestrator_classifier:ok"
    CONVERSATIONAL_ENGINE_PLANNER_PROVIDER_CHAIN  = "openai,deepseek"
    CONVERSATIONAL_ENGINE_EXECUTOR_PROVIDER_CHAIN = "openai,deepseek"
    CONVERSATIONAL_ENGINE_REVIEWER_PROVIDER_CHAIN = "openai,deepseek"
    CONVERSATIONAL_ENGINE_NARRATOR_PROVIDER_CHAIN = "openai,deepseek"
    CONVERSATIONAL_ENGINE_FEATURE_ENABLED         = "true"
    CONVERSATIONAL_ENGINE_MUTATIONS_ENABLED       = "false"
    CONVERSATIONAL_ENGINE_RETRIEVAL_ENABLED       = "false"
    CONVERSATIONAL_ENGINE_CORS_ORIGINS            = "https://${local.admin_domain}"
  }

  engine_secret_names = toset([
    "CONVERSATIONAL_ENGINE_DATABASE_URL",
    "CONVERSATIONAL_ENGINE_LLM_API_KEY",
    "CONVERSATIONAL_ENGINE_DEEPSEEK_API_KEY",
  ])

  admin_parameters = {
    ADMIN_DEFAULT_MODE                    = "prod"
    ADMIN_PROD_API_URL                    = "https://${local.api_domain}/api"
    EXPO_PUBLIC_API_URL                   = "https://${local.api_domain}/api"
    EXPO_PUBLIC_CONVERSATIONAL_ENGINE_URL = "https://${local.engine_domain}"
    EXPO_PUBLIC_ENABLE_MFA                = "false"
    EXPO_PUBLIC_SSO_URL                   = ""
  }

  landing_parameters = {
    LOGIN_URL = "https://${local.admin_domain}/login"
  }

  production_domains = [
    local.public_domain,
    local.www_domain,
    local.admin_domain,
    local.api_domain,
    local.engine_domain,
    local.media_domain,
  ]
}

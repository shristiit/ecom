#!/usr/bin/env bash

set -euo pipefail

NUKE_REGIONS="${NUKE_REGIONS:-us-east-1 eu-west-1 eu-west-2}"
CONFIRMATION_STRING="${CONFIRMATION_STRING:-DELETE ALL AWS RESOURCES IN us-east-1 eu-west-1 eu-west-2 EXCEPT ROUTE53}"

log() {
  printf '\n[%s] %s\n' "$(date '+%H:%M:%S')" "$1"
}

normalize_id() {
  local value="${1:-}"
  if [[ -z "$value" || "$value" == "None" || "$value" == "null" ]]; then
    return 1
  fi
  printf '%s\n' "$value"
}

install_aws_nuke() {
  local release_json=""
  local asset_url=""
  local install_dir=""

  install_dir="${RUNNER_TEMP:-/tmp}/aws-nuke-bin"
  mkdir -p "$install_dir"

  release_json="$(curl -fsSL https://api.github.com/repos/ekristen/aws-nuke/releases/latest)"
  asset_url="$(jq -r '.assets[] | select(.name | test("linux-amd64\\.tar\\.gz$")) | .browser_download_url' <<<"$release_json" | head -n1)"

  if ! normalize_id "$asset_url" >/dev/null; then
    echo "Failed to determine aws-nuke download URL" >&2
    exit 1
  fi

  curl -fsSL "$asset_url" | tar -xz -C "$install_dir"
  chmod +x "$install_dir/aws-nuke"
  export PATH="$install_dir:$PATH"
}

route53_preserve_types() {
  aws-nuke resource-types \
    | awk '/Route53/ && $1 !~ /Resolver/ { print $1 }' \
    | sort -u
}

write_config() {
  local config_path="$1"
  local account_id="$2"
  local region=""
  local resource_type=""

  cat >"$config_path" <<EOF
blocklist:
  - "000000000000"

regions:
  - global
EOF

  for region in $NUKE_REGIONS; do
    printf '  - %s\n' "$region" >>"$config_path"
  done

  cat >>"$config_path" <<EOF

accounts:
  "${account_id}": {}

resource-types:
  excludes:
EOF

  while IFS= read -r resource_type; do
    if normalize_id "$resource_type" >/dev/null; then
      printf '    - %s\n' "$resource_type" >>"$config_path"
    fi
  done < <(route53_preserve_types)
}

delete_region_vpcs() {
  local region="$1"
  local pass="$2"
  local vpcs=""
  local vpc=""
  local ids=""
  local id=""

  log "VPC cleanup pass ${pass} in ${region}"

  vpcs="$(aws ec2 describe-vpcs --region "$region" --query 'Vpcs[].VpcId' --output text 2>/dev/null || true)"
  if ! normalize_id "$vpcs" >/dev/null; then
    return 0
  fi

  while IFS=$'\t' read -r -a vpc_row; do
    for vpc in "${vpc_row[@]}"; do
      log "Attempting dependency cleanup for VPC ${vpc} in ${region}"

      ids="$(aws ec2 describe-nat-gateways --region "$region" --filter "Name=vpc-id,Values=${vpc}" --query 'NatGateways[].NatGatewayId' --output text 2>/dev/null || true)"
      if normalize_id "$ids" >/dev/null; then
        while IFS=$'\t' read -r -a nat_row; do
          for id in "${nat_row[@]}"; do
            aws ec2 delete-nat-gateway --region "$region" --nat-gateway-id "$id" >/dev/null 2>&1 || true
          done
        done <<<"$ids"
      fi

      ids="$(aws ec2 describe-vpc-endpoints --region "$region" --filters "Name=vpc-id,Values=${vpc}" --query 'VpcEndpoints[].VpcEndpointId' --output text 2>/dev/null || true)"
      if normalize_id "$ids" >/dev/null; then
        while IFS=$'\t' read -r -a endpoint_row; do
          for id in "${endpoint_row[@]}"; do
            aws ec2 delete-vpc-endpoints --region "$region" --vpc-endpoint-ids "$id" >/dev/null 2>&1 || true
          done
        done <<<"$ids"
      fi

      ids="$(aws ec2 describe-egress-only-internet-gateways --region "$region" --filters "Name=attachment.vpc-id,Values=${vpc}" --query 'EgressOnlyInternetGateways[].EgressOnlyInternetGatewayId' --output text 2>/dev/null || true)"
      if normalize_id "$ids" >/dev/null; then
        while IFS=$'\t' read -r -a eigw_row; do
          for id in "${eigw_row[@]}"; do
            aws ec2 delete-egress-only-internet-gateway --region "$region" --egress-only-internet-gateway-id "$id" >/dev/null 2>&1 || true
          done
        done <<<"$ids"
      fi

      ids="$(aws ec2 describe-internet-gateways --region "$region" --filters "Name=attachment.vpc-id,Values=${vpc}" --query 'InternetGateways[].InternetGatewayId' --output text 2>/dev/null || true)"
      if normalize_id "$ids" >/dev/null; then
        while IFS=$'\t' read -r -a igw_row; do
          for id in "${igw_row[@]}"; do
            aws ec2 detach-internet-gateway --region "$region" --internet-gateway-id "$id" --vpc-id "$vpc" >/dev/null 2>&1 || true
            aws ec2 delete-internet-gateway --region "$region" --internet-gateway-id "$id" >/dev/null 2>&1 || true
          done
        done <<<"$ids"
      fi

      ids="$(aws ec2 describe-subnets --region "$region" --filters "Name=vpc-id,Values=${vpc}" --query 'Subnets[].SubnetId' --output text 2>/dev/null || true)"
      if normalize_id "$ids" >/dev/null; then
        while IFS=$'\t' read -r -a subnet_row; do
          for id in "${subnet_row[@]}"; do
            aws ec2 delete-subnet --region "$region" --subnet-id "$id" >/dev/null 2>&1 || true
          done
        done <<<"$ids"
      fi

      ids="$(aws ec2 describe-route-tables --region "$region" --filters "Name=vpc-id,Values=${vpc}" --query 'RouteTables[?Associations[?Main!=`true`]].RouteTableId' --output text 2>/dev/null || true)"
      if normalize_id "$ids" >/dev/null; then
        while IFS=$'\t' read -r -a route_row; do
          for id in "${route_row[@]}"; do
            aws ec2 delete-route-table --region "$region" --route-table-id "$id" >/dev/null 2>&1 || true
          done
        done <<<"$ids"
      fi

      ids="$(aws ec2 describe-security-groups --region "$region" --filters "Name=vpc-id,Values=${vpc}" --query 'SecurityGroups[?GroupName!=`default`].GroupId' --output text 2>/dev/null || true)"
      if normalize_id "$ids" >/dev/null; then
        while IFS=$'\t' read -r -a sg_row; do
          for id in "${sg_row[@]}"; do
            aws ec2 delete-security-group --region "$region" --group-id "$id" >/dev/null 2>&1 || true
          done
        done <<<"$ids"
      fi

      ids="$(aws ec2 describe-network-acls --region "$region" --filters "Name=vpc-id,Values=${vpc}" --query 'NetworkAcls[?IsDefault==`false`].NetworkAclId' --output text 2>/dev/null || true)"
      if normalize_id "$ids" >/dev/null; then
        while IFS=$'\t' read -r -a nacl_row; do
          for id in "${nacl_row[@]}"; do
            aws ec2 delete-network-acl --region "$region" --network-acl-id "$id" >/dev/null 2>&1 || true
          done
        done <<<"$ids"
      fi

      aws ec2 delete-vpc --region "$region" --vpc-id "$vpc" >/dev/null 2>&1 || true
    done
  done <<<"$vpcs"
}

main() {
  local account_id=""
  local config_path=""
  local pass=""
  local region=""
  local nuke_status=0
  local last_status=0

  account_id="$(aws sts get-caller-identity --query 'Account' --output text)"
  config_path="$(mktemp)"

  log "Installing aws-nuke"
  install_aws_nuke

  log "Generating aws-nuke config for account ${account_id}"
  write_config "$config_path" "$account_id"
  cat "$config_path"

  for pass in 1 2 3; do
    log "aws-nuke pass ${pass}"
    if ! aws-nuke run \
      --config "$config_path" \
      --no-dry-run \
      --force \
      --wait-on-dependencies; then
      last_status=$?
      nuke_status=$last_status
      log "aws-nuke pass ${pass} exited with status ${last_status}; continuing"
    fi
  done

  for pass in 1 2 3; do
    for region in $NUKE_REGIONS; do
      delete_region_vpcs "$region" "$pass"
    done
    sleep 10
  done

  if [[ "$nuke_status" -ne 0 ]]; then
    log "aws-nuke reported at least one non-zero exit status during the wipe"
  fi

  log "Account wipe completed for ${account_id}. Route53 public DNS resources were preserved."
}

main "$@"

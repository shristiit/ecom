#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "Usage: $0 <source-dir> <bucket-name> <distribution-id>"
  exit 1
fi

SOURCE_DIR="$1"
BUCKET_NAME="$2"
DISTRIBUTION_ID="$3"

if [ ! -d "$SOURCE_DIR" ]; then
  echo "Source directory not found: ${SOURCE_DIR}"
  exit 1
fi

aws s3 sync "${SOURCE_DIR}/" "s3://${BUCKET_NAME}/" \
  --delete \
  --exclude "*.html" \
  --cache-control "public,max-age=31536000,immutable"

aws s3 sync "${SOURCE_DIR}/" "s3://${BUCKET_NAME}/" \
  --delete \
  --exclude "*" \
  --include "*.html" \
  --cache-control "public,max-age=0,s-maxage=300,must-revalidate"

aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "/*" \
  > /dev/null

echo "Synced ${SOURCE_DIR} to s3://${BUCKET_NAME} and invalidated ${DISTRIBUTION_ID}"

#!/usr/bin/env bash
set -euo pipefail
required=(SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_REF HAVEN_ENV)
for name in "${required[@]}"; do
  if [ -z "${!name:-}" ]; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
done
echo "Production deployment environment is complete."

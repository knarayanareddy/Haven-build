#!/usr/bin/env bash
set -euo pipefail
if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI is not installed in this environment. Install Supabase CLI and Docker, then run: supabase start && supabase db reset" >&2
  exit 2
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed in this environment. Supabase local reset requires Docker." >&2
  exit 2
fi
supabase start
supabase db reset
supabase db lint --level warning

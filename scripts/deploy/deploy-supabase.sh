#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
"$DIR/scripts/deploy/check-production-env.sh"
cd "$DIR"
supabase link --project-ref "$SUPABASE_PROJECT_REF"
echo "Running schema lint before push..."
supabase db lint --level warning
echo "Pushing migrations..."
supabase db push
echo "Verifying schema drift after push..."
supabase db diff --linked
echo "Deploying all Edge Functions..."
supabase functions deploy --all
corepack pnpm test
echo "HAVEN Supabase deployment completed."

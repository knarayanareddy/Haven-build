#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
"$DIR/scripts/deploy/check-production-env.sh"
cd "$DIR"
supabase link --project-ref "$SUPABASE_PROJECT_REF"
supabase db push
supabase functions deploy
npm test
echo "HAVEN Supabase deployment completed."

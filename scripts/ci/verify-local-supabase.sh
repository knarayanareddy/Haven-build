#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$DIR"
export PATH="$DIR/bin:$PATH"
./scripts/check-local-supabase.sh
HAVEN_LIVE_RLS=1 corepack pnpm run test:integration:live

#!/usr/bin/env bash
# Type-check every Supabase Edge Function with the Deno toolchain.
#
# Why this exists: `tsc -p tsconfig.packages.json` covers packages/*, apps/elder and
# apps/grandchild — it never looked at supabase/functions. The first run of this
# check found 58 of 81 functions failing, including three defects that broke them
# at runtime:
#   • `.catch()` on a Postgrest builder (PromiseLike only) — 33 sites, thrown on
#     every authorisation-denial audit write;
#   • `.insert(...).onConflict(...).ignore()` — not a real API, so every idempotent
#     request failed before its handler ran;
#   • `audio_base64` / `userClient` referenced without being defined.
#
# Usage: scripts/ci/verify-edge-functions.sh [function-name ...]
set -euo pipefail

cd "$(dirname "$0")/../.."

if ! command -v deno >/dev/null 2>&1; then
  cat >&2 <<'EOF'
::error::deno is not installed, so the Edge Functions cannot be type-checked.

Edge Functions are not covered by `tsc`. Install Deno (1.40+ / 2.x):
  curl -fsSL https://deno.land/install.sh | sh
  # or: brew install deno
  # or: npm install -g deno
EOF
  exit 1
fi

CONFIG="supabase/functions/deno.json"

if [ "$#" -gt 0 ]; then
  targets=()
  for name in "$@"; do
    targets+=("supabase/functions/${name}/index.ts")
  done
else
  mapfile -t targets < <(find supabase/functions -mindepth 2 -maxdepth 2 -name index.ts | sort)
fi

echo "Type-checking ${#targets[@]} Edge Function entr(ies) with deno $(deno --version | head -1 | awk '{print $2}')"
deno check --config "$CONFIG" "${targets[@]}"

echo "OK: every Edge Function type-checks."

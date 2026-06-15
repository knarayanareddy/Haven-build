#!/usr/bin/env bash
# ─── HAVEN Security Bulk Migration ───
# Patches ALL remaining Edge Functions from old insecure patterns to new secure APIs.
# Run from the Haven-build repo root.
set -euo pipefail

REPO="${1:-.}"
[ ! -d "$REPO/supabase/functions" ] && { echo "ERROR: Not a Haven-build repo: $REPO"; exit 1; }

echo "=== HAVEN Security Bulk Migration ==="

PRIMARY="fn-scam-pipeline fn-transaction-intercept fn-right-to-erasure fn-onboarding fn-emergency-profile fn-scam-coaching fn-voice-pipeline"

for dir in "$REPO"/supabase/functions/fn-*/; do
  fn=$(basename "$dir")
  echo "$PRIMARY" | grep -qw "$fn" && continue
  f="$dir/index.ts"
  [ ! -f "$f" ] && continue
  echo -n "  $fn..."

  cp "$f" "$f.bak"

  # (a) headers: cors } → headers: corsHeaders(req) }
  sed -i 's/headers: cors }/headers: corsHeaders(req) }/g' "$f"

  # (b) return json(result.body,...) → return json(result.body,..., req)
  sed -i 's/return json(result\.body, result\.status ?? 200)/return json(result.body, result.status ?? 200, req)/g' "$f"

  # (c) String(e.message??e) → safeErrorMessage(e)
  sed -i 's/String((e as Error)\.message ?? e)/safeErrorMessage(e)/g' "$f"

  # (d) await req.json() → await readJsonBody(req)
  sed -i 's/const body = await req\.json();/const body = await readJsonBody(req) as Record<string, unknown>;/g' "$f"

  # (e) Add missing import symbols — append to existing import line
  NEED_IMPORT=""
  for sym in safeErrorMessage corsHeaders readJsonBody; do
    grep -q "$sym" "$f" && ! grep -q "$sym" <(head -1 "$f") && NEED_IMPORT="$NEED_IMPORT $sym"
  done
  if [ -n "$NEED_IMPORT" ]; then
    # Append before the closing } on line 1
    sed -i "1s/} from/,${NEED_IMPORT} } from/" "$f"
  fi
  # Clean: remove doubled commas and space-comma artifacts
  sed -i 's/,,/,/g; s/ ,/,/g; s/{ ,/{ /g' "$f"

  echo " done"
done
echo "=== Done. Run: corepack pnpm test ==="

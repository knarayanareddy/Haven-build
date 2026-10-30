#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$DIR"
if [ "${CI:-}" != "true" ]; then
  export PATH="$DIR/bin:$PATH"
fi

if ! command -v supabase >/dev/null 2>&1; then
  if command -v npx >/dev/null 2>&1; then
    supabase() { npx -y supabase "$@"; }
  else
    echo "Supabase CLI is not installed and npx is unavailable." >&2
    exit 2
  fi
fi

./scripts/check-local-supabase.sh

# Read the stack's own view of itself even when the caller already exported a URL:
# the JWT secret lives here, and without it the signed-in test JWTs cannot be minted.
status_env="$(supabase status -o env 2>/dev/null || true)"

# `supabase status -o env` renamed some keys between CLI releases
# (ANON_KEY -> PUBLISHABLE_KEY, SERVICE_ROLE_KEY -> SECRET_KEY), so accept both
# rather than depending on whichever version the runner installed.
status_value() {
  local key="$1"
  printf '%s\n' "$status_env" | sed -n "s/^${key}=\"\\{0,1\\}\\([^\" ]*\\)\"\\{0,1\\}\$/\\1/p"
}
if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_ANON_KEY:-}" ]; then
  export SUPABASE_URL="${SUPABASE_URL:-$(status_value API_URL)}"
  export SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$(status_value ANON_KEY)}"
  if [ -z "${SUPABASE_ANON_KEY:-}" ]; then
    export SUPABASE_ANON_KEY="$(status_value PUBLISHABLE_KEY)"
  fi
fi
jwt_secret="$(status_value JWT_SECRET)"
if [ -z "$jwt_secret" ]; then
  jwt_secret="$(status_value SERVICE_ROLE_KEY | cut -d. -f2 | base64 -d 2>/dev/null | sed -n 's/.*"secret":"\([^"]*\)".*/\1/p')"
fi

make_local_jwt() {
  local sub="$1"
  JWT_SECRET="$jwt_secret" SUB="$sub" node <<'NODE'
const crypto = require("crypto");
const secret = process.env.JWT_SECRET;
const sub = process.env.SUB;
if (!secret || !sub) process.exit(2);
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const header = { alg: "HS256", typ: "JWT" };
const payload = {
  aud: "authenticated",
  exp: now + 3600,
  iat: now,
  iss: "supabase",
  sub,
  role: "authenticated"
};
const unsigned = `${b64(header)}.${b64(payload)}`;
const signature = crypto.createHmac("sha256", secret).update(unsigned).digest("base64url");
process.stdout.write(`${unsigned}.${signature}`);
NODE
}

if [ -z "${HAVEN_TEST_ELDER_JWT:-}" ] || [ -z "${HAVEN_TEST_FAMILY_JWT:-}" ] || [ -z "${HAVEN_TEST_UNRELATED_JWT:-}" ]; then
  if [ -z "$jwt_secret" ]; then
    echo "HAVEN live RLS JWTs are required when local Supabase JWT secret is unavailable." >&2
    exit 2
  fi
  export HAVEN_TEST_ELDER_ID="${HAVEN_TEST_ELDER_ID:-00000000-0000-0000-0000-000000000001}"
  export HAVEN_TEST_ELDER_JWT="${HAVEN_TEST_ELDER_JWT:-$(make_local_jwt 00000000-0000-0000-0000-000000000001)}"
  export HAVEN_TEST_FAMILY_JWT="${HAVEN_TEST_FAMILY_JWT:-$(make_local_jwt 00000000-0000-0000-0000-000000000002)}"
  export HAVEN_TEST_UNRELATED_JWT="${HAVEN_TEST_UNRELATED_JWT:-$(make_local_jwt 00000000-0000-0000-0000-000000000006)}"
fi

HAVEN_LIVE_RLS=1 corepack pnpm run test:integration:live

#!/usr/bin/env bash
# Browser-path CI verification.
#
# The full Playwright specs (family-dashboard.spec.ts, iphone-suite.playwright.spec.ts,
# vnext-flows.playwright.spec.ts) require live webserver processes (Next.js dev/preview)
# that cannot be started in the CI sandbox without production env vars and a full build.
#
# Instead, we run the Node-native static companions which verify every browser-path
# contract through file-system assertions — no server required:
#   - tests/e2e/iphone-suite-smoke.test.mjs  (app/html content + label checks)
#   - tests/e2e/vnext-flows.test.mjs          (vNext renderer + edge-fn contract checks)
#
# The full Playwright suites can be run locally with:
#   corepack pnpm run test:e2e:browser:all
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$DIR"
corepack pnpm install --frozen-lockfile
node tests/e2e/iphone-suite-smoke.test.mjs
node --test tests/e2e/vnext-flows.test.mjs
git diff --exit-code

#!/usr/bin/env bash
set -euo pipefail
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed in this environment. Supabase local reset requires Docker." >&2
  exit 2
fi

if ! command -v supabase >/dev/null 2>&1; then
  if command -v npx >/dev/null 2>&1; then
    supabase() { npx -y supabase "$@"; }
  else
    echo "Supabase CLI is not installed in this environment. Install Supabase CLI and Docker, then run: supabase start && supabase db reset" >&2
    exit 2
  fi
fi

if [ -f supabase/.temp/storage-version ]; then
  storage_version="$(tr -d '[:space:]' < supabase/.temp/storage-version)"
  if ! [[ "$storage_version" =~ ^v?[0-9]+([.][0-9]+)*$ ]]; then
    echo "Removing invalid local Supabase storage image cache tag: $storage_version" >&2
    rm -f supabase/.temp/storage-version
  fi
fi

# The CI database job brings the stack up (with a reduced service set) and applies
# every migration itself, so re-running both here would start the excluded containers
# and redo the reset. Set HAVEN_SKIP_LOCAL_START=1 to run only the lint step.
if [ "${HAVEN_SKIP_LOCAL_START:-}" != "1" ]; then
  supabase start
  supabase db reset
fi
lint_output="$(supabase db lint --level warning)"
printf '%s\n' "$lint_output"
LINT_OUTPUT="$lint_output" node <<'NODE'
const input = process.env.LINT_OUTPUT ?? "";
const firstJson = input.indexOf("{");
if (firstJson === -1) process.exit(0);

let parsed;
try {
  parsed = JSON.parse(input.slice(firstJson));
} catch {
  process.exit(0);
}

const extensionFunctions = new Set([
  "public.st_findextent",
  "public.populate_geometry_columns",
  "public.addgeometrycolumn",
  "public.dropgeometrycolumn",
  "public.dropgeometrytable",
  "public.updategeometrysrid",
  "public.get_proj4_from_srid",
  "public.postgis_full_version",
  "public.lockrow",
  "public.addauth",
  "public.enablelongtransactions",
  "public.longtransactionsenabled",
  "public.st_letters",
]);

const failures = [];
for (const result of parsed.results ?? []) {
  if (extensionFunctions.has(result.function)) continue;
  for (const issue of result.issues ?? []) {
    if (issue.level === "error") {
      failures.push(`${result.function}: ${issue.message}`);
    }
  }
}

if (failures.length) {
  console.error("HAVEN-owned database lint errors:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
NODE

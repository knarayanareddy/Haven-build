#!/usr/bin/env bash
# Static validation of supabase/migrations/*.sql.
#
# There is no database in CI for the fast path, so this checks what can be checked
# without one:
#   1. every migration parses under the PostgreSQL grammar (libpg_query via pglast);
#   2. every CREATE FUNCTION … LANGUAGE plpgsql body parses;
#   3. every table created in a migration ends up with RLS enabled + forced and at
#      least one policy, or is explicitly listed as service-role-only
#      (scripts/ci/audit-rls-coverage.mjs).
#
# Requires: python3 with pglast (`python3 -m pip install pglast`).
set -euo pipefail

cd "$(dirname "$0")/../.."

PYTHON_BIN="${PYTHON_BIN:-python3}"
if ! "$PYTHON_BIN" -c 'import pglast' >/dev/null 2>&1; then
  cat >&2 <<'MSG'
::error::pglast is required for SQL validation and is not importable.

  python3 -m venv .venv-sql
  .venv-sql/bin/pip install pglast
  PYTHON_BIN=.venv-sql/bin/python scripts/ci/verify-sql.sh
MSG
  exit 1
fi

"$PYTHON_BIN" - <<'PY'
import glob
import sys

import pglast

files = sorted(glob.glob("supabase/migrations/*.sql"))
if not files:
    sys.exit("no migrations found")

failed = []
plpgsql_total = 0
plpgsql_failed = 0

for path in files:
    sql = open(path, encoding="utf-8").read()
    try:
        pglast.parse_sql(sql)
        statements = []
    except Exception:
        try:
            statements = pglast.split(sql)
            for statement in statements:
                pglast.parse_sql(statement)
        except Exception as error:  # noqa: BLE001 - report and continue
            failed.append((path, str(error).splitlines()[0][:200]))
            continue

    if not statements:
        statements = pglast.split(sql)

    for statement in statements:
        lowered = statement.lower()
        if "language plpgsql" in lowered and lowered.lstrip().startswith("create"):
            plpgsql_total += 1
            try:
                pglast.parse_plpgsql(statement)
            except Exception as error:  # noqa: BLE001
                plpgsql_failed += 1
                failed.append((path, "plpgsql: " + str(error).splitlines()[0][:200]))

print(f"SQL syntax: {len(files)} migration file(s), {plpgsql_total} plpgsql function(s) parsed")
if failed:
    print(f"FAILED: {len(failed)} statement(s) did not parse")
    for path, message in failed:
        print(f"  {path}: {message}")
    sys.exit(1)

print("OK: every migration and plpgsql body parses.")
PY

echo
echo "── RLS coverage audit ──"
node scripts/ci/audit-rls-coverage.mjs

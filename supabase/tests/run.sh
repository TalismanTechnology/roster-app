#!/usr/bin/env bash
#
# Applies every migration to a throwaway Postgres database and runs the
# behavioral test suite against it.
#
# Deliberately does not need Docker or the Supabase CLI — it runs against a
# local Postgres install, so the schema can be verified on any machine in a
# few seconds. `_local_auth_shim.sql` stands in for the parts of the Supabase
# `auth` schema the migrations depend on.
#
# Usage:  ./supabase/tests/run.sh
#
# Requires: PostgreSQL 14+ (brew install postgresql@16)

set -euo pipefail

# macOS ships a locale that makes the postmaster abort on startup.
export LC_ALL=C LANG=C

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS="$HERE/../migrations"

# `|| true` matters: one of these globs will not match on any given machine,
# and the resulting nonzero `ls` would abort the script under `set -e`.
if [ -z "${PGBIN:-}" ]; then
  PGBIN="$(ls -d /opt/homebrew/opt/postgresql@*/bin \
                 /usr/local/opt/postgresql@*/bin \
                 /usr/lib/postgresql/*/bin 2>/dev/null | head -1 || true)"
fi
if [ -z "${PGBIN:-}" ] || [ ! -x "$PGBIN/psql" ]; then
  echo "Could not find a PostgreSQL install. Set PGBIN to its bin directory." >&2
  exit 1
fi

# Short paths: the Unix socket path has a 103-byte ceiling.
RUNDIR="${TMPDIR:-/tmp}/roster-schema-test"
SOCKET="/tmp/roster-pgtest"
PORT="${PGTEST_PORT:-55432}"

cleanup() {
  "$PGBIN/pg_ctl" -D "$RUNDIR/data" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$RUNDIR" "$SOCKET"
}
trap cleanup EXIT

rm -rf "$RUNDIR" "$SOCKET"
mkdir -p "$RUNDIR" "$SOCKET"

"$PGBIN/initdb" -D "$RUNDIR/data" -U postgres --auth=trust >/dev/null
"$PGBIN/pg_ctl" -D "$RUNDIR/data" \
  -o "-k $SOCKET -p $PORT -c listen_addresses=''" \
  -l "$RUNDIR/postgres.log" start >/dev/null

# pg_ctl returns before the server is reliably accepting connections.
for _ in $(seq 1 30); do
  "$PGBIN/pg_isready" -h "$SOCKET" -p "$PORT" >/dev/null 2>&1 && break
  sleep 0.3
done

psql() { "$PGBIN/psql" -h "$SOCKET" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q "$@"; }

psql -d postgres -c "create database roster_test;" >/dev/null
psql -d roster_test -f "$HERE/_local_auth_shim.sql" >/dev/null

for migration in "$MIGRATIONS"/*.sql; do
  printf '  applying %-24s' "$(basename "$migration")"
  psql -d roster_test -f "$migration" >/dev/null
  echo 'ok'
done

echo

# Capture rather than stream, so the run can be judged on its result. A failed
# assertion surfaces as an ERROR line and a nonzero psql exit; both are treated
# as failure so this is safe to wire into CI.
set +e
OUTPUT="$("$PGBIN/psql" -h "$SOCKET" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 \
  -d roster_test -f "$HERE/schema_test.sql" 2>&1)"
STATUS=$?
set -e

echo "$OUTPUT" | grep -E 'NOTICE|ERROR' || true

if [ $STATUS -ne 0 ] || ! echo "$OUTPUT" | grep -q 'CHECKS PASSED'; then
  echo
  echo "FAILED — schema behaviour does not match expectations." >&2
  exit 1
fi

echo
echo "Schema OK."

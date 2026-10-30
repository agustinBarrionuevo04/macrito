#!/usr/bin/env bash
# Corre las migraciones y los tests pgTAP en un Postgres 16 descartable, sin Docker.
# Requiere: postgresql-16, postgresql-16-pgtap y pg_prove (libtap-parser-sourcehandler-pgtap-perl).
# Con Docker usá `supabase start && supabase test db`, que prueba contra el stack real.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
supabase_dir="$(dirname "$here")"
pgbin="$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)"

# Postgres no corre como root: se reejecuta como el usuario `postgres`.
if [ "$(id -u)" = "0" ]; then
  exec su postgres -s /bin/bash -c "'$0' $*"
fi

work="$(mktemp -d)"
trap '"$pgbin/pg_ctl" -D "$work/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$work"' EXIT

port=54399
"$pgbin/initdb" -D "$work/data" -U postgres --auth=trust >/dev/null
"$pgbin/pg_ctl" -D "$work/data" -w -l "$work/pg.log" \
  -o "-p $port -k $work -c listen_addresses=''" start >/dev/null

psql_run() { psql -h "$work" -p "$port" -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

psql_run -f "$here/stub.sql"
for migration in "$supabase_dir"/migrations/*.sql; do
  psql_run -f "$migration"
done

pg_prove -h "$work" -p "$port" -U postgres -d postgres "$supabase_dir"/tests/*.test.sql

#!/usr/bin/env bash
# Postgres local efímero sin Docker (para tests y bancos de pruebas). Se carga con `source`.
# Requisitos: PostgreSQL 15+ con pgTAP y pg_prove (paquetes postgresql-NN-pgtap y
# libtap-parser-sourcehandler-pgtap).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PORT="${PGPORT:-54329}"
DATA="${PGDATA_DIR:-${TMPDIR:-/tmp}/mymoney-pgdata}"

run_pg() {
  if [ "$(id -u)" = "0" ]; then runuser -u postgres -- "$@"; else "$@"; fi
}

pg_local_start() {
  rm -rf "$DATA"
  mkdir -p "$DATA"
  [ "$(id -u)" = "0" ] && chown postgres:postgres "$DATA"
  run_pg "$PGBIN/initdb" -D "$DATA" -U postgres --auth=trust -E UTF8 --no-locale >/dev/null
  run_pg "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $DATA -c listen_addresses=''" -l "$DATA/log" -w start >/dev/null
  trap 'run_pg "$PGBIN/pg_ctl" -D "$DATA" -m fast stop >/dev/null' EXIT
  export PGHOST="$DATA" PGPORT="$PORT" PGUSER=postgres
  psql -q -d postgres -c "create database mymoney"
  psql -q -v ON_ERROR_STOP=1 -d mymoney -f "$ROOT/supabase/tests/local/supabase-shim.sql"
  for f in "$ROOT"/supabase/migrations/*.sql; do
    echo "→ migración $(basename "$f")"
    psql -q -v ON_ERROR_STOP=1 -d mymoney -f "$f"
  done
}

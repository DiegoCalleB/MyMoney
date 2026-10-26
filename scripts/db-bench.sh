#!/usr/bin/env bash
# Banco de pruebas de rendimiento con volumen (no forma parte del CI): ejecuta supabase/tests/bench/bench.sql
# sobre un Postgres local efímero y muestra tiempos.
set -euo pipefail
source "$(dirname "$0")/lib/pg-local.sh"
pg_local_start
psql -q -d mymoney -f "$ROOT/supabase/tests/bench/bench.sql"

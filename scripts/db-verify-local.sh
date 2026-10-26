#!/usr/bin/env bash
# Aplica las migraciones a un Postgres local efímero y ejecuta supabase/verify/001-security-checks.sql.
# Debe devolver 0 filas (el shim local no incluye las comprobaciones de storage ni del rol postgres: se
# omiten con su propio shim).
set -euo pipefail
source "$(dirname "$0")/lib/pg-local.sh"
pg_local_start
psql -d mymoney -c "alter role postgres bypassrls" >/dev/null 2>&1 || true
psql -d mymoney -f "$ROOT/supabase/verify/001-security-checks.sql"

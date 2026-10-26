#!/usr/bin/env bash
# Ejecuta migraciones + tests pgTAP contra un Postgres local efímero, sin Docker.
# Con Docker disponible, `supabase test db` es la alternativa de mayor fidelidad.
set -euo pipefail
source "$(dirname "$0")/lib/pg-local.sh"
pg_local_start
pg_prove -d mymoney "$ROOT"/supabase/tests/*.sql

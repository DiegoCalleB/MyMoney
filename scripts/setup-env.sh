#!/usr/bin/env bash
# Prepara el entorno de desarrollo (personas, agentes y CI): dependencias de Node y pgTAP para
# los tests de base de datos. Idempotente y no interactivo. No depende de ningún agente.
set -euo pipefail
cd "$(dirname "$0")/.."

pnpm install --prefer-offline

if ! command -v pg_prove >/dev/null 2>&1 || ! ls /usr/share/postgresql/*/extension/pgtap.control >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1 && [ -d /usr/lib/postgresql ]; then
    SUDO=""
    [ "$(id -u)" != "0" ] && SUDO="sudo -n"
    PGMAJOR="$(ls /usr/lib/postgresql | sort -V | tail -1)"
    $SUDO apt-get update -q >/dev/null || true
    $SUDO apt-get install -y -q "postgresql-${PGMAJOR}-pgtap" libtap-parser-sourcehandler-pgtap-perl >/dev/null
  else
    echo "Aviso: instala PostgreSQL 15+ con pgTAP y pg_prove (o usa 'supabase test db' con Docker)." >&2
  fi
fi

#!/bin/bash
# Prepara las sesiones de Claude Code en la nube: dependencias de Node y pgTAP para los
# tests de base de datos (scripts/db-test-local.sh). Idempotente y no interactivo.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# `install` (no `ci`) aprovecha la caché del contenedor; el lockfile sigue mandando.
pnpm install --prefer-offline

# pgTAP y pg_prove para `pnpm test:db` (solo si faltan).
if ! command -v pg_prove >/dev/null 2>&1 || ! ls /usr/share/postgresql/*/extension/pgtap.control >/dev/null 2>&1; then
  SUDO=""
  [ "$(id -u)" != "0" ] && SUDO="sudo -n"
  PGMAJOR="$(ls /usr/lib/postgresql | sort -V | tail -1)"
  $SUDO apt-get update -q >/dev/null || true
  $SUDO apt-get install -y -q "postgresql-${PGMAJOR}-pgtap" libtap-parser-sourcehandler-pgtap >/dev/null
fi

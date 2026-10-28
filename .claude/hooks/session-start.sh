#!/bin/bash
# Envoltorio para Claude Code en la nube: la lógica vive en scripts/setup-env.sh (agnóstica).
set -euo pipefail
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
exec bash "$CLAUDE_PROJECT_DIR/scripts/setup-env.sh"

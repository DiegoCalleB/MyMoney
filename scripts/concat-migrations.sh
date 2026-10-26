#!/usr/bin/env bash
# Concatena las migraciones en supabase/dist/all-migrations.sql (ignorado por git) para pegarlas de una
# vez en el editor SQL de Supabase. Alternativa recomendada: `supabase link` + `supabase db push`.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/supabase/dist"
OUT="$ROOT/supabase/dist/all-migrations.sql"
{
  echo "-- MyMoney: migraciones 1-4 concatenadas ($(date -u +%Y-%m-%d)). Se ejecutan en una sola transacción."
  echo "begin;"
  for f in "$ROOT"/supabase/migrations/*.sql; do
    echo; echo "-- ===== $(basename "$f") ====="; cat "$f"
  done
  echo; echo "commit;"
} > "$OUT"
echo "Generado $OUT ($(wc -l < "$OUT") líneas)"

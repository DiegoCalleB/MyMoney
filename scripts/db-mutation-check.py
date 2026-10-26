#!/usr/bin/env python3
"""Prueba de mutación de la seguridad de la base de datos.

Introduce a propósito fallos típicos en las migraciones (políticas abiertas, FKs sin espacio,
permisos de escritura directa…) y exige que la batería pgTAP los detecte. Si una mutación
"sobrevive" (los tests siguen en verde) o no se puede aplicar, sale con error. Restaura siempre las
migraciones originales. Uso: python3 scripts/db-mutation-check.py
"""
import pathlib
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
MIG = ROOT / "supabase" / "migrations"
CORE = "20261026230000_core_multitenancy.sql"
LEDGER = "20261027000000_ledger.sql"
PLANNING = "20261027010000_planning.sql"
IMPORTS = "20261027020000_imports_storage.sql"

# (nombre, archivo, texto exacto, reemplazo)
MUTATIONS = [
    ("política de lectura abierta", LEDGER,
     "using (space_id = any ((select private.%I())::uuid[]))',", "using (true)',"),
    ("RLS sin forzar", LEDGER,
     "  execute format('alter table public.%I force row level security', p_table);", "  null;"),
    ("FK de valoraciones sin espacio", LEDGER,
     "  foreign key (account_id, space_id) references public.accounts (id, space_id) on delete cascade,\n"
     "  foreign key (asset_id, space_id) references public.assets (id, space_id) on delete cascade,\n"
     "  unique nulls not distinct (account_id, asset_id, as_of)",
     "  foreign key (account_id) references public.accounts (id) on delete cascade,\n"
     "  foreign key (asset_id, space_id) references public.assets (id, space_id) on delete cascade,\n"
     "  unique nulls not distinct (account_id, asset_id, as_of)"),
    ("FK sin índice de apoyo (import_rows)", IMPORTS,
     "  unique (batch_id, space_id, row_index),", "  unique (batch_id, row_index),"),
    ("escritura directa en el libro", LEDGER,
     "grant update (description, status, occurred_on) on public.transactions to authenticated;",
     "grant update (description, status, occurred_on) on public.transactions to authenticated;\n"
     "grant insert on public.transactions to authenticated;"),
    ("traspaso con patas externas permitido", LEDGER,
     "  if v_kind in ('internal_transfer', 'fund_switch', 'buy', 'sell') and v_ext > 0 then", "  if false and v_ext > 0 then"),
    ("libro sin cuadre por moneda", LEDGER,
     "  having sum(l.amount_minor) <> 0\n  limit 1;", "  having sum(l.amount_minor) <> sum(l.amount_minor)\n  limit 1;"),
    ("categoría de tipo distinto al movimiento", LEDGER,
     "coalesce(bool_or(v_kind in ('income', 'expense') and l.category_id is not null and c.kind <> v_kind), false)",
     "false"),
    ("tipo de categoría editable", LEDGER,
     "revoke update (kind) on public.categories from authenticated;", "select 1;"),
    ("política sin envolver en select", CORE,
     "using (id = any ((select private.readable_space_ids())::uuid[]));",
     "using (id = any (private.readable_space_ids()));"),
    ("asesor ve a todos los miembros", CORE,
     "using (user_id = (select auth.uid()) or space_id = any ((select private.peer_space_ids())::uuid[]));",
     "using (user_id = (select auth.uid()) or space_id = any ((select private.readable_space_ids())::uuid[]));"),
    ("bandera de otro espacio visible", CORE,
     "using (scope_type <> 'space' or scope_value = any ((select private.readable_space_ids())::text[]));",
     "using (true);"),
    ("nivel 3 de avisos permitido en la tabla", PLANNING,
     "  level smallint not null check (level between 1 and 2),", "  level smallint not null check (level between 1 and 3),"),
    ("RPC de avisos sin comprobar flags", PLANNING,
     "  if p_level not between 1 and 2 or not public.feature_enabled('reco.level' || p_level::text, p_space_id) then",
     "  if p_level not between 1 and 3 then"),
    ("bucket legible por cualquier usuario autenticado", IMPORTS,
     "using (bucket_id = 'imports' and (storage.foldername(name))[1] = any ((select private.peer_space_ids())::text[]));",
     "using (bucket_id = 'imports');"),
    ("borrado de cuenta sin exigir MFA", CORE,
     "  if not private.meets_sensitive_aal() then\n    raise exception 'Requiere verificación MFA reciente'",
     "  if false then\n    raise exception 'Requiere verificación MFA reciente'"),
    ("auditoría borrable", CORE,
     "  raise exception 'audit.events es de solo inserción' using errcode = 'insufficient_privilege';",
     "  return old;"),
]


def run_tests() -> bool:
    result = subprocess.run(["bash", str(ROOT / "scripts" / "db-test-local.sh")],
                            capture_output=True, text=True)
    return result.returncode == 0


def main() -> int:
    backup = pathlib.Path(tempfile.mkdtemp())
    for f in MIG.glob("*.sql"):
        shutil.copy(f, backup / f.name)
    failures = 0
    try:
        for name, file, old, new in MUTATIONS:
            path = MIG / file
            text = (backup / file).read_text()
            if old not in text:
                print(f"✗ NO APLICABLE: {name} (el texto ya no está en {file}; actualiza la mutación)")
                failures += 1
                continue
            path.write_text(text.replace(old, new, 1))
            if run_tests():
                print(f"✗ SOBREVIVE: {name} (los tests siguen en verde: faltan tests)")
                failures += 1
            else:
                print(f"✓ detectada: {name}")
            shutil.copy(backup / file, path)
    finally:
        for f in backup.glob("*.sql"):
            shutil.copy(f, MIG / f.name)
        shutil.rmtree(backup)
    print(f"\n{len(MUTATIONS) - failures}/{len(MUTATIONS)} mutaciones detectadas")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())

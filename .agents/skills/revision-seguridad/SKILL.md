---
name: revision-seguridad
description: Revisa un cambio de MyMoney (código, SQL, configuración) con la lista de comprobación de seguridad del proyecto antes de fusionarlo. Úsala antes de cada merge y antes de aplicar migraciones a un entorno remoto.
---

# Revisión de seguridad de un cambio

Contexto: `docs/plan/06-seguridad.md` (amenazas T1-T21) y `AGENTS.md`. Revisa el diff (`git diff <base>...HEAD`) y marca cada punto: cumple, no aplica o **hallazgo** (con archivo y línea).

## Base de datos
- [ ] Toda tabla nueva: RLS activada y **forzada**, políticas con `(select private.xxx_space_ids())`, sin `to anon`, sin `using (true)` fuera de `ref`.
- [ ] FKs entre tablas con `space_id`: **compuestas**. Sin FK a otra tabla sin `space_id`.
- [ ] Permisos mínimos: `revoke all` y `grant` por operación y columna; `space_id`, `id` y `created_at` no actualizables.
- [ ] Funciones: `search_path = ''`; `security definer` justificada y con comprobación explícita de rol; sin SQL dinámico concatenado.
- [ ] El libro (`transactions`, `transaction_legs`) solo se escribe por RPC; invariantes en la base de datos.
- [ ] Tokens y secretos: solo hashes; nada de PII en auditoría ni logs.
- [ ] Los tests pgTAP cubren aislamiento y cada rol, y fallan si se relaja la política.

## Aplicación
- [ ] La clave secreta de Supabase no aparece en `apps/web` ni en el *bundle*.
- [ ] Entradas validadas con Zod en el servidor; salidas escapadas; sin `dangerouslySetInnerHTML`.
- [ ] Mutaciones: comprobación de `Origin`, rol y AAL2 en acciones sensibles.
- [ ] Subidas: tamaño, tipo, *bucket* privado con ruta `space_id/…`, URL firmada de corta duración.
- [ ] Logs: solo campos de lista blanca; sin importes, correos ni descripciones.
- [ ] Cabeceras y CSP no relajadas (`unsafe-inline` en scripts, `frame-ancestors`).
- [ ] Dependencias nuevas justificadas, fijadas y sin avisos conocidos (`pnpm audit`).

## Datos y regulación
- [ ] Ningún dato real, ni nombres de personas reales, en el diff, tests o *fixtures*.
- [ ] Los textos de avisos no nombran productos, ISIN ni entidades, ni dicen "compra/vende/traspasa X". Nivel ≤ 2.

## Informe
Lista los hallazgos ordenados por gravedad (crítico, alto, medio, bajo) con: qué falla, escenario de ataque concreto, y arreglo propuesto. Si no hay hallazgos, dilo explícitamente e indica qué has comprobado.

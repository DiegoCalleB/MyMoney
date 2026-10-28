# ADR-0013: Monorepo con pnpm *workspaces*

- Estado: Propuesto
- Fecha: 2026-10-26

## Contexto
Hay una web, una librería de dominio, esquemas compartidos y la carpeta de Supabase. Se busca simplicidad.

## Decisión
- `pnpm` *workspaces* con `apps/*` y `packages/*`; `packageManager` fijado en `package.json`; `--frozen-lockfile` en CI.
- Sin Turborepo/Nx al principio; se añade caché de tareas solo si los tiempos de CI lo justifican (> 10 min).
- Límites de importación entre paquetes comprobados con lint.

## Consecuencias
- (+) Una sola herramienta; dependencias estrictas (pnpm no permite importar lo no declarado).
- (−) Sin caché de tareas incremental de entrada.

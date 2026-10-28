# ADR-0014: Patrones de seguridad y rendimiento del esquema de base de datos

- Estado: Propuesto
- Fecha: 2026-10-26

## Contexto
La primera versión del esquema (ADR-0004) aislaba por espacio con funciones por fila y claves simples. La revisión (`docs/plan/15-revision-bd.md`) encontró una vía de referencia entre espacios, un coste de políticas inaceptable con volumen y varias integridades que dependían de la aplicación.

## Decisión
1. **Políticas con arrays de espacios** envueltas en `(select …)` y *cast* explícito: `space_id = any ((select private.readable_space_ids())::uuid[])`. Una evaluación por consulta, índice por `space_id`.
2. **FKs compuestas** `(xxx_id, space_id)` hacia `unique (id, space_id)` en toda relación entre tablas con espacio. Los índices de apoyo empiezan por `space_id`.
3. **Permisos por operación y columna**; `space_id`, `id` y `created_at` no actualizables; funciones sin `EXECUTE` para `PUBLIC` ni `anon` por defecto.
4. **Libro de movimientos solo por RPC `security definer`** con comprobación explícita de rol; invariantes con *constraint triggers* diferidos y validación inmediata en la RPC.
5. **Auditoría encadenada por espacio**, purga por retención como único camino de borrado, anclaje del primer evento.
6. **Metatests sobre el catálogo** y prueba de mutación en CI semanal: una tabla, vista o función que incumpla las reglas rompe el CI.

## Alternativas consideradas
- Funciones por fila en las políticas (más legibles): 316× más lentas en la medición.
- Validar solo en la aplicación: se pierde la garantía ante cualquier otra vía de escritura.
- Un esquema por espacio: aislamiento más fuerte, migraciones y operación mucho más caras.

## Consecuencias
- (+) Aislamiento verificable automáticamente; rendimiento estable con volumen.
- (−) Más disciplina al añadir tablas (la skill `nueva-tabla` la automatiza); las validaciones diferidas cuestan ~0,05 ms por fila.
- Vigilar: `ANALYZE` tras cargas masivas; revisar el esquema si un espacio supera millones de patas.

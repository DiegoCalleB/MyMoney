# ADR-0008: Importación idempotente de CSV/extractos

- Estado: Propuesto
- Fecha: 2026-10-26

## Contexto
El usuario reimporta archivos, o importa extractos que se solapan. No puede haber duplicados ni pérdidas.

## Decisión
1. **Nivel archivo**: SHA-256 del archivo; único por (`space_id`, `account_id`, `file_sha256`). Reimportar el mismo archivo no hace nada.
2. **Nivel fila**: huella = SHA-256 de (`account_id`, fecha, importe en unidades mínimas, moneda, descripción normalizada, saldo posterior si el extracto lo trae, ordinal de ocurrencia de esa tupla dentro del archivo). Índice único parcial sobre las filas importadas; inserción con `ON CONFLICT DO NOTHING`.
3. Si la entidad proporciona un identificador de operación, se usa en lugar de la huella.
4. Vista previa (nuevas, duplicadas, errores) antes de confirmar; reversión completa del lote.
5. Mapeos de columnas guardados por entidad; análisis en el servidor; archivo original borrado a los 30 días.

## Limitaciones conocidas
- Si la entidad cambia la descripción de un movimiento ya importado, la huella cambia y aparecerá como nuevo: se mitiga con la detección de "posibles duplicados" (misma fecha e importe) para revisión manual.
- Dos archivos que se solapan con movimientos idénticos en distinto orden: el ordinal se calcula sobre el orden canónico (fecha, importe, descripción) para ser estable.

## Consecuencias
- (+) Reimportar es seguro; sin duplicados silenciosos.
- (−) Casos frontera que requieren revisión humana; se muestran, no se ocultan.

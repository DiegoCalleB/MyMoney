---
name: importador-entidad
description: Crea la plantilla de importación de extractos (CSV/XLSX) de una entidad financiera para MyMoney, idempotente y probada con datos ficticios. Úsala al añadir soporte para un banco, bróker, gestora o exchange.
---

# Plantilla de importación de una entidad

Contexto: ADR-0008 (idempotencia) y `docs/plan/14-caso-de-referencia.md` (qué exporta cada entidad).

## Reglas

- **Nunca** uses un extracto real como *fixture*, ni lo pegues en el chat, issues o commits. Los datos reales del usuario viven en `privado/` (ignorado por git) y no se leen para tests.
- Fabrica el *fixture* a mano: mismas columnas, formato de fecha, separador decimal, signos y codificación que el original; importes, fechas, descripciones e identificadores inventados.
- Analiza en el servidor; nada de evaluar fórmulas; límite de 5 MB y de filas.
- Importes con `parseAmount` (sin `number`), fechas como `CalendarDate` en la zona del espacio.

## Pasos

1. Documenta el formato en `packages/importers/<entidad>/README.md`: cómo se descarga, columnas, rarezas conocidas (p. ej., apuntes de staking, tramos de 3 meses, archivos que no deben re-guardarse) y fecha de la última comprobación.
2. Define el mapeo (`import_mappings.mapping`): columnas → fecha, importe, moneda, descripción, saldo posterior, identificador de operación si existe; y el tipo de transacción por cada tipo de fila (aportación, compra, dividendo, comisión…), generando patas que cuadren por moneda.
3. Huella por fila: usa el identificador de la entidad si existe; si no, la huella de ADR-0008 con ordinal de ocurrencia.
4. Tests con el *fixture* ficticio:
   - número de transacciones y cuadre de patas;
   - reimportar el mismo archivo no crea nada;
   - un archivo solapado solo crea las filas nuevas;
   - filas inválidas aparecen como error, no se descartan en silencio;
   - las descripciones se recortan a 200 caracteres y se respeta la opción de no guardarlas.
5. Si la entidad cambia su formato, añade una versión nueva del mapeo; no rompas la anterior.

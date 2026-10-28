# ADR-0023: Carga del IPC del INE en `ref.inflation_index`

- Estado: Propuesto
- Fecha: 2026-10-28

## Contexto
La rentabilidad real (ADR-0022) necesita el índice de precios mensual. La tabla `ref.inflation_index` existía pero nada la rellenaba. El INE publica la serie por una API abierta (Tempus, `servicios.ine.es`).

## Decisión
1. **Serie**: `IPC251852`, «Nacional. Índice general. Índice», unidad 133, mensual, encadenada a la base vigente. Comprobada con la API real (2002-01 a 2025-12, 288 meses); la variación anual de dic-2025 que se obtiene con ella (2,9 %) coincide con la que publica el INE.
2. **Lectura**: `parseIneCpi` (`packages/importers/src/ine-cpi.ts`), sin dependencias y probada con la respuesta real guardada como *fixture*. Usa `Anyo` + `FK_Periodo`, no `Fecha` (medianoche local, cambia de día UTC con el horario de verano). Falla ante una serie o unidad distintas, un mes repetido, un valor no positivo o con más de 4 decimales; los datos secretos se omiten.
3. **Petición**: `DATOS_SERIE/{COD}?date=AAAA0101:`. Sin parámetro de fechas la API devuelve un 404 en HTML.
4. **Escritura**: la función SQL `public.upsert_inflation_index` (solo `service_role`, idempotente, devuelve cuántas filas cambiaron) y la Edge Function `sync-inflation`, que la llama con la clave de servicio. Protegida con un secreto compartido (`SYNC_INFLATION_TOKEN`). Un error de formato no escribe nada.
5. **Frecuencia**: el INE publica a mediados de mes; basta una ejecución mensual (cron de Supabase) y una carga inicial manual.

## Alternativas consideradas
- Sembrar los datos en una migración: se quedarían antiguos y mezclarían datos con esquema.
- Escribir en `ref` desde la web: prohibido por la regla 3 (clave de servicio solo en funciones).
- Usar `Fecha` del INE: depende de la zona horaria.

## Consecuencias
- (+) Sin cargas manuales de IPC; el formato del INE queda vigilado por un lector estricto.
- (−) La Edge Function (Deno) no se ejecuta en CI: queda sin probar de extremo a extremo hasta su despliegue en *staging*, que requiere confirmación (regla 12) y definir el secreto `SYNC_INFLATION_TOKEN`.
- (−) Si el INE cambia de base o de código de serie, hay que actualizar `INE_CPI_SERIES`.

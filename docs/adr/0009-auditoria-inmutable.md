# ADR-0009: Registro de auditoría inmutable

- Estado: Propuesto
- Fecha: 2026-10-26

## Contexto
Accesos, cambios de permisos, exportaciones y borrados deben quedar registrados de forma que no se puedan alterar sin dejar rastro.

## Decisión
- Esquema `audit`, no expuesto por la API. Tabla `audit.events` sin *grants* de UPDATE/DELETE para ningún rol de la aplicación; inserción solo mediante una función `security definer` llamada desde *triggers* y RPC.
- Encadenado: `hash = SHA-256(prev_hash ‖ evento canónico)`; una tarea diaria verifica la cadena y alerta si se rompe. La inserción se serializa (bloqueo consultivo) para que la cadena sea lineal.
- Sin PII ni importes: actor como HMAC del `user_id`, IP como hash del prefijo.
- Los propietarios ven los eventos de su espacio mediante una vista filtrada.
- Fase 2: exportación periódica del último hash (o del lote) fuera de la base de datos para detectar reescrituras con privilegios de superusuario.

## Consecuencias
- (+) Evidencia fiable ante incidentes y reclamaciones.
- (−) Quien tenga control total de la base de datos podría reescribir toda la cadena; el anclaje externo de la fase 2 lo detecta.

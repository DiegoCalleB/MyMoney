# ADR-0003: Supabase en la UE para Postgres, Auth, Storage y tareas

- Estado: Propuesto
- Fecha: 2026-10-26

## Contexto
Hacen falta una base de datos relacional con transacciones fuertes y `numeric`, autenticación con MFA, almacenamiento de archivos y tareas programadas, con poca operación y datos en la UE.

## Decisión
- Supabase con proyectos separados para *staging* y producción en una región de la UE; Supabase CLI en local.
- Postgres como fuente de verdad, con RLS como barrera de multitenencia (ADR-0004).
- Supabase Auth: correo + contraseña, TOTP, sesiones con *refresh token* rotado.
- Storage privado para importaciones y exportaciones.
- Tareas (BCE, INE, purgas) con Edge Functions o `pg_cron` [decidir en la fase 0 según disponibilidad en el plan].
- Firmar el DPA; revisar subencargados y transferencias.

## Alternativas consideradas
- Postgres gestionado + Auth propio (Auth.js/Lucia): más control, más código de seguridad propio, que es justo lo que conviene no escribir.
- Firebase: sin modelo relacional ni `numeric` adecuados.
- Supabase autoalojado en la UE: plan B si se exige soberanía; más operación.

## Consecuencias
- (+) Rapidez, RLS nativa, MFA incluida, copias gestionadas.
- (−) Dependencia del proveedor (mitigada: Postgres estándar y migraciones SQL propias); empresa de EE. UU. (DPA y región UE).
- Vigilar: límites y precios del plan; el *Security Advisor*; la pausa de proyectos del plan gratuito.

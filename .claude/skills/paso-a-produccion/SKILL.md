---
name: paso-a-produccion
description: Lista de comprobación antes de aplicar migraciones o desplegar MyMoney en staging o producción. Úsala antes de cualquier cambio en un proyecto Supabase remoto o despliegue.
---

# Antes de tocar staging o producción

1. CI en verde en el commit exacto: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm test:db`.
2. `/security-review` sobre el diff, sin hallazgos críticos ni altos abiertos.
3. Migraciones compatibles hacia atrás (expandir/contraer); las destructivas, separadas en dos versiones. Migración inversa preparada.
4. Aplica primero en **staging**, nunca directamente en producción. Comprueba después:
   - la lista de migraciones remota coincide con `supabase/migrations/` (mismas versiones);
   - los avisos de seguridad y rendimiento de Supabase (*advisors*), sin tablas sin RLS ni funciones con `search_path` mutable.
5. Nada de datos reales en staging. Producción solo con aprobación explícita del propietario en esa conversación.
6. Secretos: ninguno nuevo en el repositorio; la clave secreta de Supabase solo en funciones del servidor, nunca en la web.
7. Tras desplegar: prueba de humo (salud, inicio de sesión de la cuenta sintética, cabeceras de seguridad) y anota el resultado en el PR.
8. Si algo falla: revierte el despliegue del código; las migraciones se corrigen con una migración nueva, nunca editando una aplicada.

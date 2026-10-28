# ADR-0004: Multitenencia por espacio, RLS en todo y acceso a datos desde el servidor

- Estado: Propuesto
- Fecha: 2026-10-26

## Contexto
Varios usuarios, hogares y, en el futuro, clientes comparten la misma base de datos. El fallo más grave posible es que alguien vea datos de otro espacio.

## Decisión
1. Entidades `spaces`, `space_members` (roles `owner`, `editor`, `viewer`, `advisor` con caducidad) y `space_invitations`.
2. Toda tabla de negocio lleva `space_id` y tiene RLS **activada y forzada**, con políticas basadas en funciones `private.can_read/can_write/is_owner` (`security definer`, `stable`, `search_path=''`, `(select auth.uid())`).
3. `anon` sin *grants*. `authenticated` con *grants* mínimos por tabla. Escrituras complejas mediante RPC `security invoker`.
4. **La UI accede a los datos solo desde el servidor** (Server Components/Actions con el JWT del usuario). Aun así, **se asume que cualquier usuario puede llamar directamente a la API** con su JWT: RLS es la barrera real, no la UI.
5. Los permisos se leen de la base de datos en cada petición (no se meten roles en el JWT), para que la revocación sea inmediata.
6. Tests pgTAP por tabla y rol + meta-test de cobertura de RLS en CI.
7. La clave secreta nunca está en la web.

## Alternativas consideradas
- Autorización solo en la capa de aplicación con un rol de BD privilegiado: un olvido en una consulta expone datos; se pierde la defensa en profundidad.
- Un esquema o base de datos por cliente: aislamiento más fuerte, operación y migraciones mucho más caras; reconsiderar solo para clientes empresariales.
- Roles en *claims* del JWT: revocación retrasada hasta que caduca el token.

## Consecuencias
- (+) Aislamiento verificable automáticamente; revocación inmediata.
- (−) Coste de rendimiento de las funciones en las políticas (mitigado con índices y `(select …)`); disciplina de tests por tabla.
- Visibilidad por cuenta dentro de un espacio: no soportada; se resuelve con varios espacios (decisión D2).

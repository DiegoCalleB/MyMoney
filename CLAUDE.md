# CLAUDE.md: MyMoney

Aplicación web de finanzas personales multiusuario y multihogar (España primero). El plan completo está en `docs/plan/` y las decisiones en `docs/adr/`. **Estado actual: fase de planificación; no hay código de producción hasta que el plan esté aprobado.**

## Idioma

- Documentación, textos de la interfaz y mensajes de commit: español.
- Identificadores de código, nombres de tablas y columnas: inglés.

## Comandos (se activan al terminar la fase 0)

```bash
pnpm install --frozen-lockfile
pnpm dev                 # web en local contra Supabase local
pnpm lint && pnpm typecheck
pnpm test                # unitarios + propiedades
pnpm test:db             # supabase start && supabase test db (pgTAP)
pnpm test:e2e            # Playwright + axe
supabase migration new <nombre>
supabase db reset        # recrea la BD local con migraciones y semilla ficticia
```

## Arquitectura en una línea

`apps/web` (Next.js App Router, TS estricto) → Supabase (Postgres + RLS, Auth, Storage) en la UE; toda la lógica financiera vive en `packages/finance-core` (pura) y la validación en `packages/schemas` (Zod).

## Reglas no negociables

### Seguridad
1. **Toda tabla nueva** en `public` lleva `space_id` (salvo `profiles`), `enable` + `force row level security`, políticas por rol usando las funciones de `private` y **sus tests pgTAP** en `supabase/tests/rls/`. Sin tests no se fusiona.
2. **La clave secreta de Supabase (o `service_role`) nunca** se usa en `apps/web`. Solo en `supabase/functions`. La web usa la clave publicable + el JWT del usuario.
3. Funciones SQL: `set search_path = ''`, nombres totalmente cualificados; `security definer` solo en `private` y con justificación en un comentario.
4. Nada de SQL dinámico concatenado. Nada de `dangerouslySetInnerHTML`.
5. Toda entrada se valida en el servidor con Zod (`packages/schemas`), aunque ya se valide en el cliente.
6. **Logs sin datos personales ni importes**: usar solo el `logger` de `apps/web/src/lib/logger.ts` con campos de la lista blanca.
7. Secretos solo en variables de entorno de cada entorno. Nunca en el repositorio, ni en tests, ni en ejemplos. `.env.example` sin valores.
8. Acciones sensibles (exportar, borrar, cambiar roles) exigen AAL2 si el usuario tiene MFA.
9. Dependencias fijadas en el *lockfile*; no añadir dependencias sin justificarlas en el PR.

### Dinero y fechas
10. Nunca `number`/`float` para dinero. Importes = `bigint` de unidades mínimas + moneda; tipos, precios y cantidades con `Decimal` (ADR-0005).
11. Nunca sumar monedas distintas sin conversión explícita con tipo **y fecha**.
12. Fechas contables = `CalendarDate`/`date`. La fecha de "hoy" se obtiene una vez con la zona del espacio y se pasa como parámetro; `finance-core` no llama al reloj.
13. Un traspaso interno **no** es una aportación. Toda transacción cuadra por moneda (ADR-0006).

### Dominio y explicabilidad
14. Las fórmulas viven solo en `packages/finance-core`, con tests de ejemplos y de propiedades; cobertura 100 %.
15. Cada cálculo público devuelve `{ value, explanation }` con método, entradas, supuestos y calidad del dato.
16. Estimaciones etiquetadas como tales en la UI; los supuestos son visibles y editables.

### Recomendaciones (límites legales)
17. Solo niveles 1 (educativo) y 2 (avisos por reglas sobre los datos del usuario). **Nunca** recomendar, nombrar ni enlazar productos, ISIN o entidades concretos. El nivel 3 está desactivado.
18. Los textos de los avisos viven en `messages/` y no se generan libremente; el test `reco-copy-guard` debe pasar.
19. No decir "test de idoneidad" ni "asesoramiento"; usar "perfil financiero" y "avisos".

### Datos de prueba
20. Solo datos ficticios (semilla de `supabase/seed`). Prohibido pegar extractos, saldos o nombres reales en el repositorio, issues, tests o prompts.

## Convenciones

- Commits convencionales (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`, `sec:`).
- Ramas: `feat/…`, `fix/…`; PR a `main` con CI verde.
- Migraciones: compatibles hacia atrás (expandir/contraer); `COMMENT ON` en cada tabla y columna, con etiquetas `[pii]`, `[financiero]`, `[menor]` cuando aplique.
- Accesibilidad: componentes con etiquetas, foco visible, sin información solo por color; axe sin violaciones serias.
- Nueva decisión de arquitectura ⇒ nuevo ADR en `docs/adr/` (plantilla en `0000-plantilla.md`).

## Antes de terminar una tarea

- [ ] `pnpm lint && pnpm typecheck && pnpm test` en verde
- [ ] Si tocaste SQL: `pnpm test:db` en verde y tests RLS añadidos
- [ ] Si tocaste flujos de usuario: E2E afectado actualizado
- [ ] Sin secretos ni datos reales en el diff
- [ ] Documentación (ADR, diccionario, plan) actualizada si cambió una decisión

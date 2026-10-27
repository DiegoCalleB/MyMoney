# AGENTS.md: MyMoney

Instrucciones para **cualquier agente de programación** (Codex, OpenCode, Antigravity, Gemini CLI, Cursor, Copilot, Claude Code, Aider, Jules…) y para personas. Es la única fuente de verdad: `CLAUDE.md`, `GEMINI.md` y `.aider.conf.yml` solo apuntan aquí. No dupliques contenido en ellos.

Aplicación web de finanzas personales multiusuario y multihogar (España primero). Plan completo en `docs/plan/`, decisiones en `docs/adr/`. **Estado: fase 0 (cimientos).**

## Idioma

- Documentación, textos de interfaz y mensajes de commit: español.
- Identificadores de código, tablas y columnas: inglés.

## Comandos

```bash
bash scripts/setup-env.sh   # instala dependencias y pgTAP (idempotente; úsalo al empezar una sesión)
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck
pnpm test                   # unitarios y de propiedades (finance-core, cobertura 100 %)
pnpm test:db                # migraciones + pgTAP en un Postgres local efímero, sin Docker
pnpm format                 # Prettier
pnpm agents:sync            # replica .agents/skills a las rutas de cada herramienta
pnpm agents:check           # falla si las réplicas no están sincronizadas (CI)
```

Con Docker disponible, `supabase test db` es la alternativa de mayor fidelidad para los tests de base de datos.

## Arquitectura en una línea

`apps/web` (Next.js App Router, TypeScript estricto) → Supabase (Postgres + RLS, Auth, Storage) en la UE. Toda la lógica financiera vive en `packages/finance-core` (pura) y la validación en `packages/schemas` (Zod).

## Reglas no negociables

### Seguridad
1. **Toda tabla nueva** en `public` lleva `space_id` (salvo las del propio usuario: `profiles` y `user_consents`, con RLS por `user_id`), RLS activada **y forzada**, políticas por rol con los arrays de `private` (`readable_space_ids()`, `writable_space_ids()`…) y **sus tests pgTAP**. Sin tests no se fusiona.
2. **Integridad entre espacios**: toda clave foránea hacia otra tabla con `space_id` es **compuesta** `(xxx_id, space_id)`. El test `050-tenant-integrity` lo comprueba.
3. La clave secreta de Supabase (o `service_role`) **nunca** se usa en `apps/web`: solo en `supabase/functions`. La web usa la clave publicable y el JWT del usuario.
4. Funciones SQL: `set search_path = ''` y nombres cualificados; `security definer` solo con una justificación en un comentario y comprobación explícita de permisos.
5. El libro de movimientos (`transactions`, `transaction_legs`) **solo se escribe por RPC** (`create_transaction`, `reverse_transaction`, `delete_transaction`). Ningún permiso directo de escritura.
6. Nada de SQL dinámico concatenado ni de HTML sin escapar (`dangerouslySetInnerHTML` prohibido).
7. Toda entrada se valida en el servidor con Zod (`packages/schemas`), aunque ya se valide en el cliente.
8. **Logs sin datos personales ni importes**: solo el `logger` de `apps/web/src/lib/logger.ts`, con campos de lista blanca.
9. Secretos solo en variables de entorno. Nunca en el repositorio, tests, ejemplos ni issues. `.env.example` sin valores.
10. Acciones sensibles (exportar, borrar, cambiar roles) exigen AAL2 si el usuario tiene MFA.
11. Dependencias fijadas en el *lockfile*; no añadas dependencias sin justificarlas.
12. **No apliques migraciones ni cambios a un proyecto Supabase remoto sin confirmación explícita del usuario** en esa conversación. Primero staging.

### Dinero y fechas
13. Nunca `number`/`float` para dinero. Importes = `bigint` de unidades mínimas + moneda; tipos, precios y cantidades con `Decimal` (ADR-0005). En JSON, `bigint` y `numeric` viajan como cadenas.
14. Nunca sumes monedas distintas sin conversión explícita con tipo **y fecha**.
15. Fechas contables = `CalendarDate`/`date`. "Hoy" se obtiene una vez con la zona del espacio y se pasa como parámetro; `finance-core` no llama al reloj.
16. Un traspaso interno **no** es una aportación. Toda transacción cuadra por moneda (ADR-0006) y la base de datos lo impone.

### Dominio y explicabilidad
17. Las fórmulas viven solo en `packages/finance-core`, con tests de ejemplos y de propiedades; cobertura 100 %.
18. Cada cálculo público devuelve `{ value, explanation }` con método, entradas, supuestos y calidad del dato.
19. Estimaciones etiquetadas como tales en la UI; los supuestos son visibles y editables.

### Recomendaciones (límites legales)
20. Solo niveles 1 (educativo) y 2 (avisos por reglas sobre los datos del usuario). **Nunca** recomiendes, nombres ni enlaces productos, ISIN o entidades concretos. El nivel 3 está desactivado también en la base de datos.
21. Los textos de los avisos viven en `apps/web/src/messages/` y no se generan libremente; el test `reco-copy-guard` debe pasar.
22. No uses "test de idoneidad" ni "asesoramiento"; usa "perfil financiero" y "avisos". La app informa y calcula; la persona decide.

### Datos personales y de prueba
23. Solo datos **ficticios** en el repositorio (`supabase/seed`, *fixtures*, tests, capturas, issues, logs).
24. Los datos reales del usuario viven en `privado/` (ignorado por git). **No leas, copies ni resumas nada de `privado/`** salvo que el usuario te lo pida en esa conversación, y nunca lo uses en tests ni lo escribas en archivos versionados.

### Sencillez de uso
25. La aplicación tiene que ser **sencilla de usar** aunque el modelo sea rico (ADR-0017): inicio con patrimonio por bolsillo y avisos activos; lo avanzado (composición, reglas, tramos, procedencia) bajo demanda; valores por defecto sensatos; configurar es opcional. Una función que obligue a entender el modelo de datos para empezar no está terminada.

## Convenciones

- Commits convencionales (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`, `sec:`). Ramas `feat/…`, `fix/…`; PR a `main` con CI verde.
- Migraciones: compatibles hacia atrás (expandir/contraer); `COMMENT ON` en cada tabla y columna con etiquetas `[pii]`, `[financiero]`, `[menor]` cuando aplique; nunca edites una migración ya aplicada a un entorno remoto.
- Accesibilidad: etiquetas, foco visible, sin información solo por color; axe sin violaciones serias.
- Nueva decisión de arquitectura ⇒ nuevo ADR en `docs/adr/` (plantilla `0000-plantilla.md`).

## Skills (procedimientos reutilizables)

Formato abierto *Agent Skills* (`SKILL.md` con `name` y `description`). Fuente: **`.agents/skills/`**. `pnpm agents:sync` las replica a `.claude/skills/`, `.github/skills/` y `.agent/skills/` para las herramientas que no leen `.agents/skills/`. **Edita solo `.agents/skills/`**.

| Skill | Cuándo usarla |
|---|---|
| `nueva-tabla` | Añadir o cambiar una tabla, columna o política (RLS + tests) |
| `regla-aviso` | Añadir o cambiar un aviso o texto que sugiera algo al usuario |
| `funcion-financiera` | Añadir un cálculo a `finance-core` |
| `importador-entidad` | Soporte para importar extractos de una entidad |
| `revision-seguridad` | Revisar un cambio antes de fusionarlo |
| `paso-a-produccion` | Antes de tocar staging o producción |

Si tu herramienta no carga skills automáticamente, lee el `SKILL.md` correspondiente antes de empezar la tarea.

## Antes de terminar una tarea

- [ ] `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` en verde
- [ ] Si tocaste SQL: `pnpm test:db` en verde y tests añadidos
- [ ] Si tocaste `.agents/`: `pnpm agents:sync`
- [ ] Sin secretos ni datos reales en el diff
- [ ] Documentación (ADR, plan) actualizada si cambió una decisión

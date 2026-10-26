# 13. Estructura del repositorio y `CLAUDE.md`

## Estructura propuesta (monorepo `pnpm`, ADR-0013)

```
MyMoney/
├── CLAUDE.md                      # Convenciones, comandos y reglas de seguridad (ya creado)
├── README.md
├── package.json                   # Scripts raíz; "packageManager" fijado
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.base.json             # strict + opciones estrictas adicionales
├── eslint.config.mjs
├── .prettierrc
├── .gitignore                     # .env*, artefactos, supabase/.temp
├── .env.example                   # Nombres de variables, sin valores
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                 # lint, tipos, unitarios, pgTAP, E2E, seguridad
│   │   ├── deploy-staging.yml
│   │   ├── deploy-production.yml  # con aprobación manual
│   │   └── weekly-security.yml    # ZAP, Stryker, auditoría de dependencias
│   ├── dependabot.yml
│   ├── CODEOWNERS
│   └── pull_request_template.md
├── apps/
│   └── web/                       # Next.js App Router
│       ├── src/
│       │   ├── app/
│       │   │   ├── (public)/      # inicio, legal, auth
│       │   │   ├── (app)/s/[spaceId]/
│       │   │   │   ├── inicio/
│       │   │   │   ├── patrimonio/
│       │   │   │   ├── evolucion/
│       │   │   │   ├── objetivos/
│       │   │   │   ├── avisos/
│       │   │   │   └── ajustes/
│       │   │   └── api/           # Route Handlers mínimos (exportación, webhooks)
│       │   ├── server/            # Server Actions, acceso a datos, servicios (solo servidor: "server-only")
│       │   │   ├── supabase.ts    # Cliente con el JWT del usuario. NUNCA clave secreta
│       │   │   ├── actions/
│       │   │   └── queries/
│       │   ├── components/        # UI accesible
│       │   ├── lib/               # logger sin PII, rate limit, seguridad, i18n
│       │   ├── messages/es-ES/    # Catálogos de texto (incluidos avisos)
│       │   └── middleware.ts      # sesión, cabeceras, CSP con nonce, límites
│       ├── e2e/                   # Playwright + axe
│       └── next.config.ts
├── packages/
│   ├── finance-core/              # Dominio puro (ADR-0007)
│   │   ├── src/{money,fx,ledger,returns,fees,risk,planning,tax/es,rules}/
│   │   └── test/{unit,properties,fixtures}/
│   ├── schemas/                   # Zod compartido
│   └── config/                    # Configuraciones compartidas de TS y ESLint
├── supabase/
│   ├── config.toml
│   ├── migrations/                # SQL versionado (marca de tiempo)
│   ├── tests/                     # pgTAP: rls/, invariants/, functions/
│   ├── seed/                      # Generador de datos ficticios
│   └── functions/                 # Edge Functions: fx-ecb, cpi-ine, purge
├── docs/
│   ├── plan/                      # Este plan
│   ├── adr/
│   ├── arquitectura.md
│   ├── datos/diccionario.md       # Generado
│   ├── seguridad/{amenazas.md, asvs-checklist.md, matriz-permisos.md, secretos.md, respuesta-incidentes.md}
│   └── privacidad/{eipd.md, registro-actividades.md, retencion.md}
└── modules/                       # Futuro: módulos personales (ADR-0011), vacío en el MVP
```

Reglas de dependencia (comprobadas con lint de importaciones):
- `finance-core` no importa nada del repositorio salvo tipos de `schemas` (o nada en absoluto).
- `apps/web/src/components` no importa `server/`.
- Solo `supabase/functions` puede leer la variable de la clave secreta.

## `CLAUDE.md` inicial

Creado en la raíz del repositorio: [`/CLAUDE.md`](../../CLAUDE.md). Se actualizará al terminar la fase 0 con los comandos reales.

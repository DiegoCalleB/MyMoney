---
name: regla-aviso
description: Añade o modifica una regla de avisos de MyMoney (niveles 1-2) respetando los límites legales, con explicación completa y tests por perfil. Úsala para cualquier aviso, recomendación o texto que sugiera al usuario qué mirar o hacer.
---

# Nueva regla de avisos

Contexto obligatorio: `docs/plan/07-privacidad-y-regulacion.md` (frontera del asesoramiento) y ADR-0010.

## Límites que no se negocian

- Solo nivel 1 (educativo) o 2 (hechos y umbrales sobre los datos del propio usuario). El nivel 3 está desactivado.
- Nunca nombrar, enlazar ni sugerir un producto, ISIN, gestora o entidad concretos.
- Nunca "compra / vende / traspasa / mantén X". Como mucho, acciones genéricas ("revisar comisiones", "valorar ampliar el colchón").
- La regla no genera texto libre: devuelve `messageKey` + `params`; el texto vive en `apps/web/src/messages/es-ES/`.

## Pasos

1. Crea `packages/finance-core/src/rules/<id>.ts` con `id`, `version`, `level`, `countries`, `requiredInputs` y `evaluate(snapshot, assumptions, profile, today)` → `Finding | null`. Sin reloj ni E/S; la fecha llega por parámetro.
2. `Finding` incluye: `severity`, `messageKey`, `params`, `inputsUsed`, `assumptionsUsed` (umbrales editables), `confidence` (baja si faltan datos o hay valoraciones antiguas), `risks` y `limitsKey`.
3. Umbrales como supuestos con valor por defecto versionado (tabla `assumptions`), nunca fijos en el código.
4. Textos en el catálogo: por qué aparece, qué datos usa, supuestos, límites y aviso legal del nivel. Lenguaje claro; explica cada término técnico la primera vez.
5. Tests:
   - ejemplos y casos límite (sin datos, una sola cuenta, valoración antigua);
   - instantánea por perfil ficticio (`docs/plan/01-vision-alcance.md`: Lucía, Andrés, Marta, Carmen y Luis, Javi, Sara);
   - la regla no devuelve un nivel superior al permitido por las flags;
   - el guardián de textos (`reco-copy-guard`) pasa: sin ISIN, sin nombres de entidades, sin verbos de operación seguidos de un activo.
6. Si un texto de nivel 2 menciona un activo del usuario para describir un hecho, márcalo en el PR como **pendiente de revisión legal** (zona gris del capítulo 7).

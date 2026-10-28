# ADR-0010: Motor de avisos por reglas versionadas, con niveles y *feature flags*

- Estado: Propuesto
- Fecha: 2026-10-26

## Contexto
Queremos avisos útiles y explicables sin cruzar la frontera del asesoramiento en materia de inversión (ver `docs/plan/07`).

## Decisión
- Reglas como código en `finance-core/rules`, cada una con `id`, `version`, `level`, países y entradas requeridas; devuelven claves de mensaje y parámetros, nunca texto libre.
- Textos en catálogos i18n por país, revisados; test `reco-copy-guard` que prohíbe ISIN, nombres de entidades y verbos de operación sobre instrumentos en los niveles 1-2.
- Los *flags* `reco.level1/2/3` por país y espacio se pasan al motor; la RPC que guarda avisos rechaza niveles no permitidos (doble barrera).
- Cada aviso guarda la versión de la regla, el hash de las entradas, la instantánea de supuestos y el historial de eventos (mostrado, descartado…).
- La IA, si llega, solo reformula avisos ya generados (no es una fuente de avisos).

## Alternativas consideradas
- Motor de reglas genérico en BD (JSON configurable): flexible pero difícil de testear y de auditar.
- Un LLM que genere consejos: no explicable ni controlable a nivel legal.

## Consecuencias
- (+) Determinista, testeable con instantáneas por perfil, auditable.
- (−) Añadir una regla requiere desplegar; aceptable y deseable (revisión).

## Actualización (ADR-0017)
Las plantillas y métricas siguen siendo código de `finance-core`; los parámetros (umbral, ámbito, severidad) pasan a ser datos editables por el usuario en `advice_rules`, con historial. Los textos siguen saliendo solo del catálogo de mensajes.

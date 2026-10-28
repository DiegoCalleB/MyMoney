# ADR-0011: Módulos, *feature flags* e internacionalización

- Estado: Propuesto
- Fecha: 2026-10-26

## Contexto
Más adelante habrá módulos personales (aprendizaje, marketing, proyectos con IA), otros países e idiomas, y funciones por plan de suscripción.

## Decisión
- **Módulos**: cada módulo es una carpeta de rutas (`app/(app)/s/[spaceId]/m/<modulo>`), su propio prefijo de tablas (`learn_*`, `mkt_*`…) con el mismo patrón `space_id` + RLS, y se activa por espacio en `space_modules`. El núcleo no depende de ningún módulo.
- **Flags**: tabla `ref.feature_flags` con ámbitos `global`, `country`, `space` (precedencia: espacio > país > global); evaluación en el servidor; sin servicio externo en el MVP.
- **i18n**: catálogos de mensajes por configuración regional (`es-ES` primero) con una librería de i18n compatible con App Router [elegir en la fase 0]; formatos con `Intl`. **Paquetes de país** en `finance-core/tax/<pais>` y `messages/<pais>` para reglas fiscales y textos legales, separados del idioma.

## Consecuencias
- (+) Añadir un módulo o un país no toca el núcleo.
- (−) Las *flags* deben limpiarse cuando dejan de ser necesarias (revisión por fase).

# ADR-0026: Navegación por secciones con barra inferior

- Estado: Aceptado
- Fecha: 2026-10-31

## Contexto
El inicio acumulaba doce enlaces a pantallas distintas. Crecer más (gastos, inversión, asistente) lo hacía inmanejable en el móvil, que es donde más se usa la aplicación (ADR-0017: sencillez ante todo).

## Decisión
1. **Cinco secciones** en una barra de navegación: **Inicio** (patrimonio y avisos), **Gastos** (resumen, para revisar, cobros, apuntar, importar), **Inversión** (rentabilidad, reparto real, referencia, impuestos), **Asistente** y **Más** (valores, cuentas, conexiones, supuestos, seguridad, hogares).
2. La barra va **abajo en el móvil** (fija, con zona segura, objetivo táctil ≥ 56 px, sección actual con raya y negrita además del color) y **arriba en pantallas anchas**.
3. Las secciones que agrupan varias pantallas llevan un **sub-menú** de apartados bajo la barra.
4. La pertenencia de una ruta a una sección es una función pura (`lib/space-nav.ts`) con tests; las rutas no cambian, así que los enlaces existentes siguen valiendo.
5. El inicio conserva solo las acciones frecuentes (actualizar valores, apuntar movimiento, añadir cuenta) y un aviso de cargos por revisar cuando los hay.

## Consecuencias
- Una pantalla nueva se añade a `SECTIONS` (y a `SUBNAV` si procede); el test comprueba que cada una cae en una sola sección.
- La barra no muestra contadores (p. ej. cargos por revisar): para eso haría falta cargar datos en el marco; se hará si compensa.

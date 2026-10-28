# eToro

- **Estado: plantilla hecha, sin verificar.** El extracto `.xlsx` se lee con el lector propio de `packages/importers/src/xlsx.ts` (sin dependencias nuevas, con límites de tamaño, de entradas y de ratio de compresión; no evalúa fórmulas ni macros). La plantilla (`ETORO` en `src/entities.ts`) usa la hoja de actividad y cabecera exacta; sigue marcada `verified: false` y la interfaz lo avisa.
- **Para verificarla:** un extracto real (basta la fila de cabecera de la hoja de actividad y los valores distintos de la columna de tipo, sin importes).
- **Alternativa futura:** la API pública de eToro con clave de usuario (`docs/plan/16-integraciones.md`, paso I-6), pendiente de confirmar qué permisos da la lectura de cartera.

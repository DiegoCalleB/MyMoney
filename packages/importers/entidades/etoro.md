# eToro

- **Estado: sin plantilla.** El extracto de cuenta se descarga en `.xlsx`, y leerlo exige una dependencia nueva (lector de hojas de cálculo) que la regla 11 pide justificar antes de añadirla: superficie de ataque (archivos con fórmulas y macros), tamaño y mantenimiento.
- **Alternativas:** (1) exportar la hoja «Actividad de la cuenta» como CSV desde una hoja de cálculo y usar el detector genérico o una plantilla CSV; (2) la API pública de eToro con clave de usuario (`docs/plan/16-integraciones.md`, paso I-6), pendiente de confirmar qué permisos da la lectura de cartera.
- **Decisión pendiente de la persona propietaria:** ¿se acepta añadir un lector de `.xlsx` (por ejemplo, con límites estrictos de tamaño y sin evaluar fórmulas) o se prefiere el CSV manual?

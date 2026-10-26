# 2. Historias de usuario

Prioridad MoSCoW dentro de cada fase. Formato: *Como … quiero … para …*, seguido de criterios de aceptación verificables (Dado / Cuando / Entonces o lista comprobable). Cada historia "Must" del MVP tendrá al menos un test automático vinculado a su identificador (`HU-xx`).

## Fase 1: MVP personal

### Épica A: Cuenta, espacios y acceso

**HU-01 (Must). Registro e inicio de sesión seguros.**
Como usuario quiero registrarme con correo y contraseña y activar MFA para proteger mis datos financieros.
- La contraseña tiene al menos 12 caracteres y se comprueba contra contraseñas filtradas (si el plan de Supabase lo incluye; si no, contra una lista local de las más comunes) [A VERIFICAR qué plan lo incluye].
- El correo se verifica antes de poder crear datos.
- Se puede activar TOTP; con MFA activado, las acciones sensibles (exportar, borrar, cambiar roles) exigen sesión AAL2.
- Tras 5 intentos fallidos en 15 minutos desde la misma IP o contra la misma cuenta, se aplica una espera creciente y se registra un evento de auditoría.
- Los mensajes de error no revelan si el correo existe.

**HU-02 (Must). Espacios y roles.**
Como propietario quiero crear un espacio (hogar) e invitar a otra persona con un rol para gestionar las finanzas juntos.
- Roles: propietario, editor, solo lectura, asesor invitado (matriz en `04-modelo-datos.md`).
- La invitación caduca a las 72 h, es de un solo uso y su token se guarda como hash.
- Un espacio siempre tiene al menos un propietario (la base de datos lo impide).
- Cambiar roles queda en la auditoría con quién, cuándo, el antes y el después.
- **Test pgTAP**: un miembro del espacio A no puede leer, insertar, modificar ni borrar nada del espacio B.

**HU-03 (Should). Acceso de asesor con caducidad.**
Como propietario quiero dar acceso de solo lectura a un asesor durante N días para que revise mi situación.
- El acceso de asesor tiene `expires_at` obligatorio (30 días como máximo, renovable).
- El asesor no puede exportar, ver la auditoría ni ver los correos de los miembros.
- Al caducar, las políticas RLS dejan de concederle acceso sin que intervenga ningún proceso programado.

### Épica B: Cuentas, activos y movimientos

**HU-04 (Must). Alta de cuentas de cualquier tipo.**
Como usuario quiero dar de alta cuentas corrientes, depósitos, brókeres, fondos, planes de pensiones, monederos cripto, inmuebles, préstamos e hipotecas.
- Cada cuenta tiene moneda, tipo, liquidez (inmediata, días, meses, ilíquida), envoltorio fiscal (ninguno, fondo traspasable, plan de pensiones, PIAS, etc.) y titulares con porcentaje (la suma debe dar 100 %).
- No se pide ni se guarda el IBAN completo: solo los 4 últimos dígitos, opcionales.
- Las deudas se registran como cuentas con saldo negativo y sus condiciones (capital, tipo, plazo).

**HU-05 (Must). Registrar movimientos sin ambigüedad.**
Como usuario quiero registrar aportaciones, retiradas, traspasos internos, compras, ventas, dividendos, comisiones e impuestos.
- Un traspaso interno entre dos cuentas mías **no** cuenta como aportación ni como retirada en la rentabilidad (test de propiedad: la XIRR total del espacio es invariante ante traspasos internos).
- Toda transacción cuadra: la suma de importes de sus patas es cero por moneda (restricción en la base de datos).
- Las fechas son de calendario (`date`) en la zona del espacio; no hay hora salvo el sello técnico.
- Una transacción se corrige mediante una transacción inversa enlazada (no se borra si ya se usó en cálculos), salvo borrado explícito antes de 24 h.

**HU-06 (Must). Valoraciones con fecha.**
Como usuario quiero introducir el valor de una cuenta o posición en una fecha para ver la evolución de los activos sin precio automático (inmuebles, fondos, planes).
- Cada valoración tiene fecha, fuente (manual, importación, proveedor) y nota opcional.
- Una cifra derivada de una valoración de más de N días (90 por defecto) se muestra con la etiqueta "valoración de hace X días".

**HU-07 (Must). Importación CSV idempotente.**
Como usuario quiero importar el extracto CSV de mi entidad sin duplicar movimientos al reimportarlo.
- Reimportar el mismo archivo no crea nada y avisa: "archivo ya importado el …".
- Importar un archivo que se solapa con otro solo crea las filas nuevas (huella por fila, ver ADR-0008).
- Se muestra una vista previa con nuevas, duplicadas y erróneas antes de confirmar.
- Una importación se puede deshacer completa.
- Archivo máximo de 5 MB; se valida el tipo; el archivo original se borra a los 30 días.

**HU-08 (Should). Tipos de cambio.**
Como inversor con activos en USD quiero ver todo en EUR con el tipo de cambio de la fecha correcta.
- Tipos de referencia del BCE cargados a diario; en fin de semana o festivo se usa el último día hábil anterior y se indica.
- Cada cifra convertida puede mostrar el tipo y la fecha usados.

### Épica C: Entender el patrimonio

**HU-09 (Must). Patrimonio neto consolidado.**
- Activos, deudas y patrimonio neto a una fecha, con desglose por tipo, cuenta, moneda, titular y liquidez.
- Conciliación: la suma del desglose coincide exactamente con el total (test).
- Cada cifra tiene una vista "¿de dónde sale?" con las valoraciones, los movimientos y los tipos de cambio usados.

**HU-10 (Must). Aportado frente a ganado.**
- Por cuenta y total: aportaciones netas externas, valor actual y ganancia = valor − aportaciones netas.
- Las comisiones y los impuestos pagados se muestran por separado.

**HU-11 (Must). Rentabilidad XIRR, TWR y real.**
- XIRR anualizada por cuenta y total, y TWR cuando hay valoraciones en las fechas de los flujos. Si faltan, se usa una aproximación (Dietz modificado) etiquetada como tal.
- Rentabilidad real frente al IPC general de España (INE), con el periodo y el dato de inflación usados.
- Periodos de menos de un año: se muestra la rentabilidad acumulada, no la anualizada (anualizar periodos cortos engaña).

**HU-12 (Must). Historial con patrimonio tras cada acción.**
- Lista cronológica de movimientos con el patrimonio estimado después de cada uno, filtrable por cuenta y tipo.

**HU-13 (Should). Coste de comisiones.**
- Comisiones explícitas pagadas por año y estimación de costes implícitos (TER) a partir del dato que introduzca el usuario, con su proyección a N años.

**HU-14 (Should). Simulador de caídas.**
- El usuario elige escenarios (por ejemplo, renta variable −20/−35/−50 %, cripto −70 %) o los edita; se muestra el impacto por cuenta y total, y cuántos meses de gasto representa la pérdida.
- Los supuestos de cada escenario son visibles y editables. Etiqueta: "escenario hipotético, no previsión".

### Épica D: Objetivos y planificación

**HU-15 (Must). Colchón de emergencia.**
- Objetivo = gasto mensual declarado × meses (por defecto 6; 9-12 si es autónomo o tiene ingresos irregulares, editable).
- Solo cuentan las cuentas marcadas con liquidez inmediata.

**HU-16 (Must). Compra de vivienda.**
- Entradas: precio, porcentaje de entrada, gastos de compra estimados (porcentaje editable, con el ITP o el IVA según la comunidad autónoma como dato editable, no deducido), plazo y tipo de interés supuesto.
- Salida: ahorro necesario, ahorro proyectado en la fecha y cuota estimada por el sistema francés, con el esfuerzo sobre los ingresos si se declaran.
- Aviso permanente: "estimación orientativa; no es una oferta ni asesoramiento hipotecario".

**HU-17 (Should). Jubilación y estudios.**
- Proyección determinista con rentabilidad y aportación supuestas, en euros de hoy y en euros nominales; en la fase 2, rangos (percentiles) mediante simulación.

**HU-18 (Must). Compras programadas.**
- Definir aportaciones periódicas (mensual, trimestral, etc.) a una cuenta o activo; calendario de las próximas; recordatorio; al confirmar se crea el movimiento.
- La app **no** ejecuta ninguna orden.

### Épica E: Avisos y perfil

**HU-19 (Must). Avisos de nivel 1 y 2.**
- Reglas iniciales: colchón insuficiente; efectivo parado por encima de N meses de gasto; peso especulativo por encima del tope del usuario; comisión (TER o explícita) por encima de un umbral; concentración en un activo, entidad o moneda; objetivo en riesgo; valoraciones antiguas; deuda cara (tipo por encima del umbral) con efectivo parado.
- Cada aviso muestra: por qué aparece, qué datos usa (con enlace), qué supuestos y umbrales (editables), confianza, riesgos y límites.
- Se puede descartar con un motivo; queda el historial.
- Ningún aviso menciona productos, entidades ni ISIN concretos (test automático sobre los textos).

**HU-20 (Must). Perfil financiero.**
- Cuestionario breve: horizonte, objetivos, situación familiar y laboral, capacidad de soportar pérdidas (objetiva) y tolerancia (subjetiva), conocimientos.
- Se explica para qué se usa y que **no** es un test de idoneidad MiFID.
- Caduca a los 12 meses y se pide revisarlo.

### Épica F: Derechos y confianza

**HU-21 (Must). Exportar mis datos.**
- Exportación en JSON y CSV de todos los datos del espacio y del usuario, con AAL2; enlace firmado de un solo uso que caduca a los 15 minutos; queda en la auditoría.

**HU-22 (Must). Borrar mi cuenta de verdad.**
- Borrado del usuario; los espacios en los que es el único propietario se borran (con confirmación y aviso de que a los demás miembros se les quita el acceso).
- Los datos desaparecen de la base de datos en el momento y de las copias cuando caduca su retención (plazo indicado al usuario).
- La auditoría conserva solo identificadores seudonimizados.

**HU-23 (Must). Ver la actividad de seguridad.**
- Inicios de sesión recientes, dispositivos y sesiones activas, con la opción de cerrar las demás sesiones.

## Fase 2: grupo cerrado de amigos

| ID | Prioridad | Historia | Criterio clave |
|----|-----------|----------|----------------|
| HU-30 | Must | Alta por invitación y lista de espera | Solo correos invitados; límite de espacios por usuario |
| HU-31 | Must | Onboarding guiado por perfil | Un usuario nuevo llega a ver su patrimonio en menos de 10 minutos con datos manuales |
| HU-32 | Must | Plantillas de importación para las entidades más usadas | 5-8 entidades con tests de fixtures anonimizados |
| HU-33 | Should | Lotes fiscales FIFO y plusvalías estimadas | Coincide con casos resueltos a mano y revisados; regla de los dos meses detectada como aviso |
| HU-34 | Should | Presupuestos y categorías de gasto | Ver nota de datos de categoría especial en la sección 7 |
| HU-35 | Should | Proyecciones con rangos (Monte Carlo) | Semilla reproducible; percentiles 10/50/90 con supuestos visibles |
| HU-36 | Should | Notificaciones por correo (resumen mensual, compras programadas) | Sin cifras en el correo; solo un enlace a la app |
| HU-37 | Could | Explicaciones con IA de avisos ya generados | Solo reformula; guardarraíles y registro (sección 7) |
| HU-38 | Could | Precios automáticos de fondos y ETF | Proveedor con licencia validada |
| HU-39 | Should | Avisos fiscales informativos (umbral de los modelos 720/721, límite de aportación a planes de pensiones) | Parámetros por ejercicio con fuente BOE |

## Fase 3: clientes de pago

| ID | Prioridad | Historia |
|----|-----------|----------|
| HU-50 | Must | Suscripción y facturación (proveedor de pagos; la app no guarda tarjetas) |
| HU-51 | Must | Condiciones, privacidad y aviso legal revisados por un abogado; registro de consentimientos |
| HU-52 | Must | Soporte con acceso a datos solo con permiso explícito y temporal del cliente (tipo "asesor invitado") |
| HU-53 | Should | Conexión bancaria PSD2 mediante agregador autorizado |
| HU-54 | Could | Nivel 3 de recomendaciones con socio autorizado (solo si el dictamen legal lo permite) |
| HU-55 | Could | Segundo país e idioma (empezando por el paquete de reglas fiscales) |
| HU-56 | Could | Módulos personales (aprendizaje, marketing, proyectos con IA) detrás de *flags* solo para tu espacio |

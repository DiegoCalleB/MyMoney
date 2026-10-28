# 8. Diseño de experiencia

## Principios

1. **Primero la respuesta, luego el detalle**: cada pantalla responde una pregunta ("¿cuánto tengo?", "¿voy bien?") en la parte superior; el detalle y la explicación están a un toque.
2. **Toda cifra es pulsable** y abre "¿De dónde sale?": método, datos, supuestos, fecha y calidad del dato.
3. **Estimación ≠ hecho**: las cifras estimadas llevan un marcador visual (icono + texto "estimado", nunca solo color) y un tono distinto en el texto.
4. **Tono sin juicio**: "Tu colchón cubre 2 meses" en lugar de "Tienes muy poco ahorro". Nada de rojo alarmante por defecto; la severidad se comunica con texto.
5. **Privacidad en pantalla**: botón global "ocultar importes" (útil en público o con niños delante).

## Navegación

Escritorio: barra lateral. Móvil: barra inferior con 5 destinos y el resto en "Más".

| Destino | Pregunta que responde | Contenido |
|---------|-----------------------|-----------|
| **Inicio** | ¿Cómo estoy hoy? | Patrimonio neto, variación, aportado frente a ganado, 3 avisos principales, próximas compras programadas |
| **Patrimonio** | ¿Qué tengo y dónde? | Cuentas agrupadas por tipo, liquidez, titular y moneda; detalle por cuenta con movimientos y valoraciones |
| **Evolución** | ¿Cómo me va y por qué? | Gráfico de patrimonio, aportaciones frente a ganancia, XIRR/TWR, real frente a IPC, comisiones |
| **Objetivos** | ¿Llegaré? | Colchón, vivienda, jubilación, estudios; proyección con supuestos editables |
| **Avisos** | ¿Qué debería mirar? | Lista con explicación, descartados e historial |
| Más | | Simulador de caídas, compras programadas, importar, perfil, supuestos, espacio y miembros, seguridad, privacidad, ayuda |

Selector de espacio en la cabecera; vista "todos mis espacios" en la fase 2 si la respuesta a la pregunta 1 lo pide.

## Pantallas principales

1. **Bienvenida y alta**: registro → verificación del correo → propuesta de activar MFA (recomendado, se puede posponer en las fases 1-2; obligatorio para propietarios en la fase 3) → crear espacio → asistente.
2. **Asistente de primeros pasos** (estado vacío convertido en tarea): "Añade tu primera cuenta" con tarjetas por tipo (banco, inversión, pensión, cripto, inmueble, deuda, efectivo); cada tarjeta pide solo nombre, moneda y saldo actual. Lo demás, después. Objetivo: ver un patrimonio en menos de 10 minutos.
3. **Inicio** (descrita en la navegación).
4. **Detalle de cuenta**: saldo, aportado, ganancia, rentabilidad; pestañas de movimientos, valoraciones y titulares; acciones rápidas "registrar aportación", "actualizar valor".
5. **Nuevo movimiento**: el primer paso es el **tipo**, explicado en lenguaje llano ("He metido dinero de fuera" / "He movido dinero entre mis cuentas" / "He comprado"…). Así se evita confundir traspasos y aportaciones.
6. **Importar**: subir → mapear columnas (con vista previa de 5 filas) → revisar nuevas / duplicadas / errores → confirmar → resumen con "deshacer".
7. **Evolución**: gráfico de áreas apiladas (aportado frente a ganancia) + línea de patrimonio; selector de periodo; tabla accesible equivalente.
8. **Objetivo de vivienda**: formulario a la izquierda, resultado a la derecha (en móvil, uno debajo de otro); cada supuesto con su origen ("valor por defecto", "lo has cambiado tú").
9. **Simulador de caídas**: escenarios predefinidos como chips + edición; resultado por cuenta en barras y "equivale a N meses de gastos".
10. **Aviso (detalle)**: título, frase principal, bloque "por qué", "datos usados", "supuestos" (editables), "confianza", "límites", acciones "entendido", "no me aplica" (con motivo) y "¿te ha sido útil?".
11. **Perfil financiero**: cuestionario de una pregunta por pantalla en móvil, con progreso y "prefiero no responder".
12. **Espacio y miembros**: lista de miembros, roles, invitaciones pendientes, acceso de asesor con fecha de fin visible.
13. **Seguridad**: MFA, sesiones activas, actividad reciente.
14. **Privacidad**: exportar datos, borrar cuenta (con consecuencias explicadas y confirmación escribiendo el nombre del espacio).

## Estados vacíos, de carga y de error

| Situación | Tratamiento |
|-----------|-------------|
| Sin cuentas | Ilustración sobria + 1 acción principal + "¿qué datos necesito?" |
| Una sola cuenta | Las métricas que no tienen sentido (concentración) se ocultan con una explicación, no muestran 100 % |
| Sin valoraciones recientes | La cifra se muestra con "valor de hace X días" y una acción "actualizar" |
| Rentabilidad no calculable | "Aún no podemos calcularla: necesitamos al menos un movimiento y un valor posterior" en lugar de 0 % o NaN |
| Periodo < 1 año | Rentabilidad acumulada, con nota de por qué no se anualiza |
| Sin IPC del periodo | Se usa el último publicado y se dice |
| Carga | Esqueletos con dimensiones estables (sin saltos de diseño) |
| Error | Mensaje humano, sin detalles técnicos, con identificador para soporte y opción de reintentar |
| Sin conexión (PWA) | Solo lectura de la última vista **si** el usuario lo activa (por defecto no se guardan datos financieros en el dispositivo) |
| Sin ahorro / con deudas | Inicio centrado en el colchón y la deuda, sin mensajes de inversión |

## Accesibilidad (WCAG 2.2 AA)

- Contraste ≥ 4,5:1 en texto y ≥ 3:1 en componentes y gráficos; nunca información solo por color (positivo/negativo con signo y texto).
- Navegación completa con teclado, foco visible y no oculto (criterios 2.4.7, 2.4.11 de WCAG 2.2), orden lógico, enlace "saltar al contenido".
- Objetivos táctiles ≥ 24×24 px (criterio 2.5.8); en la práctica 44×44 en móvil.
- Gráficos con tabla de datos equivalente y resumen textual ("Tu patrimonio ha subido un 4 % en 12 meses, de 50.000 € a 52.000 €").
- Formularios con etiquetas visibles, errores asociados (`aria-describedby`) y resumen de errores; sin límites de tiempo salvo la sesión, con aviso y opción de extender.
- Autenticación accesible (criterio 3.3.8): se permite pegar contraseñas y usar gestores; sin pruebas cognitivas como único método.
- Importes leídos correctamente por los lectores de pantalla (formato `Intl.NumberFormat` con moneda; signo negativo explícito "menos").
- Respeto de `prefers-reduced-motion`, `prefers-color-scheme` y zoom al 200 % sin pérdida de contenido; texto redimensionable (pensando en Carmen y Luis).
- Lenguaje claro: glosario integrado (TER, XIRR, TWR, inflación) con explicaciones de 1-2 frases.
- Verificación: axe-core en los tests E2E de cada pantalla (0 violaciones serias), revisión manual con NVDA/VoiceOver por fase y un usuario real de más de 65 años en la prueba de la fase 2.

## Móvil

- *Mobile first*; PWA instalable con manifiesto e iconos.
- *Service worker* solo para recursos estáticos; los datos financieros **no** se cachean por defecto (`Cache-Control: no-store`).
- Formularios con teclado numérico (`inputmode="decimal"`) y aceptación de coma decimal según la configuración regional.
- Tablas que se convierten en tarjetas por debajo de 640 px.
- Rendimiento: LCP < 2,5 s en 4G simulada; JavaScript inicial < 200 KB comprimido en las rutas principales (presupuesto comprobado en CI).

## Internacionalización

- Todos los textos en catálogos (`es-ES` primero; claves estables). Formatos de número, moneda y fecha con `Intl` según la configuración regional del usuario, independiente de la moneda del espacio.
- Los textos de avisos y avisos legales son por país, no solo por idioma (España ≠ México aunque compartan idioma).

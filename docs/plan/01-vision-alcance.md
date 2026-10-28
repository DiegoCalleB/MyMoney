# 1. Visión y alcance

## Problema

La mayoría de las personas no sabe responder con precisión a tres preguntas:

1. **¿Cuánto tengo de verdad?** El dinero está repartido entre bancos, brókeres, gestoras, planes de pensiones, cripto, inmuebles y deudas. Las apps bancarias solo ven su propia entidad.
2. **¿Me está yendo bien?** Confundir *lo que he aportado* con *lo que he ganado* es lo normal: un saldo que sube puede ser solo aportaciones. Casi nadie compara con la inflación ni suma lo que pierde en comisiones.
3. **¿Voy a llegar a mis objetivos?** (colchón, vivienda, jubilación, estudios). Las calculadoras sueltas no usan tus datos reales ni dicen qué suponen.

Las herramientas actuales fallan por uno de estos lados: son hojas de cálculo frágiles, agregadores centrados en el gasto, o apps de una entidad que venden sus productos.

## Propuesta de valor

> "Tu patrimonio completo, entendido y honesto: cada cifra dice de dónde sale y qué supone."

- **Completo**: todos los tipos de activo y deuda, en varias monedas y entidades, incluidos los ilíquidos (con valoración manual y fecha).
- **Entendido**: aportado frente a ganado, rentabilidad por dinero (XIRR) y por tiempo (TWR), rentabilidad real, coste de comisiones, exposición a caídas.
- **Honesto**: estimaciones etiquetadas como tales, supuestos visibles y editables, ningún producto vendido, ningún consejo fuera de lo permitido.
- **Compartible con seguridad**: hogares con roles; un asesor puede ver solo lo que se le concede y durante el tiempo concedido.

## Perfiles de usuario (personas)

Se diseña para la diversidad real. Cada perfil se usa como caso de prueba de la experiencia y de los avisos.

| Perfil | Situación | Lo que necesita | Riesgo de diseño a evitar |
|--------|-----------|-----------------|----------------------------|
| **Diego y familia** (primer usuario) | Pareja con hijos, varias cuentas, fondos, plan de pensiones, objetivo de vivienda | Visión consolidada, objetivo vivienda con hipoteca, aportaciones programadas | Diseñar solo para él |
| **Lucía, 24, primer empleo** | Poco ahorro, sin inversiones | Empezar el colchón; educación sin jerga | Pantallas vacías que desaniman; consejos que suenan a venta |
| **Andrés, 38, autónomo** | Ingresos irregulares, IVA/IRPF trimestral | Colchón mayor, separar el dinero de impuestos del disponible | Reglas pensadas para nóminas fijas |
| **Marta, 45, en desempleo con hipoteca** | Gasta ahorro, tiene deuda | Cuánto tiempo aguanta (*runway*), priorizar deuda | Tono culpabilizador; mensajes de "invierte más" |
| **Carmen y Luis, 68, jubilados** | Pensión, depósito, piso pagado | Ingresos frente a gasto, inflación, sencillez, letra grande | Ignorar la accesibilidad; proyecciones a 30 años sin sentido |
| **Javi, 30, inversor avanzado** | Acciones de EE. UU. en USD, cripto, varios brókeres | Varias monedas, TWR, exposición, umbral del modelo 720/721 | Simplificaciones que le hagan desconfiar de las cifras |
| **Sara, 35, separada con custodia compartida** | Finanzas separadas con cuentas conjuntas de los hijos | Cuentas con titularidad parcial; espacios distintos | Suponer que un hogar es una unidad económica |
| **Asesor invitado** | Profesional al que el usuario da acceso temporal | Solo lectura, sin exportar, con caducidad | Que el acceso no caduque o que vea otros espacios |

## Alcance del MVP (fase 1, uso personal)

- Espacios, miembros y roles; invitaciones con caducidad; MFA.
- Cuentas de todos los tipos (incluidas deudas e inmuebles) con titulares y porcentaje.
- Movimientos manuales: aportación, retirada, traspaso interno, compra, venta, dividendo/interés, comisión, impuesto, traspaso entre fondos.
- Valoraciones manuales con fecha; tipos de cambio de referencia del BCE.
- Importación CSV idempotente con mapeo de columnas.
- Panel: patrimonio neto, desglose por tipo/cuenta/moneda/liquidez, aportado frente a ganado, evolución.
- Rentabilidad XIRR y TWR por cuenta y total, rentabilidad real frente al IPC (INE).
- Objetivos: colchón y vivienda (con hipoteca estimada por sistema francés), con proyección explicada.
- Simulador de caídas por clase de activo con exposición por cuenta.
- Compras programadas (calendario y recordatorios; **no** ejecuta nada).
- Avisos de nivel 1 y 2 con explicación completa.
- Perfil financiero con cuestionario honesto.
- Exportar todos los datos y borrar la cuenta.

## Qué NO haremos (y por qué)

| No haremos | Motivo |
|------------|--------|
| Recomendar productos concretos (ISIN, fondo X, bróker Y) | Es asesoramiento en materia de inversión; requiere autorización (ver sección 7). Desactivado por *flag*. |
| Ejecutar órdenes, mover dinero, custodiar fondos | Reservas de actividad (servicios de inversión, servicios de pago) y riesgo operativo desproporcionado |
| Comparar o recomendar hipotecas concretas | El asesoramiento hipotecario es actividad reservada (Ley 5/2019) [A VERIFICAR con un abogado] |
| Evaluar la solvencia o puntuar el crédito de nadie | Sistema de IA de alto riesgo según el Reglamento de IA si se automatiza; fuera del propósito |
| Presentar o confeccionar declaraciones de impuestos | Fuera del propósito; solo información orientativa |
| App nativa en el MVP | La PWA cubre el uso móvil a una fracción del coste |
| Conexión bancaria automática en el MVP | Coste, contrato con agregador, EIPD adicional; el CSV basta para validar el producto |
| Precios de mercado en tiempo real | Licencias de datos caras; las valoraciones diarias o manuales bastan para un patrimonio a largo plazo |
| Módulos personales (aprendizaje, marketing, IA) | Fuera del MVP; la arquitectura los admite como módulos (ADR-0011) |

## Métricas de éxito

- **Fase 1**: tu patrimonio cuadra al céntimo con los extractos de las entidades en una fecha dada (prueba de conciliación), y lo usas al menos una vez por semana durante 4 semanas.
- **Fase 2**: 5-15 personas activas; al menos el 70 % completa el alta de cuentas; ningún incidente de seguridad; satisfacción cualitativa con la explicabilidad de las cifras.
- **Fase 3**: conversión a pago, retención a 90 días y coste de soporte por usuario: los objetivos se fijan al cierre de la fase 2 con datos reales.

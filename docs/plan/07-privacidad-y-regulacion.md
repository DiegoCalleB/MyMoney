# 7. Protección de datos y análisis regulatorio

> **Aviso**: este análisis lo hace un equipo técnico con conocimientos de cumplimiento, **no es asesoramiento jurídico**. Las preguntas abiertas del final deben ir a un abogado especialista en mercado de valores y protección de datos **antes de la fase 3** (y, en lo relativo a menores y a la EIPD, antes de la fase 2).

## Parte A: protección de datos (RGPD y LOPDGDD)

### Roles

| Fase | Responsable | Encargados | Nota |
|------|-------------|------------|------|
| 1 (tú y tu familia) | Tú, aunque probablemente aplique la exención doméstica (art. 2.2.c RGPD) a tu propio uso [A VERIFICAR] | Supabase, hosting | Aun así, aplicamos el RGPD como si no hubiera exención: es la práctica a la que tendrá que llegar el producto |
| 2 (amigos) | Tú (o tu sociedad) como prestador del servicio | Ídem + correo, errores | Deja de ser uso doméstico: aplica el RGPD completo |
| 3 (clientes) | Tu sociedad | Ídem + pagos, soporte, IA | Contratos de encargo (DPA) firmados y registro de actividades |

### Evaluación de impacto (EIPD/DPIA)

**[RECOMENDACIÓN] Hacerla antes de la fase 2.** El art. 35 RGPD la exige cuando es probable un alto riesgo, y la AEPD publica una lista de tratamientos que la requieren (art. 35.4). Según nuestra lectura, concurren varios criterios de esa lista y de las directrices del CEPD (antes Grupo del Artículo 29, WP248): datos financieros de carácter muy personal, evaluación o perfilado (perfil de riesgo y avisos personalizados), datos de personas vulnerables (menores) y, más adelante, uso de nuevas tecnologías (IA). Con dos o más criterios se presume la necesidad de EIPD [A VERIFICAR con la lista vigente de la AEPD].

Contenido mínimo (plantilla de la AEPD "Gestión del riesgo y evaluación de impacto"):
1. Descripción sistemática del tratamiento (flujos de la sección 3).
2. Necesidad y proporcionalidad (tabla de minimización).
3. Riesgos para los derechos: divulgación de la situación económica, discriminación, fraude dirigido, presión familiar, **deducción de datos de categoría especial a partir de movimientos** (ver abajo), decisiones automatizadas.
4. Medidas: las de la sección 6, más las de esta sección.
5. Riesgo residual y, si es alto, consulta previa a la AEPD (art. 36).

### Minimización: qué datos pedimos y por qué

| Dato | ¿Se pide? | Finalidad | Alternativa menos intrusiva elegida |
|------|-----------|-----------|-------------------------------------|
| Correo | Sí | Acceso, seguridad, avisos de cuenta | — |
| Nombre visible | Sí (puede ser un alias) | Identificar a los miembros del hogar | Alias permitido |
| DNI/NIE, dirección, teléfono | **No** | — | — |
| Fecha de nacimiento | **No**; año opcional | Horizontes de jubilación y estudios | Solo el año, opcional |
| IBAN o número de cuenta | **Solo los 4 últimos dígitos, opcionales** | Distinguir cuentas | Nombre libre de la cuenta |
| Saldos, movimientos, valoraciones | Sí | Núcleo del servicio | Agregados por cuenta, no por comercio, en el MVP |
| Descripciones de movimientos importados | Recortadas (≤ 200 caracteres) y opcionales | Reconocer el movimiento | Opción "no guardar descripciones" en la importación |
| Ingresos y gastos mensuales | Opcional, como cifra agregada | Colchón y esfuerzo hipotecario | Una cifra mensual, no nóminas |
| Situación laboral y familiar | Opcional, categorías cerradas | Ajustar avisos (autónomo ⇒ colchón mayor) | Categorías, nunca texto libre |
| Datos de menores | Nombre visible, año de nacimiento opcional | Titularidad de cuentas y objetivos de estudios | Sin usuario propio |
| IP | Solo para seguridad, seudonimizada en la auditoría | Detección de abuso | Prefijo con hash |

**Riesgo de categorías especiales (art. 9 RGPD)**: las descripciones de los movimientos bancarios pueden revelar salud (farmacia, clínica), afiliación sindical o política (cuotas), religión (donativos) o vida sexual. El MVP **no categoriza gasto** y permite no guardar descripciones. Si en la fase 2 se añade el presupuesto por categorías, la EIPD debe actualizarse y las categorías no deben inferir datos de art. 9 (sin categorías como "salud" detalladas por comercio; o con consentimiento explícito y separado) [A VERIFICAR con un abogado].

### Base legal

| Tratamiento | Base | Nota |
|-------------|------|------|
| Prestar el servicio (cuentas, cálculos, avisos de nivel 1-2) | Ejecución del contrato (art. 6.1.b) | Las condiciones del servicio describen los avisos |
| Seguridad, prevención del fraude, auditoría | Interés legítimo (art. 6.1.f), con la ponderación documentada | |
| Correos de producto o novedades | Consentimiento (art. 6.1.a) y LSSI art. 21 | Casilla no marcada, separada |
| Analítica de uso | Consentimiento si usa cookies o almacenamiento no esencial (art. 22.2 LSSI) | [RECOMENDACIÓN] Analítica propia sin cookies y agregada, o ninguna en el MVP |
| IA generativa (fase 2+) | Contrato si es parte del servicio y se informa; consentimiento si es opcional | [RECOMENDACIÓN] Opcional y con consentimiento expreso |
| Datos de menores | Los introduce el progenitor o tutor como parte de su uso [A VERIFICAR la calificación con un abogado] | Sin acceso propio; el art. 7 LOPDGDD fija en 14 años la edad del consentimiento propio |
| Decisiones automatizadas (art. 22) | No aplicamos decisiones con efectos jurídicos o significativos: los avisos son informativos y la persona decide | Mantenerlo así es un requisito de diseño |

### Transparencia

- Aviso de privacidad por capas (resumen + completo), en lenguaje claro, enlazado en el registro y en el pie.
- En cada aviso de la app, el enlace "¿por qué veo esto?" cumple también una función de transparencia sobre el perfilado.
- Registro de actividades del tratamiento (art. 30) mantenido en `docs/privacidad/registro-actividades.md`.

### Derechos dentro de la app

| Derecho | Implementación |
|---------|----------------|
| Acceso y portabilidad (art. 15 y 20) | Exportación JSON y CSV completa (HU-21) en un formato documentado |
| Rectificación (16) | Edición directa |
| Supresión (17) | Borrado real (HU-22); se explica el plazo de las copias |
| Limitación y oposición (18, 21) | Desactivar los avisos personalizados (se queda solo el nivel 1); baja de comunicaciones |
| Información sobre decisiones automatizadas (22) | Explicación de cada aviso |
| Contacto | Correo de privacidad; plazo de respuesta de un mes (art. 12.3) |

### Retención

| Dato | Plazo | Motivo |
|------|-------|--------|
| Datos del espacio | Mientras exista la cuenta | Servicio |
| Archivos CSV originales | 30 días tras la importación | Permitir deshacer; después son innecesarios |
| Exportaciones | 24 h | Descarga |
| Invitaciones | Se borra el correo al aceptar o caducar; la fila a los 90 días | |
| Auditoría | 2 años seudonimizada [SUPUESTO] | Seguridad e investigación de incidentes |
| Logs técnicos | 30 días | Depuración |
| Copias | Según el plan (7 días diarias; PITR 7 días) | Recuperación |
| Avisos mostrados | Mientras exista la cuenta; en la fase 3, lo que diga el dictamen legal | Evidencia de qué se mostró |
| Cuentas inactivas | Aviso a los 18 meses y borrado a los 24 [SUPUESTO] | Minimización |

### Encargados del tratamiento

| Proveedor | Función | Ubicación de los datos | Transferencias | Acción |
|-----------|---------|------------------------|----------------|--------|
| Supabase | Base de datos, Auth, Storage | Región UE elegida al crear el proyecto (p. ej., Fráncfort) | Empresa de EE. UU.: soporte y subencargados [A VERIFICAR DPA, lista de subencargados y si está adherida al Marco de Privacidad UE-EE. UU. o usa CCT] | Firmar el DPA desde el panel; revisar subencargados |
| Hosting Next.js (p. ej., Vercel) | Ejecución de la web | Funciones en región UE configurables; CDN global | Empresa de EE. UU. [A VERIFICAR DPA y región de logs] | Configurar la región; DPA; plan de pago cuando sea comercial (el plan gratuito es para uso no comercial) [A VERIFICAR condiciones] |
| Correo transaccional (p. ej., Resend, Postmark, Brevo) | Verificación, invitaciones, avisos | Preferir región UE [A VERIFICAR] | Según proveedor | Correos sin cifras financieras |
| Errores (p. ej., Sentry) | Trazas | Región de datos UE disponible [A VERIFICAR] | | Depuración de PII |
| Pagos (fase 3, p. ej., Stripe) | Suscripciones | | | Nunca guardamos tarjetas |
| IA (fase 2+, proveedor de modelos) | Explicaciones | Preferir tratamiento en la UE y sin retención ni entrenamiento con los datos [A VERIFICAR condiciones vigentes] | | Solo agregados seudonimizados |
| Agregador PSD2 (fase 3) | Datos bancarios | Entidad autorizada como proveedor de información sobre cuentas | | EIPD específica |

### Menores

- No son usuarios en el MVP (pregunta 8). Se guarda el mínimo y se marca la columna con `[menor]`.
- No se generan perfiles de riesgo ni avisos dirigidos a menores; los objetivos de estudios son del adulto.
- Si en el futuro acceden: verificación de edad, consentimiento parental por debajo de 14 años (art. 7 LOPDGDD), interfaz adaptada y EIPD reforzada.

## Parte B: recomendaciones y regulación financiera

### Marco normativo (hechos con fuente)

1. **MiFID II, Directiva 2014/65/UE, art. 4.1.4**: define el *asesoramiento en materia de inversión* como la prestación de **recomendaciones personalizadas** a un cliente, a petición de este o por iniciativa de la empresa, **con respecto a una o más operaciones relativas a instrumentos financieros**. Es un servicio de inversión que requiere autorización.
2. **Reglamento Delegado (UE) 2017/565, art. 9**: una recomendación es personalizada si se presenta como idónea para esa persona o se basa en sus circunstancias, y consiste en comprar, vender, suscribir, canjear, reembolsar, mantener o asegurar un **instrumento financiero concreto**, o en ejercer (o no) un derecho sobre él. **No** es personalizada si se difunde exclusivamente al público.
3. **CESR, "Understanding the definition of advice under MiFID" (CESR/10-293, 2010)**: distingue el asesoramiento del *asesoramiento genérico* (por ejemplo, sobre clases de activos: "la renta variable es adecuada a largo plazo") y de la información general, que **no** son servicios de inversión. Sigue siendo la referencia interpretativa citada habitualmente [A VERIFICAR su vigencia frente a las Q&A posteriores de ESMA].
4. **España, Ley 6/2023, de 17 de marzo, de los Mercados de Valores y de los Servicios de Inversión** (sustituye al texto refundido de 2015): incorpora MiFID II; el asesoramiento en materia de inversión es un servicio de inversión reservado a las entidades autorizadas (empresas de servicios de inversión, incluidas las **EAFI**, y entidades de crédito). Desarrollo reglamentario en el **Real Decreto 813/2023** sobre el régimen jurídico de las ESI [A VERIFICAR artículos concretos en el texto consolidado del BOE].
5. **CNMV, página de información al inversor sobre asesoramiento** ([cnmv.es](https://www.cnmv.es/portal/Inversor/Asesoramiento)): describe el asesoramiento como recomendaciones personalizadas sobre productos, basadas en el **test de idoneidad**, que deben entregarse por escrito o en soporte duradero; y aclara que no es asesoramiento la recomendación genérica y no personalizada ni la difundida exclusivamente por canales dirigidos al público en general.
6. **Supervisión activa**: la CNMV revisó en 2026 la actividad de unos 100 perfiles de *finfluencers* y detectó que en torno al 10 % podría incumplir las normas o prestar asesoramiento sin autorización, con posible requerimiento de cese ([Funds Society](https://www.fundssociety.com/es/noticias/normativa/la-cnmv-revisa-la-actividad-en-redes-sociales-de-los-influencers-financieros/), [Forbes España](https://forbes.es/economia/902954/la-cnmv-detecta-que-un-10-de-los-finfluencers-incumplen-las-normas-sobre-recomendaciones-de-inversion/)). Indica que la frontera se vigila también fuera de las entidades clásicas.
7. **Otros regímenes que tocan el producto**:
   - **Criptoactivos, MiCA (Reglamento (UE) 2023/1114)**: el asesoramiento sobre criptoactivos es un servicio que requiere autorización como proveedor de servicios de criptoactivos [A VERIFICAR el artículo y el periodo transitorio en España].
   - **Planes de pensiones y seguros de ahorro (PIAS, *unit linked*)**: no son instrumentos financieros MiFID en todos los casos; su recomendación puede caer en la **distribución de seguros** (Real Decreto-ley 3/2020) o en la normativa de planes de pensiones [A VERIFICAR].
   - **Hipotecas, Ley 5/2019 de contratos de crédito inmobiliario**: el *asesoramiento* sobre préstamos inmobiliarios tiene un régimen propio para prestamistas e intermediarios [A VERIFICAR el alcance]. Nuestra calculadora de cuota es una herramienta genérica, no una recomendación de préstamo.
   - **Publicidad de productos de inversión, Circular 2/2020 de la CNMV**: aplicable si se publicitan productos; no hacemos publicidad de productos.
   - **Recomendaciones de inversión del Reglamento de Abuso de Mercado (596/2014, art. 3.1.35 y Reglamento Delegado 2016/958)**: aplica si se publican recomendaciones sobre emisores o instrumentos; no lo hacemos.
   - **Servicios de pago (PSD2, Directiva 2015/2366; Real Decreto-ley 19/2018)**: leer cuentas bancarias de terceros es un servicio de información sobre cuentas que requiere registro; por eso se usaría un agregador autorizado y no una conexión propia.
   - **Reglamento de IA (UE) 2024/1689**: la evaluación de la solvencia de personas físicas es de alto riesgo (anexo III). No la hacemos. Si se usa un asistente conversacional, hay obligaciones de transparencia (art. 50: informar de que se interactúa con una IA) [A VERIFICAR calendario de aplicación].

### Mapa de la frontera aplicado a la app

| Tipo de contenido | Ejemplo en MyMoney | ¿Es asesoramiento MiFID? | Nivel |
|-------------------|--------------------|---------------------------|-------|
| Información y educación financiera | "Qué es el TER y cómo afecta a largo plazo" | No | 1 |
| Herramienta de cálculo con los datos del usuario | XIRR, cuota hipotecaria, proyección con supuestos editables | No, si no recomienda un instrumento [lectura habitual; A VERIFICAR] | 1 |
| Aviso por reglas sobre los datos propios **sin producto concreto** | "Tu colchón cubre 2 meses; tu objetivo es 6" / "El 35 % de tu patrimonio está en un solo activo" / "Pagas un TER del 1,8 % en la cuenta X" | Con alta probabilidad no, porque no recomienda operar con un instrumento concreto; puede considerarse asesoramiento genérico [ZONA GRIS, A VERIFICAR] | 2 |
| Aviso que sugiere una acción sobre un instrumento que el usuario ya tiene | "Considera vender el fondo X" o "traspasa el fondo X" | **Probablemente sí** (recomendación personalizada sobre un instrumento concreto, incluido "mantener") | 3, **desactivado** |
| Sugerencia de producto concreto | "El ETF Y es más barato" | **Sí** | 3, **desactivado** |
| Comparador neutral de comisiones con lista pública no personalizada | Tabla de TER de categorías | Posible información genérica; riesgo de publicidad | Fuera del MVP |

**Reglas de diseño derivadas**:
1. Los avisos de nivel 2 describen **hechos y umbrales** sobre los datos del usuario y, como mucho, **acciones genéricas** no ligadas a un instrumento ("revisar comisiones", "valorar ampliar el colchón"), nunca "compra/vende/mantén X".
2. Si el aviso menciona un activo del usuario, es para **describir** un hecho (su peso, su TER introducido por el propio usuario), no para recomendar una operación sobre él. [ZONA GRIS: el abogado debe validar la redacción de cada plantilla de nivel 2 que mencione un activo.]
3. El perfil del usuario **no** se llama "test de idoneidad" y se explica que no lo es.
4. Los textos de los avisos viven en catálogos revisados; las reglas no pueden generar texto libre.
5. Un test automático prohíbe en los catálogos de nivel 1-2 los verbos de operación (comprar, vender, suscribir, reembolsar, traspasar, mantener) seguidos de un nombre de activo o ISIN, y cualquier ISIN o nombre de entidad.
6. Aviso visible: "MyMoney ofrece información y herramientas de cálculo. No presta asesoramiento en materia de inversión ni recomienda productos concretos."

### Niveles y *feature flags*

| *Flag* | Por defecto | Ámbito | Requisito para activarlo |
|--------|-------------|--------|--------------------------|
| `reco.level1` | Activado | Global | — |
| `reco.level2` | Activado en `ES`; desactivado en países sin revisar | País y espacio | Plantillas revisadas para ese país |
| `reco.level3` | **Desactivado** | País y espacio, solo con un socio | Dictamen legal + autorización propia o socio autorizado + test de idoneidad MiFID + conservación en soporte duradero |
| `ai.explanations` | Desactivado | Espacio, con consentimiento | EIPD actualizada, evaluación de calidad superada |

El motor (ADR-0010) recibe los *flags* como parámetro y descarta las reglas cuyo nivel no está activado; además, la función RPC que guarda avisos rechaza niveles no permitidos (doble barrera).

### Requisitos de cada recomendación

Cada aviso guarda y muestra:
- **Por qué se muestra**: la condición de la regla con los valores reales ("liquidez 4.200 € < objetivo 12.000 €").
- **Qué datos usa**: enlaces a las cuentas y valoraciones, con fechas.
- **Qué supuestos**: umbrales y parámetros, editables desde el propio aviso.
- **Confianza**: alta (datos recientes y completos), media (alguna valoración antigua o supuestos por defecto), baja (faltan datos clave).
- **Riesgos y límites**: qué no tiene en cuenta (fiscalidad, situación no declarada).
- **Aviso legal** del nivel.
- Historial: cuándo se generó, se mostró, se descartó y con qué motivo.

### IA generativa (fase 2 o posterior)

- **Papel limitado**: reformular y explicar avisos ya generados por las reglas, y responder dudas educativas de nivel 1. Nunca generar consejo nuevo.
- **Datos mínimos**: solo los parámetros del aviso y agregados redondeados; sin nombres, descripciones, entidades ni identificadores. Seudonimización antes de salir del servidor.
- **Guardarraíles**: instrucciones del sistema con el nivel permitido; validación de la salida (clasificador o reglas) que bloquea nombres de productos, ISIN y verbos de operación sobre instrumentos; respuesta de reserva segura.
- **Registro**: se guarda lo que se mostró al usuario (texto, versión del modelo y de las instrucciones, hash de las entradas) durante la vida de la cuenta.
- **Evaluación**: batería de casos (incluidos adversarios e inyección de instrucciones) en CI; revisión humana de una muestra; métrica de "fuera de nivel" que debe ser 0.
- **Transparencia**: etiqueta "texto generado por IA" (art. 50 del Reglamento de IA).

### Perfil del usuario (cuestionario honesto)

- 8-12 preguntas; separa **capacidad** de asumir pérdidas (objetiva: colchón, estabilidad de ingresos, horizonte) de **tolerancia** (subjetiva: qué harías si tu cartera cae un 30 %).
- Explica para qué se usa cada respuesta; todas las preguntas tienen "prefiero no responder".
- No asigna productos; ajusta umbrales (por ejemplo, el tope especulativo por defecto) y el tono de los avisos.
- Cuando capacidad y tolerancia no concuerdan, se dice abiertamente, sin juzgar.
- Caduca a los 12 meses o ante un cambio vital declarado.

### Preguntas abiertas para el abogado (ordenadas por impacto)

1. ¿Los avisos de nivel 2 que mencionan un activo **del propio usuario** para describir un hecho (peso, TER) pueden considerarse recomendación personalizada? ¿Qué redacción es segura?
2. ¿"Revisa las comisiones de tus fondos" o "valora ampliar tu colchón antes de invertir más" es asesoramiento genérico permitido sin autorización?
3. ¿Una herramienta de suscripción de pago con avisos de nivel 2 requiere algún registro o autorización en España?
4. Si en el futuro hay nivel 3 con un socio autorizado: ¿qué modelo encaja (agente vinculado de una ESI, acuerdo con una EAFI, marca blanca) y qué obligaciones nos trasladaría (MiFID, DORA, PBC)?
5. Planes de pensiones, PIAS y *unit linked*: ¿qué régimen aplica a avisos sobre ellos (distribución de seguros)?
6. Criptoactivos: ¿afecta MiCA a avisos de nivel 2 sobre el peso de cripto en el patrimonio?
7. Calculadora hipotecaria: ¿qué límites de la Ley 5/2019 debemos respetar en textos y funcionalidad?
8. Datos de menores introducidos por los progenitores: calificación del tratamiento y base legal.
9. ¿Exige la EIPD consulta previa a la AEPD con las medidas previstas?
10. Plazo de conservación de los avisos mostrados como evidencia frente a reclamaciones.
11. Condiciones de servicio: limitación de responsabilidad por estimaciones y errores de datos introducidos por el usuario.

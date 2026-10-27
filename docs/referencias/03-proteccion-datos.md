# 03. Protección de datos: RGPD, LOPDGDD y tratamiento con IA

- **Consultado el:** 2026-10-27 (respuesta de un cuaderno NotebookLM; los enlaces de las citas llegaron como redirecciones y se omiten aquí)
- **Ámbito y vigencia:** Reglamento (UE) 2016/679 (RGPD), Ley Orgánica 3/2018 (LOPDGDD), guías de la AEPD. Versión vigente por comprobar.
- **Verificado contra el texto oficial por:** `SIN VERIFICAR`. Nada de esta ficha cambia el diseño, los textos legales ni la EIPD hasta contrastarlo con el texto oficial.
- **Alimenta:** EIPD pendiente antes de la fase 2, `docs/plan/07-privacidad-y-regulacion.md`, política de privacidad, `user_consents`, `ai_explanations_allowed`, borrado de cuenta, etiquetas `[pii]`/`[financiero]`/`[menor]`.

## Decisiones que informa

1. **EIPD obligatoria.** Si se confirma (D1), la EIPD no es opcional: hay que completarla antes de tratar datos reales. Coincide con lo ya previsto en el plan.
2. **El consentimiento para las explicaciones con IA es una decisión nuestra, no una obligación legal citada.** El cuaderno lo presenta como obligatorio, pero no cita una norma que lo exija. Se mantiene (ADR-0019) porque es la opción más prudente, no porque esté probado que sea la única base.
3. **Personas sin cuenta.** El esquema guarda personas del hogar que no son usuarias (cotitulares, menores). Para ellas aplica el deber de informar del art. 14 RGPD (datos que no se obtienen del interesado), **que esta respuesta no menciona**. Falta decidir cómo se cumple.
4. **Borrado de cuenta.** La baja implica supresión más bloqueo (art. 32 LOPDGDD), no borrado inmediato. Falta decidir el plazo de bloqueo y contrastarlo con el diseño actual.
5. **Menores.** Edad de consentimiento y alcance de lo que se puede registrar sobre menores del hogar (ver «Problemas de esta respuesta», punto 6).

## Hechos

Todos `SIN VERIFICAR`. Los artículos proceden del cuaderno.

| Id | Hecho | Cita (según el cuaderno) |
| --- | --- | --- |
| D1 | La EIPD es obligatoria con alto riesgo. Según el cuaderno concurren varios criterios: datos financieros, perfilado, IA y menores. | RGPD art. 35.1 y 35.3.a); LOPDGDD art. 28.2; listas de la AEPD (art. 35.4) |
| D2 | Los movimientos pueden revelar categorías especiales (salud, religión, sindicación). Hay que levantar la prohibición del art. 9.1, y el consentimiento solo no basta si la finalidad principal es identificar ideología o religión. | RGPD art. 9.1 y 9.2.a); LOPDGDD art. 9 |
| D3 | La excepción doméstica no alcanza a la empresa que ofrece la plataforma: es responsable del tratamiento. | RGPD art. 2.2.c) y considerando 18 |
| D4 | Respuesta a derechos en 1 mes, ampliable 2 meses más en casos complejos con aviso en el primer mes. | RGPD art. 12.3 |
| D5 | Derechos: acceso, rectificación, supresión, limitación, portabilidad, oposición. | RGPD art. 15 a 21; LOPDGDD art. 12 a 18 |
| D6 | Art. 22: derecho a no ser objeto de decisiones únicamente automatizadas con efectos significativos. Los avisos meramente informativos no estarían incluidos. | RGPD art. 22 (**la cita de LOPDGDD art. 22 parece errónea**) |
| D7 | Edad mínima de consentimiento en España: 14 años. | LOPDGDD art. 7.1; RGPD art. 8.1 |
| D8 | El encargado exige contrato escrito con contenido mínimo y subencargados con autorización. | RGPD art. 28; LOPDGDD art. 33 |
| D9 | Transferencias fuera del EEE: adecuación, cláusulas tipo o normas corporativas vinculantes. | RGPD art. 44 a 47 |
| D10 | Brecha: notificar a la AEPD en 72 horas salvo riesgo improbable; informar a los interesados si el riesgo es alto. | RGPD art. 33 y 34 |
| D11 | Tras la baja, los datos se bloquean durante los plazos de prescripción, a disposición de jueces, Fiscalía y AEPD. | LOPDGDD art. 32; RGPD art. 17.3 |
| D12 | Deber de informar en dos capas (básica y detallada). | RGPD art. 13; LOPDGDD art. 11 |
| D13 | Registro de actividades (art. 30) y delegado de protección de datos (art. 37). | RGPD art. 30 y 37; LOPDGDD art. 34 |
| D14 | Seguridad adecuada al riesgo (cifrado, seudonimización, resiliencia, pruebas). | RGPD art. 32 |

## Parámetros con vigencia

Procedentes del cuaderno y `SIN VERIFICAR`. **Ninguno va todavía a una tabla `ref.*`.**

| Parámetro | Valor | Cita |
| --- | --- | --- |
| Edad de consentimiento | 14 años | LOPDGDD art. 7.1 |
| Respuesta a derechos | 1 mes (+2 meses) | RGPD art. 12.3 |
| Notificación de brecha | 72 horas | RGPD art. 33.1 |
| Sanción máxima, infracciones graves | 10 M€ o 2 % del volumen de negocio | RGPD art. 83.4 |
| Sanción máxima, infracciones muy graves | 20 M€ o 4 % del volumen de negocio | RGPD art. 83.5 |

Las cifras y artículos coinciden con lo que yo recuerdo, pero eso no equivale a verificarlas.

## Problemas de esta respuesta

1. **Citas sin fuente cargada.** Las citas del RGPD apuntan a EUR-Lex y las de la LOPDGDD al BOE, pero ninguno de los dos textos figuraba en la lista de fuentes del cuaderno que guardé (ver `fuentes-cuaderno.md`, apartado «Huecos»). Si no se han añadido desde entonces, estas citas salen de la memoria del modelo y no de documentos cargados.
2. **Vuelve a citar documentos internos y no oficiales.** Cita el «Marco Regulatorio y Fiscal» (documento interno) con una etiqueta que lo enlaza a la LOPDGDD, además de Privacy Driver y Sonomos. Retirar del cuaderno (grupos D y E del inventario).
3. **Fuentes inadecuadas para el hecho que apoyan.** El plazo de 10 días de traslado del encargado procede de un código de conducta sectorial (ASEDIE, sector infomediario), que no obliga a una app de finanzas personales. Varias citas de seguridad y brechas proceden de guías para administraciones públicas y de recomendaciones sobre videojuegos.
4. **Dos citas legales parecen erróneas** (recuerdo, hay que comprobar):
   - «LOPDGDD art. 22» para decisiones automatizadas: creo que ese artículo trata de videovigilancia.
   - «LOPDGDD art. 19» como base de legitimación: creo que trata de datos de contacto de profesionales.
5. **Confunde obligación legal con decisión de diseño.**
   - El consentimiento para las explicaciones con IA y para la agregación bancaria se presenta como exigencia del RGPD. La agregación por PSD2 tiene su propio consentimiento, distinto del del RGPD, y no la ofrecemos.
   - Cifrado AES-256, TLS 1.3, MFA AAL2 y los términos `state_diff` y `__reasoning_trace` son de nuestro diseño, no de la norma. El art. 32 no los prescribe.
   - Que el contrato con el proveedor de IA prohíba entrenar modelos es una buena práctica, no un requisito citado.
6. **Menores.** La «prohibición de recabar datos económicos del grupo familiar a través del menor» se apoya en Privacy Driver. Me suena a una regla del reglamento anterior (Real Decreto 1720/2007, art. 13) cuya vigencia hay que comprobar. Tampoco distingue entre el consentimiento del propio menor (servicio dirigido a él) y los datos de un menor que introduce un adulto.
7. **DPD mal generalizado.** Dice que es obligatorio en «entidades financieras». La LOPDGDD lo exige a tipos concretos de entidades (crédito, seguros, servicios de inversión), y no somos ninguna. La obligación podría venir por otra vía: elaborar perfiles a gran escala. Decidir con criterio profesional.
8. **Fechas del Reglamento de IA.** Mismas fechas que en la ficha 02: comprobar qué está en vigor hoy (ficha 04).
9. **Parámetro fuera de tema.** El umbral de 50.000 € de los modelos 720/721 es fiscal y viene del documento interno; pertenece a la ficha 01.
10. **Falsas contradicciones.** Edad de consentimiento del RGPD frente a la LOPDGDD no es una contradicción: el RGPD permite a los Estados bajar el límite. La comparación entre el art. 22 del RGPD y el art. 86 del Reglamento de IA tampoco lo es: tienen ámbitos distintos.
11. **Faltan temas esenciales.**
    - Deber de informar a personas cuyos datos no se obtienen de ellas (art. 14 RGPD).
    - Condiciones del consentimiento y su retirada (arts. 7 y 8).
    - Principios del art. 5 (minimización, limitación de la finalidad, limitación del plazo).
    - Protección de datos desde el diseño (art. 25).
    - Contenido mínimo de la EIPD (art. 35.7).
    - Cookies y comunicaciones electrónicas (ficha 09).

## Lo que las fuentes no dicen o necesita criterio profesional

- Cómo verificar la representación legal de un adulto sobre menores del hogar.
- Responsabilidad por una explicación de IA inexacta o que infiera un dato de categoría especial.
- Plazo de bloqueo concreto: el cuaderno apunta a otras normas (Código de Comercio, Ley General Tributaria) pero sin fuente cargada; revisar también normas sectoriales.
- Si los avisos por reglas y las explicaciones de IA caen o no bajo el art. 22.
- Si un movimiento revela un dato especial por inferencia: el cuaderno lo afirma sin fuente primaria.
- Estado vigente del marco de transferencias UE-EE. UU.

## Qué cambia cada año o con nuevas versiones

- Listas de tratamientos con EIPD de la AEPD y directrices del CEPD.
- Calendario del Reglamento de IA y competencias de la AESIA frente a la AEPD.
- Marco de transferencias internacionales.

## Contradicciones entre fuentes

Ninguna confirmada. Ver el punto 10 de «Problemas de esta respuesta».

## Siguiente consulta al cuaderno

Antes: **retirar del cuaderno** los documentos no oficiales e internos y **añadir** el texto oficial del RGPD (EUR-Lex), la LOPDGDD (BOE), la lista de tratamientos con EIPD de la AEPD y las directrices del CEPD. Después pedir, solo con fuentes cargadas y con cita literal del artículo: (1) arts. 5, 7, 14 y 25 RGPD; (2) contenido mínimo de la EIPD (art. 35.7) y los criterios de la lista de la AEPD, uno a uno, indicando cuáles se cumplen en un servicio de finanzas personales; (3) art. 22 RGPD y la guía de la AEPD sobre IA, con la redacción exacta sobre avisos informativos; (4) arts. 9 y 34 de la LOPDGDD, con el texto literal; (5) vigencia del Real Decreto 1720/2007 art. 13.

# 02. Regulación de avisos: información, recomendación y asesoramiento

- **Consultado el:** 2026-10-27 (respuesta de un cuaderno NotebookLM; los enlaces numerados `[n]` se perdieron al copiarla)
- **Ámbito y vigencia:** MiFID II, Reglamento Delegado (UE) 2017/565, Ley 6/2023 de los Mercados de Valores y de los Servicios de Inversión, guías de la CNMV y de ESMA. Versión vigente por comprobar.
- **Verificado contra el texto oficial por:** `SIN VERIFICAR`. Nada de esta ficha cambia reglas, mensajes ni el test `reco-copy-guard` hasta contrastarlo con el texto oficial.
- **Alimenta:** reglas 20 a 22 de `AGENTS.md`, ADR-0010 y ADR-0017, `docs/plan/07-privacidad-y-regulacion.md`, catálogo `apps/web/src/messages/`, `reco-copy-guard`.

## Decisiones que informa

1. **Qué puede decir un aviso de nivel 2.** Los avisos de MyMoney se calculan sobre los datos del propio usuario (por ejemplo, concentración o colchón). La duda legal es si eso es información o recomendación personalizada. Esta respuesta **no la resuelve con fuente oficial** (ver «Problemas de esta respuesta», punto 4).
2. **El cortafuegos es el instrumento financiero, no el ISIN.** La definición de asesoramiento exige recomendar **operaciones sobre instrumentos financieros**. Si eso se confirma, el test debe prohibir cualquier mensaje que sugiera operar (comprar, vender, traspasar, reembolsar, aumentar o reducir una posición) sobre un instrumento o una clase concreta, aunque no lleve ISIN ni nombre. Mantener la regla 20 más estricta que la ley es deliberado.
3. **Avisos informativos con base legal propia.** Los avisos por límites de garantía (Fondo de Garantía de Depósitos) y por umbrales de los modelos 720/721 se apoyan en normas distintas (ver fichas 06 y 01), no en esta.
4. **IA.** Cualquier texto generado por IA debe respetar la misma frontera y las obligaciones de transparencia (ficha 04).

## Hechos

Todos `SIN VERIFICAR`. Los artículos proceden del cuaderno.

| Id | Hecho | Cita (según el cuaderno) | Enlace oficial |
| --- | --- | --- | --- |
| R1 | El asesoramiento en materia de inversión es prestar recomendaciones personalizadas a un cliente sobre operaciones relativas a instrumentos financieros. | Ley 6/2023 art. 125.1.g) | BOE-A-2023-7053 (comprobar el artículo) |
| R2 | Una recomendación es personalizada si se dirige a una persona como inversor y se presenta como conveniente para ella o se basa en sus circunstancias. La difundida exclusivamente al público no lo es. | Ley 6/2023 art. 125.1.g) y desarrollo | Falta el texto de MiFID II art. 4.1.4 y del Reglamento Delegado (UE) 2017/565 art. 9 |
| R3 | La recomendación general (informes, análisis) es otra categoría, que no exige autorización como servicio de inversión. | Ley 6/2023 art. 126.1.e); Reg. Delegado 2017/565 art. 36 | BOE-A-2023-7053; EUR-Lex |
| R4 | El asesoramiento está reservado a entidades autorizadas (ESI y entidades de crédito) e implica evaluación de idoneidad y declaración de idoneidad. | Ley 6/2023 (artículos por comprobar) | BOE-A-2023-7053 |
| R5 | Los agregadores de cuentas son proveedores de servicios de pago regulados (PSD2), no servicio de inversión. | RDL 19/2018 | Ver ficha 05 |
| R6 | La Guía Técnica 2/2022 de la CNMV (conveniencia) matiza cuándo hay iniciativa del cliente. | Guía Técnica CNMV 2/2022, apartado cuarto, párr. 8 (según el cuaderno) | cnmv.es (comprobar) |

## Problemas de esta respuesta

1. **Fuentes no oficiales, y algunas son del propio proyecto.** Cita un «Marco Regulatorio y Fiscal para Aplicaciones de Finanzas Personales en España» enlazado a una URL del BOE que no corresponde, un blog comercial («FactuSync») y menciona `state_diff`, un término de nuestro propio diseño. Parece que el cuaderno contiene documentos internos o generados por IA. Hay que **retirarlos del cuaderno**: citarlos produce un razonamiento circular y no son derecho. Todo lo que dependa de ellos queda sin base.
2. **«Definiciones literales» dudosas.** Los textos de «información general» (con «Ley 6/2023, art. 200») y de «comunicación comercial» parecen construidos, no copiados de la ley. No tratarlos como cita legal hasta ver el artículo.
3. **Los criterios están mal explicados.** Dice que son «tres criterios acumulativos» y luego lista cinco. Además, mi lectura del Reglamento Delegado 2017/565 art. 9 es que la tercera condición es alternativa (se presenta como conveniente **o** se basa en las circunstancias personales), no acumulativa. Si es así, un mensaje basado en datos del usuario podría ser personalizado aunque no diga «es adecuado para ti». Hay que leer el artículo.
4. **El apartado 5 no tiene base oficial.** La conclusión de que los avisos por reglas sobre datos propios «no son recomendación» se apoya en el documento no oficial del punto 1. Las fuentes oficiales no la confirman. **Sigue siendo la zona gris y exige opinión jurídica.**
5. **Afirmaciones que no son obligaciones legales.** «El software debe incorporar reglas automáticas» para el límite de 100.000 € del FGD o los modelos 720/721 no es una obligación legal que cite una norma: es una especificación del documento no oficial.
6. **Fechas del Reglamento de IA por comprobar.** Dice 2 de agosto de 2026 para el art. 50 y 2 de diciembre de 2027 para los sistemas de alto riesgo. Esta última fecha no coincide con el calendario original que yo conozco (agosto de 2026) y podría reflejar una prórroga propuesta. Comprobar en EUR-Lex qué está en vigor hoy (ficha 04).
7. **«Prohibición expresa» de la ludificación.** Suena a exageración: no consta que las Directrices de ESMA sobre gobierno de productos la prohíban expresamente. Comprobar la redacción.
8. **Falsas contradicciones.** Las dos del apartado 10 son matices de ámbito, no contradicciones.
9. **Sanciones.** Importes, artículos y mínimos (278.2, 246, 600.000 €) no se usan en la aplicación; verificar solo si hace falta para la evaluación de riesgos.
10. **Faltan fuentes primarias:** MiFID II art. 4.1.4, Reglamento Delegado 2017/565 art. 9, Q&A de ESMA y de la CNMV sobre asesoramiento, y la comunicación de la CNMV sobre herramientas automatizadas.

## Parámetros con vigencia

Ninguno.

## Lo que las fuentes no dicen o necesita criterio profesional

- Si un aviso calculado sobre los datos propios, sin operar con un instrumento, es información, asesoramiento genérico o recomendación personalizada (zona gris; pregunta 2 de `docs/plan/07`).
- Umbral de variables a partir del cual una alerta se convierte en perfilado.
- Responsabilidad por texto generado por IA que sugiera una operación.
- Regímenes distintos para cripto (MiCA), seguros y planes de pensiones (ver `docs/plan/07`).

## Qué cambia cada año o con nuevas versiones

- Guías técnicas y Q&A de la CNMV y de ESMA.
- Calendario del Reglamento de IA.
- Desarrollo reglamentario de la Ley 6/2023.

## Contradicciones entre fuentes

Ninguna confirmada.

## Siguiente consulta al cuaderno

Antes de volver a preguntar, **retirar del cuaderno los documentos no oficiales e internos**. Después pedir, solo con fuentes oficiales: (1) texto literal de MiFID II art. 4.1.4 y del Reglamento Delegado 2017/565 art. 9, con la redacción exacta de «o» o «y»; (2) Q&A de ESMA y de la CNMV sobre qué es recomendación personalizada, sobre aplicaciones de finanzas personales y herramientas automatizadas; (3) cualquier comunicación oficial sobre alertas generadas con datos del usuario; (4) texto del art. 50 del Reglamento de IA y calendario vigente.

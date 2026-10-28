# 05. Servicios de pago: PSD2, importar ficheros y conexión con bancos

- **Consultado el:** 2026-10-27 (respuesta de un cuaderno NotebookLM; los enlaces llegaron como redirecciones y se omiten aquí)
- **Ámbito y vigencia:** Directiva (UE) 2015/2366 (PSD2), Real Decreto-ley 19/2018, Reglamento Delegado (UE) 2018/389, guías del Banco de España. Estado de la revisión de la PSD2 por comprobar.
- **Verificado contra el texto oficial por:** `SIN VERIFICAR`. Nada de esta ficha cambia el diseño, la hoja de ruta ni la política de privacidad hasta contrastarlo con el texto oficial.
- **Alimenta:** importadores (fase 1), conexión mediante agregador (HU-53, fase 3), `docs/plan/07-privacidad-y-regulacion.md`, EIPD específica de la fase 3.

## Decisiones que informa

1. **Importar ficheros subidos por la persona (fase 1).** La conclusión del cuaderno es que no es un servicio regulado (S1), pero **no está apoyada en la norma** (ver «Problemas», punto 1). Es la base de toda la hoja de ruta: confirmarla con un abogado antes de lanzar el primer importador.
2. **Regla de diseño candidata: nunca pedir, guardar ni usar credenciales bancarias, y nunca entrar en la banca en línea de la persona.** Es coherente con cualquier lectura de la norma y mantiene el importador por ficheros claramente fuera del acceso a cuentas. Pendiente de decidir si se añade a `AGENTS.md`.
3. **Conexión con bancos (fase 3).** El plan prevé hacerlo con un agregador autorizado. La ficha apunta a lo mismo (S5), pero el reparto de responsabilidad que afirma no está respaldado (punto 4). Decisión y ADR cuando llegue la fase 3.
4. **Qué productos quedan fuera.** Fondos de inversión, planes de pensiones y brókeres no son cuentas de pago, así que no se alcanzan con PSD2 (ya anotado en `docs/plan/14`). El acceso automático a esos productos depende del marco de acceso a datos financieros (FIDA), que no está en las fuentes.

## Hechos

Todos `SIN VERIFICAR`. Los artículos proceden del cuaderno.

| Id | Hecho | Cita (según el cuaderno) |
| --- | --- | --- |
| S1 | Subir un fichero descargado por la propia persona no es un servicio de información sobre cuentas, porque la aplicación no accede a cuentas en línea ni a credenciales. | **Sin cita legal**: se apoya en un documento interno y en un artículo divulgativo del Banco de España |
| S2 | Servicio de información sobre cuentas: servicio en línea que facilita información agregada de cuentas de pago de la persona en uno o varios proveedores. | RDL 19/2018 art. 1.2.h) (**artículo por comprobar**) |
| S3 | Para conectar directamente con las cuentas hay que inscribirse en el registro del Banco de España como proveedor de información sobre cuentas. | RDL 19/2018 art. 15; RD 736/2019 (**ninguno en las fuentes cargadas**) |
| S4 | Régimen para quien solo presta información sobre cuentas: sin capital mínimo, sin salvaguarda de fondos, con seguro de responsabilidad civil profesional, plan de negocio y medidas de seguridad. | RDL 19/2018 (artículos por comprobar); guía del Banco de España de 2023 |
| S5 | Plazo del Banco de España para resolver: 3 meses desde que la documentación está completa. | Guía del Banco de España (por comprobar) |
| S6 | Obligaciones del proveedor: consentimiento explícito de la persona, interfaces seguras con identificación mediante certificados, uso solo para el servicio, y autenticación reforzada gestionada por la entidad de la cuenta. | RDL 19/2018 arts. 39 y 66; Reglamento Delegado (UE) 2018/389 |
| S7 | Se puede ofrecer agregación sin licencia propia mediante un proveedor autorizado, que asumiría de forma exclusiva la responsabilidad regulatoria. | **Sin cita legal**: se apoya en el documento interno |
| S8 | Las entidades no pueden exigir contrato previo ni cobrar comisión a un proveedor autorizado para que acceda a los datos que la persona pide. | PSD2 (artículo no indicado); Banco de España |
| S9 | Operar sin inscripción es infracción muy grave con multas elevadas, cese y amonestación pública. | RDL 19/2018 título V; Ley 10/2014 (**importes a comprobar**, ver punto 6) |

## Parámetros con vigencia

Procedentes del cuaderno y `SIN VERIFICAR`. **Ninguno va a una tabla `ref.*`.**

| Parámetro | Valor | Cita |
| --- | --- | --- |
| Capital mínimo de un proveedor de información sobre cuentas | 0 € | RDL 19/2018 (por comprobar) |
| Plazo de resolución del registro | 3 meses | Guía del Banco de España de 2023 |

## Problemas de esta respuesta

1. **La pregunta decisiva no tiene base legal.** La conclusión S1 (subir ficheros no es regulado) cita solo un documento interno y un artículo divulgativo, no la definición legal ni una interpretación del Banco de España o de la EBA. El razonamiento es plausible, pero la definición literal (S2: «servicio en línea que facilita información agregada de cuentas de pago de las que es titular el usuario») podría leerse de forma amplia, y el cuaderno no la contrasta. **No tratar S1 como confirmado.** Requiere criterio profesional y, si hace falta, una consulta al Banco de España.
2. **Vuelve a citar el documento interno** «Marco Regulatorio, Arquitectura Técnica y Normativa de Cálculo…» como fuente de S1 y S7. Sigue en el cuaderno, y la lista de fuentes a retirar sigue sin aplicarse.
3. **Artículos dudosos.** El cuaderno cita la misma ley para las definiciones con artículos distintos entre sí (art. 1.2.h, art. 3, art. 15). No concuerdan con mi recuerdo del reparto de la norma. El Real Decreto 736/2019 y el Reglamento Delegado no figuraban en el inventario. Comprobar uno a uno en el BOE y EUR-Lex.
4. **Responsabilidad en el modelo con socio, afirmada sin cita.** «Recae de forma exclusiva en el proveedor autorizado» (S7) es demasiado absoluto: si el servicio se ofrece con nuestra marca, podríamos actuar como agente o como proveedor técnico, con consecuencias distintas. Depende del contrato y del modelo concreto. Criterio profesional.
5. **Base jurídica del RGPD mezclada con PSD2.** Presenta el «consentimiento explícito» de la agregación como el del art. 6.1.a RGPD. Según recuerdo, el CEPD (Directrices 06/2020 sobre PSD2 y RGPD) distingue el consentimiento explícito contractual de la PSD2 del consentimiento del RGPD, y la base habitual del tratamiento es el contrato. Comprobar.
6. **Sanciones copiadas.** Los importes (5 M€, 10 %, mínimo 600.000 €) coinciden con los de la respuesta anterior sobre el mercado de valores, y no recuerdo que sean los de la Ley 10/2014 para esta infracción. No usarlos.
7. **No cubre la evolución normativa.** El cuaderno reconoce que no tiene fuentes sobre PSD3, el Reglamento de servicios de pago ni el marco de acceso a datos financieros (FIDA). Conozco las propuestas de la Comisión de 2023, pero no su estado actual. Hay que cargar las fuentes oficiales y comprobarlo.
8. **Falsas contradicciones.** Las dos del apartado 9 son historia del sector, no discrepancias entre fuentes.
9. **Sugerencia final.** La comparativa de costes y tiempos entre fase 1 y fase 2 no tiene base en fuentes oficiales; no se aprovecha.
10. **Poca relevancia para nosotros.** Iniciación de pagos y credenciales de seguridad: no ofrecemos pagos.

## Lo que las fuentes no dicen o necesita criterio profesional

- Si la importación de ficheros cae en el ámbito del servicio de información sobre cuentas (punto 1).
- Reparto de responsabilidad al integrar un agregador de terceros (punto 4).
- Condiciones comerciales entre la plataforma y el agregador.
- Estándares técnicos de los ficheros: no hay norma, solo plantillas por entidad (ver skill `importador-entidad`).
- Estado del marco de acceso a datos financieros (FIDA) y de la revisión de la PSD2.

## Qué cambia cada año o con nuevas versiones

- Revisión de la PSD2 (propuestas de PSD3 y Reglamento de servicios de pago).
- Marco de acceso a datos financieros (FIDA).
- Guías del Banco de España para solicitantes y reglas de las interfaces (Reglamento Delegado 2018/389).

## Contradicciones entre fuentes

Ninguna confirmada.

## Siguiente consulta al cuaderno

Antes: retirar los documentos internos y no oficiales, y cargar el texto oficial de la Directiva (UE) 2015/2366, del Real Decreto-ley 19/2018, del Real Decreto 736/2019, del Reglamento Delegado (UE) 2018/389, de las Directrices 06/2020 del CEPD y las propuestas y el estado de la PSD3, el Reglamento de servicios de pago y el marco FIDA. Después pedir, con cita literal y solo de texto oficial: (1) definiciones de la Directiva y de la ley española, artículo por artículo; (2) cualquier Q&A de la EBA o del Banco de España sobre datos que la persona descarga y entrega a un tercero; (3) régimen de los proveedores técnicos y de los agentes, y su exclusión; (4) base jurídica del RGPD para el tratamiento de datos de pago según el CEPD; (5) estado actual de la PSD3, el Reglamento de servicios de pago y FIDA.

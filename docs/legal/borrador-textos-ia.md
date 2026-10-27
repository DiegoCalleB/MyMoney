# BORRADOR, NO PUBLICAR: textos de interfaz y legales de las explicaciones con IA

- **Estado:** borrador sin revisar. Procede de un cuaderno de investigación. **No debe mostrarse a ninguna persona** hasta cumplir todos los pendientes de abajo.
- **Fecha:** 2026-10-27
- **Base:** fichas [03](../referencias/03-proteccion-datos.md) y [04](../referencias/04-ia.md), ambas `SIN VERIFICAR`, y [ADR-0019](../adr/0019-bolsillos-reglas-y-sencillez.md).
- **Versionado:** cada texto aceptado se registra con su versión en `user_consents`. Al publicar, cada cambio de texto crea una versión nueva y se vuelve a pedir el consentimiento si el cambio es sustancial.

## Pendientes antes de publicar

1. **Verificar las fichas 03 y 04** contra el texto oficial y con un abogado. La base legal del texto, incluida la cita del art. 50, no está comprobada.
2. **Solo afirmar lo que el sistema hace y está probado.** Estas frases son falsas hasta que exista el código o el contrato:
   - «Tus datos identificativos nunca se envían»: exige un filtro en el código y un test que lo demuestre.
   - «Se envía de forma minimizada y seudonimizada»: definir y probar una lista cerrada de campos permitidos.
   - «Tus datos no se utilizarán para entrenar» y «el proveedor no conserva los datos»: exigen contrato con el proveedor. Muchos conservan las entradas un tiempo; la retención cero suele pactarse aparte, así que «conserve, almacene» es demasiado absoluto.
   - Transferencias (SCC o marco UE-EE. UU.): depende del proveedor real, que aún no está elegido.
3. **Decir qué se envía.** Los datos del aviso incluyen cifras del patrimonio de la persona. El texto debe nombrarlo con claridad.
4. **Completar el deber de informar** (según la ficha 03, por comprobar): plazo de conservación, destinatarios, derecho a reclamar ante la AEPD, que retirar el consentimiento no afecta a lo ya tratado, y los derechos de portabilidad, limitación y oposición.
5. **Rellenar los marcadores.** `[Nombre legal de la empresa, S.L.]` y `[email de privacidad/DPD]`. No se sabe si existe empresa ni si hará falta delegado de protección de datos.
6. **Accesibilidad.** El micro-texto no puede depender de un *tooltip* (no funciona con teclado ni en móvil): debe estar visible en la tarjeta. Mantener texto junto al icono.
7. **Palabra «asesoramiento».** La regla 22 de `AGENTS.md` la prohíbe en la interfaz y `docs/plan/07` prevé un aviso visible que la niega. Comprobar que `reco-copy-guard` no rechace el micro-texto, o moverlo a un catálogo legal separado.
8. **Corregir detalles:** «contrato *binding*» mezcla idiomas; la ruta `Ajustes > Privacidad > Explicaciones con IA` debe construirse tal cual.
9. **Cerrar la pregunta de rol** de la ficha 04 (proveedor del sistema o responsable del despliegue), porque decide si hay obligación de marcado legible por máquina.

---

## Borrador original

Textos redactados conforme al Artículo 50 del Reglamento de Inteligencia Artificial (UE) 2024/1689, el Artículo 13 del RGPD y el Artículo 11 de la LOPDGDD (esquema de dos capas). **Conformidad no verificada.**

### 1. Elementos de transparencia en pantalla (UI / UX)

Dos elementos visuales en el componente donde se muestre la explicación.

**A. Distintivo visual (badge junto al texto)**

> ✨ Explicación redactada con IA

**B. Micro-texto explicativo (tooltip o pie de tarjeta)**

> «Este texto ha sido generado automáticamente por un modelo de lenguaje para facilitar la comprensión del aviso. Se basa exclusivamente en reglas deterministas previamente calculadas sobre tus datos y no constituye asesoramiento financiero ni recomendación de productos.»

### 2. Cláusula informativa de consentimiento previo (dos capas)

**Primera capa: modal de activación** (al encender el interruptor o el botón en la app)

**Activar explicaciones con Inteligencia Artificial**

Para ayudarte a entender mejor tus alertas y resúmenes financieros, podemos adaptar la redacción de tus avisos utilizando un modelo de lenguaje automático.

- **Responsable:** [Nombre legal de la empresa, S.L.]
- **Finalidad:** redactar de forma clara e intuitiva los avisos y alertas financieras calculados por la aplicación.
- **Legitimación:** tu consentimiento explícito (art. 6.1.a RGPD). Puedes desactivar esta opción cuando quieras en la configuración de tu cuenta.
- **Garantía de privacidad:** tus datos identificativos (nombre, DNI, IBAN) nunca se envían a la IA. La información se envía de forma minimizada y seudonimizada a nuestro proveedor tecnológico únicamente para generar la redacción. Tus datos no se utilizarán para entrenar modelos de IA externos.
- **Derechos:** puedes acceder, rectificar, suprimir tus datos y revocar este consentimiento en cualquier momento escribiendo a [email de privacidad/DPD].
- **Más detalles:** consulta la Política de Privacidad completa.

`[ ] Consiento el tratamiento de mis datos de avisos para la generación de explicaciones redactadas con IA.`

`[ Cancelar ]` `[ Confirmar y Activar ]`

**Segunda capa: texto detallado para la Política de Privacidad** (sección «Tratamiento de datos mediante IA opcional»)

**Tratamiento de datos mediante modelos de lenguaje (Inteligencia Artificial)**

1. **Descripción de la funcionalidad.** La aplicación ofrece de forma opcional una función de ayuda a la lectura que toma los avisos informativos previamente calculados por el sistema mediante reglas fijas deterministas y los redacta en un lenguaje más sencillo e intuitivo. Este modelo de IA no toma decisiones automáticas, no realiza scoring crediticio ni evalúa tu solvencia.
2. **Minimización de datos y seguridad.** Antes de enviar cualquier información a la interfaz de programación (API) del proveedor del modelo de lenguaje, [Nombre de la Empresa] aplica un proceso de filtrado y seudonimización en sus servidores para eliminar cualquier dato directamente identificativo (como tu nombre, apellidos, documento de identidad o número de cuenta bancaria).
3. **Garantías contractuales y prohibición de entrenamiento.** El proveedor del modelo de lenguaje actúa en calidad de Encargado del Tratamiento (artículo 28 del RGPD). Mediante contrato (Data Processing Addendum, DPA), queda expresamente prohibido que dicho proveedor conserve, almacene o utilice los datos o textos enviados (*prompts*) para el reentrenamiento o mejora general de sus modelos de IA.
4. **Transferencias internacionales.** Si la infraestructura del proveedor del modelo de IA se ubica fuera del Espacio Económico Europeo (EEE), la transferencia se ampara en mecanismos válidos del Capítulo V del RGPD, como las Cláusulas Contractuales Tipo (SCC) aprobadas por la Comisión Europea o el marco de privacidad UE-EE. UU. (EU-US Data Privacy Framework).
5. **Revocación del consentimiento.** Puedes retirar tu consentimiento para esta funcionalidad en cualquier momento a través de `Ajustes > Privacidad > Explicaciones con IA`. Tras la desactivación, los avisos volverán a mostrarse exclusivamente con la plantilla de texto estándar sin intervención del modelo de lenguaje.

# Referencias: lo que dicen las fuentes oficiales

Aquí vive el conocimiento de dominio (fiscalidad, regulación, protección de datos, metodología) que usa la aplicación. Es la **fuente de verdad en el repositorio**: los cuadernos externos (NotebookLM u otros) solo sirven para investigar; nada cuenta hasta que está aquí, con cita y fecha.

Inventario de las fuentes del cuaderno de investigación, clasificadas por fiabilidad: [fuentes-cuaderno.md](fuentes-cuaderno.md).

## Reglas

1. **Una ficha por tema**, en un archivo `NN-tema.md` con la plantilla [`_plantilla.md`](_plantilla.md).
2. Cada afirmación lleva **cita exacta** (norma, artículo o apartado) y **enlace a la fuente oficial**.
3. Toda ficha indica **fecha de consulta**, **versión o ejercicio** de la norma y **quién la verificó** contra el texto oficial.
4. Lo que el cuaderno resume y nadie ha contrastado se marca `SIN VERIFICAR` y **no se usa** en código, avisos ni `ref.tax_parameters`.
5. Nada de datos reales ni de `privado/`. Solo documentos públicos.
6. Lo que decide el diseño (qué se calcula, qué avisa, qué se guarda) acaba en un ADR que cita la ficha.
7. Las fichas no sustituyen la opinión jurídica y fiscal profesional pendiente.

## Índice y estado

| Ficha | Tema | Alimenta | Estado |
|---|---|---|---|
| [01-fiscalidad](01-fiscalidad.md) | IRPF, traspasos, FIFO, pérdidas, patrimonio, modelos 720/721 | `ref.tax_parameters`, cálculos de `finance-core` | borrador sin verificar |
| [02-regulacion-avisos](02-regulacion-avisos.md) | Información frente a recomendación y asesoramiento (CNMV, MiFID II) | reglas de avisos, `reco-copy-guard` | borrador sin verificar |
| [03-proteccion-datos](03-proteccion-datos.md) | RGPD, LOPDGDD, EIPD, decisiones automatizadas | EIPD, consentimientos, retención | borrador sin verificar |
| [04-ia](04-ia.md) | Reglamento de IA, transparencia de textos generados | explicaciones con IA | borrador sin verificar |
| [05-servicios-pago](05-servicios-pago.md) | PSD2, importar ficheros frente a conectar con bancos | hoja de ruta de importadores | borrador sin verificar |
| 06-garantias | Fondo de Garantía de Depósitos y de Inversiones | avisos de concentración, tramos de efectivo | pendiente |
| 07-metodologia | IPC (INE, Eurostat), tipos BCE, TAE, GIPS (TWR/XIRR) | `ref.inflation_index`, `ref.fx_rates`, `finance-core` | pendiente |
| 08-educacion-financiera | CNMV y Banco de España | textos de nivel 1 | pendiente |
| 09-legal-web | LSSI, cookies, consumidores | aviso legal, cookies, condiciones | pendiente |

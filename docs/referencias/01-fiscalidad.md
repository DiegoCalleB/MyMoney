# 01. Fiscalidad: traspasos entre fondos, FIFO y pérdidas

- **Consultado el:** 2026-10-27 (respuesta de un cuaderno NotebookLM; los enlaces numerados `[n]` de la respuesta original se perdieron al copiarla)
- **Ámbito y vigencia:** Ley 35/2006 (LIRPF) y Real Decreto 439/2007 (RIRPF); versión vigente por comprobar. Persona residente en España.
- **Verificado contra el texto oficial por:** `SIN VERIFICAR`. Nada de esta ficha se usa en código, avisos ni `ref.tax_parameters` hasta contrastarlo en el BOE.
- **Alimenta:** `finance-core.fifoLots` (fase 2), avisos de la regla de los dos meses, clasificación de traspasables.

## Decisiones que informa

1. **Lotes fiscales.** Si se confirman los hechos F1 a F3, el modelo necesita lotes por posición con fecha y coste de adquisición, y un traspaso entre fondos debe arrastrar fecha y coste sin generar ganancia. Hoy el esquema no tiene lotes; se pueden derivar de los apuntes del libro, pero el arrastre del traspaso exige decidir antes de la fase 2 si se guarda o se recalcula (ADR pendiente).
2. **Traspasable o no.** Los ETF (fondos cotizados) quedarían fuera del diferimiento (F5): vender un ETF para comprar otro **sí** tributa. La clasificación «traspasable» debe distinguirlo.
3. **Traspaso interno ≠ aportación** (regla 16): coherente con F1, no hay ganancia computable en un traspaso válido.

## Hechos

Todos `SIN VERIFICAR`. Los números de artículo y las citas literales proceden del cuaderno y deben cotejarse con el BOE.

| Id  | Hecho                                                                                                                                                            | Cita (según el cuaderno)                          | Enlace oficial                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------- |
| F1  | No se computa ganancia o pérdida cuando el importe de un reembolso o transmisión de participaciones en IIC se destina a suscribir otras IIC, por el procedimiento reglamentario. | LIRPF art. 94.1.a), párrafo 2                     | BOE-A-2006-20764 (comprobar)            |
| F2  | Las nuevas participaciones conservan el valor y la fecha de adquisición de las transmitidas.                                                                     | LIRPF art. 94.1.a), párrafo 2                     | BOE-A-2006-20764                        |
| F3  | Con valores homogéneos se entiende transmitido el adquirido primero (FIFO).                                                                                      | LIRPF art. 37.2 y art. 94.1.a), párrafo 1         | BOE-A-2006-20764                        |
| F4  | En IIC societarias el diferimiento exige más de 500 socios y no haber superado el 5 % del capital en los 12 meses previos; se comunica por escrito al ordenar.    | LIRPF art. 94.1.a).2.º; RIRPF art. 49.1           | BOE-A-2006-20764; BOE-A-2007-6820       |
| F5  | El diferimiento no aplica si el importe se pone a disposición del contribuyente, ni a fondos de inversión cotizados (ETF).                                        | LIRPF art. 94.1.a), párrafo 3; RIRPF DA 4.ª       | BOE-A-2006-20764; BOE-A-2007-6820       |
| F6  | Sin retención cuando, por diferimiento, no procede computar la ganancia.                                                                                         | RIRPF art. 75.3.i)                                | BOE-A-2007-6820                         |
| F7  | Sin diferimiento, la ganancia es valor de transmisión (valor liquidativo) menos valor de adquisición (con FIFO).                                                | LIRPF art. 37.1.c) y 94.1.d)                      | BOE-A-2006-20764                        |
| F8  | En IIC extranjeras comunitarias con tenencia simultánea, el partícipe debe determinar y conservar fechas y valores de adquisición.                               | Ley 16/2013 (según un documento de un banco)     | **Falta el texto oficial** (BOE)        |

## Parámetros con vigencia

**Ninguno es utilizable todavía.** No se ha cargado nada en `ref.tax_parameters`.

| Parámetro                           | Valor del cuaderno | Estado                                                                                                                                                              |
| ----------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Máximo de participación en SICAV    | 5 % en 12 meses    | Coherente con F4. Poco relevante para fondos y ETF de particulares. Verificar.                                                                                      |
| Mínimo de socios en SICAV           | más de 500         | Ídem.                                                                                                                                                               |
| Retención sobre ganancias en IIC    | 18 % hasta 2014    | **Dudoso**: «18 % (2007) → 19 % (Ley 26/2014)» y «hasta 31/12/2014» no cuadran entre sí, y mi recuerdo es que el tipo cambió varias veces. Obtener la serie de tipos del BOE o la AEAT. |
| Presunción de incremento del 15 %   | 15 % del valor     | **Falta contexto**: creo que el art. 94.3 se refiere a IIC en paraísos fiscales, no a IIC en general. Comprobar antes de modelarlo.                                  |
| Pago a cuenta del 20 % (art. 100.1) | 20 %               | No guarda relación clara con este tema. Descartar salvo que se compruebe.                                                                                           |
| Umbral del 1 % (RD 1180/2023)       | 1 % de activos     | Irrelevante para la aplicación. Descartar.                                                                                                                          |

## Problemas de esta respuesta

- **Fuente no oficial.** F8 y la «contradicción» sobre IIC extranjeras proceden de un documento de un banco. Nuestras reglas piden fuentes oficiales: hay que cargar el texto de la Ley 16/2013 del BOE.
- **Falsas contradicciones.** Ninguna de las dos del cuaderno lo es: una es una especialidad según el tipo de fondo y la otra es una excepción a la regla general. Tratarlas como reglas distintas con su ámbito.
- **Citas sin enlace.** Se perdieron los `[n]`; cada hecho se contrasta abriendo el BOE.
- **Faltan hechos clave.** No aparecen los tramos de la base del ahorro, la regla de los dos meses y un año para pérdidas por recompra (art. 33.5), ni el límite de compensación de pérdidas. Ver la siguiente consulta.

## Lo que las fuentes no dicen o necesita criterio profesional

- Operativa de traspaso entre gestoras (plazos, información que se transmite).
- IIC de terceros países fuera de la UE.
- Escalas autonómicas sobre la base del ahorro.
- FIFO en cotitularidad, gananciales y herencias.
- Interacción entre diferimiento (art. 94) y no compensación por recompra (art. 33.5), con traspasos sucesivos.

## Qué cambia cada año o con nuevas versiones

- Tipos de retención y escala de la base del ahorro.
- Modelos de declaración y sus especificaciones (por orden ministerial).
- Lista de jurisdicciones no cooperativas.
- Normativa de IIC (Ley 22/2014, RD 1180/2023).

## Contradicciones entre fuentes

Ninguna confirmada. Ver «Problemas de esta respuesta».

## Siguiente consulta al cuaderno

Pedir con el mismo formato: (1) tramos de la base del ahorro y su vigencia por ejercicio, con tipos de retención sobre ganancias en IIC y su serie histórica; (2) regla de recompra de valores homogéneos (art. 33.5) con plazos; (3) compensación de pérdidas en la base del ahorro (plazos y límites); (4) tributación de la venta de ETF; (5) el texto oficial de la Ley 16/2013 para IIC extranjeras.

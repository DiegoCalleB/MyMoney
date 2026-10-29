# ADR-0024: Riesgo y exposición con reparto por clase de activo por cuenta

- Estado: Propuesto
- Fecha: 2026-10-29

## Contexto
La app solo guarda el valor total de cada cuenta, no su contenido, pero el riesgo (exposición, concentración, caídas) necesita saber de qué clase es el dinero. El modelo completo del plan (posiciones valoradas con su composición) exige dar de alta cada activo y tener precios.

## Decisión
1. **Clase por defecto según el tipo de cuenta** (`defaultClass`): corriente, ahorro, depósito y efectivo = liquidez; cripto = cripto; inmueble = inmuebles. Bróker, fondos y planes de pensiones = «mixto» (sin detallar, calidad baja); vehículo y otro bien = sin clasificar.
2. **Ajuste manual por cuenta**: nueva tabla `account_compositions` (cuenta, clase, puntos básicos; suma ≤ 10.000 por cuenta, validada por un *constraint trigger*; lo que falta queda sin clasificar) y la RPC `set_account_composition`, que sustituye el reparto entero (objeto vacío = volver al valor por defecto). RLS por rol como el resto; sin histórico por ahora.
3. **Cálculos en `finance-core`** (`risk.ts`): `exposure`, `concentration` (peso máximo, Herfindahl, número efectivo), `stressScenario` (sin correlaciones, meses de gasto) y `speculativeShare`.
4. **Escenarios**: tres hipotéticos (moderada: renta variable −20 %/cripto −40 %; fuerte: −35 %/−70 %/inmuebles −10 %; crisis: −50 %/−80 %/inmuebles −20 %/materias primas −20 %), siempre rotulados como hipótesis. Los choques viven en `risk-model.ts`, visibles en la pantalla; todavía no son editables.
5. **Meses de gasto**: media de los tres meses completos anteriores con gasto (`monthly_cashflow`), en la moneda base.
6. **Sin recomendaciones**: la pantalla describe la cartera; no nombra productos ni dice qué hacer (nivel 1-2).

## Alternativas consideradas
- Solo por tipo de cuenta: un bróker o un fondo mixto quedarían sin clasificar.
- Por posiciones: más fiel, pero exige precios y mucha entrada de datos; queda como evolución (`asset_compositions` ya existe).
- Reutilizar `asset_compositions` con un activo sintético por cuenta: mezcla dos conceptos (ADR-0018).

## Consecuencias
- (+) Riesgo útil desde hoy con poca entrada de datos; la calidad del dato se declara.
- (−) Los choques de los escenarios no son editables aún (HU-16 pide editarlos) y no hay histórico del reparto.
- (−) El reparto manual es una declaración de la persona: la app no la verifica.

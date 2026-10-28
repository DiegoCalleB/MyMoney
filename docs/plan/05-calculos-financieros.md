# 5. Librería de cálculos financieros (`packages/finance-core`)

## Reglas de diseño

- **Pura y determinista**: sin E/S, sin `Date.now()`, sin aleatoriedad no sembrada. Toda función recibe lo que necesita (incluida la fecha de cálculo y la semilla).
- **Aritmética decimal**: nunca `number` para dinero. Tipo `Money { minor: bigint; currency: CurrencyCode }` para importes y `Decimal` (de una librería decimal de precisión arbitraria, ver ADR-0005) para tipos, precios y cantidades. Prohibido mezclar monedas: sumar EUR y USD lanza un error de tipo y en ejecución.
- **Redondeo explícito**: un único punto de redondeo al convertir a unidades mínimas, con un modo declarado en la firma (`HALF_EVEN` por defecto en los cálculos internos; `HALF_UP` para presentar importes, que es lo que el usuario espera en España [RECOMENDACIÓN]). Los resultados intermedios se mantienen con 34 dígitos significativos.
- **Fechas**: tipo `CalendarDate` (año, mes, día) sin hora ni zona; las conversiones desde instantes se hacen fuera, con la zona del espacio. Base de días: real/365 para la anualización (documentado en cada función).
- **Cada resultado es explicable**: las funciones públicas devuelven `{ value, explanation }`, donde `explanation` incluye el método, las entradas usadas (referencias), los supuestos y los avisos de calidad del dato (por ejemplo, "valoración de hace 120 días", "TWR aproximada por Dietz modificado").
- **Errores como valores**: `Result<T, DomainError>` para casos esperables (no converge, sin datos); excepciones solo para errores de programación.

## Catálogo de funciones

### Dinero y tipos de cambio (`money/`, `fx/`)

| Función | Descripción | Casos límite |
|---------|-------------|--------------|
| `money(minor, currency)`, `add`, `sub`, `negate`, `isZero` | Operaciones sobre la misma moneda | Monedas distintas → error; desbordamiento imposible con `bigint` |
| `allocate(money, weights)` | Reparte un importe en partes según pesos sin perder céntimos (método del resto mayor) | La suma de las partes es exactamente el total (propiedad); pesos con cero; un solo peso |
| `convert(money, to, rateTable, onDate)` | Convierte con el último tipo ≤ fecha | Sin tipo → error explicado; tipo inverso si solo existe el contrario (con precisión declarada); misma moneda → identidad |
| `fromDecimal(decimal, currency, rounding)` | Decimal → unidades mínimas | Monedas con 0 o 3 decimales |

### Libro y posiciones (`ledger/`)

| Función | Descripción |
|---------|-------------|
| `validateTransaction(tx)` | Cuadre por moneda, roles de las patas coherentes con el tipo, signos |
| `cashBalance(legs, account, onDate)` | Saldo de efectivo de una cuenta a una fecha |
| `positions(legs, account, onDate)` | Cantidad por activo y coste acumulado |
| `externalFlows(legs, scope)` | Flujos externos del ámbito (cuenta, bolsillo o espacio). **Clave**: un traspaso entre cuentas del mismo ámbito no es flujo; entre una cuenta del ámbito y otra fuera del ámbito sí lo es |
| `marketValue(positions, cash, valuations, prices, fx, onDate)` | Valor de mercado con la fuente y la antigüedad de cada componente |
| `netWorth(accounts, …, onDate, baseCurrency)` | Activos − deudas con desglose; garantiza que el desglose suma el total |

### Rentabilidad (`returns/`)

> **Implementado** (ADR-0022): `returns.ts` (`xirr`, `twr`, `contributedVsGained`), `real-return.ts` (`realReturn`) y `ledger-flows.ts` (`externalFlows`, `valueSeries`). Un dividendo o interés no es aportación; una comisión o impuesto tampoco. Pendiente: rendimiento por bolsillo.

**XIRR (rentabilidad ponderada por dinero)**
Resolver r en  Σᵢ CFᵢ / (1 + r)^((tᵢ − t₀)/365) = 0, donde los flujos son las aportaciones (negativas, desde el punto de vista del inversor), las retiradas (positivas) y el valor final (positivo).
- Método: Newton-Raphson desde una estimación inicial (rentabilidad simple anualizada), con *fallback* a bisección en [−0,9999; 10] si Newton diverge o la derivada se anula.
- Tolerancia 1e-10 en el VAN; máximo 100 iteraciones; devuelve el número de iteraciones y el método usado.
- Casos límite: todos los flujos con el mismo signo (sin solución, error explicado); varias raíces (cambios de signo múltiples: se avisa y se devuelve la raíz más cercana a la estimación inicial); periodo < 1 año (se devuelve también la rentabilidad acumulada y la UI no muestra la anualizada); flujos el mismo día (se agregan); valor final cero (−100 %).

**TWR (rentabilidad ponderada por tiempo)**
TWR = Πⱼ (1 + Rⱼ) − 1, con Rⱼ = (V_fin,j − V_ini,j − F_j) / V_ini,j en cada subperiodo delimitado por los flujos externos. Requiere la valoración justo antes de cada flujo.
- Si falta una valoración en la fecha de un flujo: **Dietz modificado** en ese subperiodo, R = (V₁ − V₀ − F) / (V₀ + Σ wᵢ Fᵢ), con wᵢ la fracción del periodo que el flujo estuvo invertido; el resultado se marca como "aproximado".
- Casos límite: V_ini = 0 (primer subperiodo empieza en el primer flujo); cuenta que se vacía y se vuelve a llenar; subperiodos de un día.

**Rentabilidad real**
r_real = (1 + r_nominal) / (1 + π) − 1, con π la inflación del mismo periodo a partir del índice del INE: π = IPC(fin) / IPC(inicio) − 1. **No** se usa la resta aproximada r − π salvo para explicar.

**Rendimiento por bolsillo (ADR-0019)**
Un bolsillo no es una cuenta: es una parte de varias cuentas, y esa parte cambia con el tiempo. Para cada fecha *d* se toma el reparto vigente de cada cuenta (`pocket_allocations` con el mayor `effective_from` ≤ *d*):
- Valor del bolsillo en *d* = Σ valor de la cuenta (o posición) en *d* × peso vigente en *d*.
- Flujos del bolsillo = flujos externos de cada cuenta × peso vigente en su fecha, **más** las reasignaciones: si en *d* cambia el reparto, lo que entra en un bolsillo y sale de otro es un flujo para ambos (como un traspaso), así una reasignación no se confunde con rentabilidad.
- Con valores y flujos, XIRR y TWR del bolsillo se calculan con las mismas funciones que las de una cuenta, y su rentabilidad real se deflacta con el IPC del mismo periodo.
- Si falta la valoración de una cuenta en una fecha necesaria, el resultado baja su calidad del dato y lo dice; no interpola en silencio.
- Desfase de publicación del IPC: se usa el último mes publicado y se indica ("IPC hasta agosto de 2026").
- Para periodos que no empiezan el día 1 se interpola linealmente dentro del mes y se documenta.

**Aportado frente a ganado**
Ganancia = Valor actual − Σ aportaciones externas + Σ retiradas externas. Las comisiones e impuestos ya están dentro (reducen el valor) y además se informan por separado.

### Comisiones (`fees/`)

| Función | Fórmula / nota |
|---------|----------------|
| `explicitFees(legs, period)` | Suma de las patas `fee` por cuenta, activo y año |
| `terDrag(value, terBps, years, grossReturn)` | Diferencia entre V·(1+g)^n y V·((1+g)(1−TER))^n: coste acumulado de un TER constante sobre un valor dado. Etiqueta: estimación con supuesto de rentabilidad g |
| `feeAlertCheck(assets, threshold)` | Activos con TER por encima del umbral |

### Riesgo y escenarios (`risk/`)

| Función | Descripción |
|---------|-------------|
| `exposure(positions, assets)` | Exposición por clase de activo, moneda, entidad, activo y titular. Los fondos mixtos se reparten con su composición por clase de activo (`asset_compositions`); sin ella, se usa la clase principal y se marca la calidad del dato como baja |
| `concentration(exposure)` | Peso máximo y un índice tipo Herfindahl por dimensión |
| `stressScenario(exposure, shocks)` | Impacto = Σ exposición_clase × choque_clase; devuelve el impacto por cuenta y total y los meses de gasto equivalentes. Sin correlaciones en el MVP (se dice explícitamente) |
| `speculativeShare(accounts, assets)` | Peso de lo marcado como especulativo |

### Planificación (`planning/`)

| Función | Descripción |
|---------|-------------|
| `emergencyFund(monthlyExpenses, months, liquidAccounts)` | Objetivo, cubierto, meses de cobertura actual (*runway*) |
| `projectDeterministic(start, contributions, annualReturn, inflation, horizon)` | Valor futuro nominal y en euros de hoy, mes a mes; la tasa mensual equivalente es (1+r)^(1/12) − 1 |
| `requiredContribution(target, start, annualReturn, months)` | Aportación periódica necesaria: PMT = (FV − PV·(1+i)^n) · i / ((1+i)^n − 1); si i = 0, (FV − PV)/n |
| `mortgagePayment(principal, annualRate, months)` | Sistema francés: cuota = P·i / (1 − (1+i)^−n), con i = TIN/12; i = 0 ⇒ P/n. Cuadro de amortización con la última cuota ajustada para que el capital pendiente acabe exactamente en 0 |
| `homePurchasePlan(price, downPct, costsPct, rate, years, savings, monthlySaving, income?)` | Entrada + gastos necesarios, fecha estimada de alcance, cuota y esfuerzo (cuota / ingresos netos) |
| `monteCarlo(params, seed, n)` (fase 2) | Rentabilidades mensuales con distribución declarada (normal o *bootstrap* histórico), percentiles 10/50/90; reproducible con la semilla |

### Fiscalidad España (`tax/es/`), parametrizada por ejercicio

No se codifica ninguna cifra legal en la lógica: todo sale de `ref.tax_parameters` (con fuente BOE y fecha de verificación) o de *fixtures* versionados.
- `savingsBaseTax(gain, year)`: tramos de la base del ahorro. **[A VERIFICAR para cada ejercicio en el BOE]**: para 2025 la escala que conocemos es 19 % hasta 6.000 €, 21 % hasta 50.000 €, 23 % hasta 200.000 €, 27 % hasta 300.000 € y 30 % a partir de ahí (la Ley 7/2024 elevó el último tramo). Hay que confirmarlo con el texto consolidado de la Ley 35/2006 (LIRPF) antes de usarlo.
- `fifoLots(legs)` (fase 2): lotes por el método FIFO, que la LIRPF exige para valores homogéneos (art. 37.2) [A VERIFICAR la redacción vigente]; los traspasos entre fondos arrastran la fecha y el coste (art. 94 LIRPF).
- `washSaleWarning(sales, purchases)` (fase 2): aviso de la regla de recompra (2 meses en valores cotizados, 1 año en no cotizados; art. 33.5 LIRPF) [A VERIFICAR].
- `foreignAssetsThreshold(accounts)`: aviso informativo cuando los saldos en el extranjero por categoría superan el umbral del modelo 720 (50.000 €) o las criptomonedas custodiadas en el extranjero superan el del modelo 721 (50.000 €) [A VERIFICAR umbrales y matices en la AEAT]. Solo informa; no determina la obligación.
- `pensionContributionLimit(year)`: límite de aportación a planes de pensiones. [A VERIFICAR]: 1.500 € anuales individuales, ampliables con contribuciones empresariales hasta 8.500 € adicionales (total 10.000 €), según la normativa vigente que conocemos.

### Ingresos y gastos (`cashflow/`)

| Función | Descripción |
|---------|-------------|
| `monthlySummary(rows)` | Ingresos, gastos y ahorro (ingresos − gastos) por mes natural y moneda, a partir de `monthly_cashflow` |
| `savingsRate(income, expense)` | (ingresos − gastos) / ingresos; sin ingresos ⇒ no calculable (nunca 0 % ni NaN) |
| `essentialMonthlyExpense(totals, categories, months)` | Media mensual de las categorías `essential` en una ventana de meses completos; base del colchón |
| `emergencyRunway(liquid, essentialMonthly)` | Meses de cobertura con el gasto básico real |
| `budgetVariance(totals, budgets, month)` | Gasto real frente a presupuesto vigente por categoría; desviación en importe y porcentaje |
| `categorize(description, rules)` | Primera regla del usuario que casa (por prioridad); sin coincidencia ⇒ sin categoría. Determinista; nunca infiere |
| `forecastCashflow(recurring, from, to)` | Calendario de ingresos y gastos previstos a partir de reglas recurrentes (día 31 en meses cortos ⇒ último día) |

Casos límite: mes en curso incompleto (se marca y no entra en medias), reembolsos mayores que el gasto (categoría negativa), varias monedas (nunca se suman sin conversión), meses sin datos (no cuentan como cero).

### Motor de reglas de avisos (`rules/`, ADR-0010)

Cada regla es un módulo con:
```
id, version, level (1|2|3), countries, requiredInputs,
evaluate(snapshot, assumptions, profile, today) -> Finding | null
```
`Finding = { severity, messageKey, params, inputsUsed[], assumptionsUsed[], confidence, risks[], limitsKey }`.
Las reglas no producen texto libre: devuelven claves de mensaje y parámetros, y el texto vive en los catálogos de i18n revisados (también legalmente). Esto impide por construcción que una regla nombre un producto.

Reglas del MVP: `emergency_fund_gap`, `idle_cash`, `speculative_cap`, `high_fees`, `concentration_asset`, `concentration_institution`, `currency_exposure`, `goal_at_risk`, `stale_valuations`, `expensive_debt_with_idle_cash`, `profile_expired`.

## Estrategia de tests

| Tipo | Herramienta | Qué cubre | Umbral |
|------|-------------|-----------|--------|
| Unitarios con ejemplos | Vitest | Casos de libro y casos límite de cada función | 100 % de líneas y ramas en `finance-core` (umbral en CI) |
| Propiedades | `fast-check` | Invariantes (lista abajo) | 1.000 ejecuciones por propiedad en CI; semilla registrada si falla |
| Referencias externas | *Fixtures* | XIRR comparada con `XIRR` de una hoja de cálculo; cuadros de amortización comparados con un simulador público; IPC con datos reales del INE | Diferencia ≤ 1e-6 en tasas; 0 céntimos en importes |
| Mutación | Stryker | Que los tests detecten cambios en las fórmulas | ≥ 85 % de mutantes eliminados en `returns/`, `ledger/`, `planning/` |
| Regresión de reglas | Instantáneas de escenarios por perfil (Lucía, Marta, Javi…) | Qué avisos salen para cada persona del capítulo 1 | Revisión manual de cada cambio de instantánea |

**Propiedades que deben cumplirse siempre**:
1. `allocate(m, w)` suma exactamente `m` y ninguna parte difiere en más de una unidad mínima de su parte ideal.
2. Convertir ida y vuelta con tipos inversos exactos devuelve el original ± 1 unidad mínima.
3. Toda transacción válida cuadra por moneda; `validateTransaction` rechaza cualquier transacción descuadrada.
4. **Invariancia ante traspasos internos**: añadir traspasos internos entre cuentas del mismo ámbito no cambia ni la XIRR ni la TWR ni lo aportado del ámbito.
5. Si todos los subperiodos tienen rentabilidad r, la TWR anualizada es r.
6. La XIRR de un único flujo de entrada C y un valor final C·(1+r)^t es r (± tolerancia).
7. El cuadro de amortización suma exactamente el principal y el capital pendiente termina en 0.
8. `netWorth` es la suma exacta de su desglose en cada dimensión.
9. Con inflación 0, la rentabilidad real es igual a la nominal.
10. Escalar todos los flujos y valores por k > 0 no cambia la XIRR ni la TWR.
11. Las reglas de avisos nunca devuelven `level` superior al permitido por los *flags* que se les pasan.

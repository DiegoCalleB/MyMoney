# ADR-0021: Valor al día con movimientos, rentabilidad y avisos calculados

- Estado: Aceptado
- Fecha: 2026-10-28

## Contexto
La primera web solo mostraba una foto del patrimonio a partir de valoraciones. La persona propietaria necesita que apuntar un gasto o una aportación cambie las cifras, ver cuánto ha ganado y recibir avisos útiles, sin tener que entender el modelo de datos (ADR-0017).

## Decisión
1. **Valoración + movimientos posteriores.** El valor de una cuenta es su última valoración más los movimientos liquidados de efectivo posteriores a ella (`account_movements_after_valuation`, `finance-core.netWorth`, supuesto `net_worth.movements_after_valuation`). Sin valoración, se usa el saldo del libro. Un pago de deuda reduce lo que se debe. Los movimientos pendientes no cuentan.
2. **Apuntes manuales** por la RPC `create_transaction` (regla 5): gasto, ingreso, traspaso entre cuentas propias (sin patas externas, ADR-0006), aportación y retirada. El importe se escribe en positivo; el tipo da el sentido. La moneda sale de la cuenta, nunca del formulario.
3. **Rentabilidad** (`finance-core.returns`): ganancia = valor − aportado neto; rentabilidad total = ganancia / aportado; anualizada por XIRR (bisección en [−99,99 %; 1000 %]) solo con al menos un año de datos y una única solución. Las limitaciones se devuelven como `caveats` con código y se muestran. Los flujos salen de `account_external_flows` (aportaciones y retiradas liquidadas). Si todo el aportado figura en una fecha, se avisa de que la anualizada es aproximada.
4. **Avisos calculados al vuelo** (`finance-core.advice`, niveles 1 y 2): concentración en una entidad, peso del efectivo y las cuentas de ahorro, meses de colchón con el gasto indicado y valores desactualizados. Las reglas devuelven clave de mensaje y parámetros; el texto vive en el catálogo (`advice.*`) y lo vigila `advice-copy-guard` (sin entidades, sin órdenes de operar, sin ISIN). Los umbrales son supuestos editables; por ahora se usan los de `DEFAULT_ADVICE_THRESHOLDS` y solo el gasto mensual se edita (`assumptions.monthly_expense`). No se guardan en `recommendations`: son función pura de los datos, así que no pueden quedar obsoletos.
5. **Agrupación por entidad** en el inicio y gráficos por tipo, entidad y bolsillo en SVG sin JavaScript de cliente; modo privado que oculta importes y deja los porcentajes.
6. **Migraciones aditivas**, aplicadas por la persona propietaria con confirmación: `import_commit`, `movements_after_valuation`, `external_flows`. La web tolera que falten las funciones nuevas (sigue sin ellas y lo registra).

## Alternativas consideradas
- Tratar el saldo del libro como único valor: obliga a cargar todo el historial de cada cuenta.
- Guardar los avisos en `recommendations`: añade estado que caduca; se reserva para avisos con seguimiento (descartar, resolver).
- TWR: necesita valoraciones en cada fecha de flujo; se hará cuando haya histórico suficiente.

## Consecuencias
- Hasta aplicar las migraciones, apuntar movimientos funciona pero no cambia el patrimonio y no hay rentabilidad.
- Los textos de nivel 2 que describen la cartera de la persona siguen pendientes de revisión legal (docs/plan/07).

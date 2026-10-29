# ADR-0022: Tu parte de una cuenta compartida

- Estado: Aceptado
- Fecha: 2026-10-29

## Contexto
Una cuenta conjunta (p. ej., al 50 % con la pareja) no es toda del hogar de una persona: contar su saldo entero infla el patrimonio y contar todos sus gastos infla el gasto. El modelo ya tiene `account_holders` (titularidad legal con porcentajes), pero exige crear personas y no se usa en la interfaz; pedirlo para empezar iría contra la regla 25 (sencillez).

## Decisión
- `accounts.share_bps` (1-10000, por defecto 10000): la parte económica propia de la cuenta.
- `finance-core.netWorth` aplica `shareBps` a la aportación de cada cuenta (después de convertir a la moneda base), reparte con `allocate` y lo deja en la explicación (`AccountLine.shareBps`, supuesto `net_worth.account_share_applied`).
- `category_totals` y `monthly_cashflow` pesan cada movimiento por la parte de su cuenta de efectivo.
- Al crear la cuenta se pregunta «Tu parte (%)», con 100 por defecto. La detección de cargos inusuales ve el importe completo (es lo que cobró el banco).

## Alternativas consideradas
- Usar `account_holders`: más fiel jurídicamente, pero obliga a crear personas y a vincular al usuario; se mantendrá para la titularidad legal.
- No modelarlo y contar la cuenta entera: distorsiona patrimonio y gasto.

## Consecuencias
- Patrimonio y gastos reflejan solo lo propio; la parte es un supuesto editable de la persona.
- Los importes de la cuenta siguen completos en el libro y en la pantalla de importación.
- Habrá que permitir editar la parte de una cuenta existente desde la interfaz (hoy solo al crearla) y, si hace falta, derivarla de `account_holders`.

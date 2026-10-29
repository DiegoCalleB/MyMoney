/**
 * Catálogo de textos en español de España. Claves estables: las usan los esquemas Zod como
 * mensajes de error y la interfaz nunca muestra texto técnico. Los avisos (regla 21) también
 * vivirán aquí, revisados, y no se generan libremente.
 */
export const esES = {
  "app.name": "MyMoney",
  "app.tagline": "Dónde está tu dinero y para qué sirve, sin complicaciones.",
  "app.skip_to_content": "Saltar al contenido",
  "app.disclaimer":
    "MyMoney ofrece información y herramientas de cálculo. No recomienda productos concretos.",

  "landing.title": "Tu patrimonio, claro y en un solo sitio",
  "landing.sign_up": "Crear cuenta",
  "landing.sign_in": "Entrar",

  "error.title": "Algo no ha ido bien",
  "error.body": "No hemos podido completar la acción. Puedes intentarlo de nuevo.",
  "error.reference": "Referencia para soporte: {digest}",
  "error.retry": "Reintentar",
  "not_found.title": "No encontramos esta página",
  "not_found.back": "Volver al inicio",

  "validation.invalid_id": "El identificador no es válido.",
  "validation.currency_invalid": "Elige una moneda válida.",
  "validation.amount_required": "Escribe un importe.",
  "validation.amount_invalid": "Escribe el importe con números, por ejemplo 1.234,56.",
  "validation.name_required": "Escribe un nombre.",
  "validation.name_too_long": "El nombre puede tener como máximo 80 caracteres.",
  "validation.email_invalid": "Escribe un correo electrónico válido.",
  "validation.password_too_short": "La contraseña debe tener al menos 12 caracteres.",
  "validation.password_too_long": "La contraseña puede tener como máximo 128 caracteres.",
  "validation.totp_invalid": "El código tiene 6 cifras.",
  "validation.account_kind_invalid": "Elige un tipo de cuenta.",
  "auth.invalid_credentials": "El correo o la contraseña no son correctos.",
  "privacy.hide": "Ocultar cantidades",
  "privacy.show": "Mostrar cantidades",
  "common.back": "Volver",
  "common.sign_out": "Salir",
  "common.save": "Guardar",
  "common.required": "Obligatorio",
  "nav.main": "Navegación principal",
  "nav.spaces": "Tus hogares",
  "nav.home": "Inicio",

  "auth.email.label": "Correo electrónico",
  "auth.password.label": "Contraseña",
  "auth.password.hint":
    "Al menos 12 caracteres. Puedes usar una frase y pegar desde tu gestor de contraseñas.",
  "auth.sign_up.title": "Crea tu cuenta",
  "auth.sign_up.submit": "Crear cuenta",
  "auth.sign_up.have_account": "¿Ya tienes cuenta?",
  "auth.sign_up_failed": "No hemos podido crear la cuenta. Inténtalo de nuevo más tarde.",
  "auth.unavailable":
    "El servicio no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.",
  "auth.unavailable_config":
    "El servidor no tiene bien configurada la conexión con Supabase (URL o clave publicable).",
  "auth.unavailable_origin":
    "La dirección pública de la web (APP_ORIGIN) falta o no es válida en el servidor.",
  "auth.sign_up_closed": "El registro no está disponible ahora mismo.",
  "auth.check_email.title": "Revisa tu correo",
  "auth.check_email.body":
    "Si el correo es válido, te hemos enviado un enlace para confirmar la cuenta. Ábrelo en este mismo navegador.",
  "auth.sign_in.title": "Entrar",
  "auth.sign_in.submit": "Entrar",
  "auth.sign_in.no_account": "¿No tienes cuenta?",
  "auth.callback_failed": "El enlace no es válido o ha caducado. Prueba a entrar de nuevo.",

  "mfa.enroll.title": "Activa la verificación en dos pasos",
  "mfa.enroll.intro":
    "Protege tus datos con una aplicación de autenticación, por ejemplo la de tu móvil. Es necesario para usar MyMoney.",
  "mfa.enroll.start": "Empezar",
  "mfa.enroll.secret": "Si no puedes escanearlo, escribe esta clave en la aplicación:",
  "mfa.enroll.confirm": "Activar",
  "mfa.enroll.failed": "No hemos podido iniciar la activación. Inténtalo de nuevo.",
  "mfa.enroll.open_app": "Abrir en mi aplicación de autenticación",
  "mfa.enroll.open_hint":
    "En el móvil, con un toque se añade la cuenta. Si no se abre, copia la clave y pégala en tu aplicación (Añadir cuenta → Introducir clave).",
  "mfa.enroll.copy": "Copiar clave",
  "mfa.enroll.copied": "Clave copiada",
  "mfa.banner": "Tu cuenta aún no tiene verificación en dos pasos.",
  "mfa.banner.cta": "Activarla",
  "mfa.code.label": "Código de 6 cifras",
  "mfa.verify.title": "Verificación en dos pasos",
  "mfa.verify.intro": "Escribe el código de 6 cifras que muestra tu aplicación de autenticación.",
  "mfa.verify.submit": "Verificar",
  "mfa.verify.wrong": "El código no es correcto o ha caducado. Prueba con el siguiente.",

  "spaces.title": "Tus hogares",
  "spaces.empty": "Aún no tienes ningún hogar. Crea el primero para empezar.",
  "spaces.open": "Abrir {name}",
  "spaces.create.title": "Crear un hogar",
  "spaces.name.label": "Nombre del hogar",
  "spaces.name.hint": "Por ejemplo, «Casa» o «Familia».",
  "spaces.currency.label": "Moneda principal",
  "spaces.create.submit": "Crear hogar",
  "spaces.create.failed": "No hemos podido crear el hogar. Inténtalo de nuevo.",

  "home.title": "Tu patrimonio",
  "home.total": "Patrimonio neto",
  "home.assets": "Lo que tienes",
  "home.liabilities": "Lo que debes",
  "home.by_pocket": "Por bolsillo",
  "home.unassigned": "Sin asignar a un bolsillo",
  "home.accounts": "Tus cuentas",
  "home.group.count": "{count} cuentas",
  "home.charts.title": "Tu cartera en gráficos",
  "home.charts.by_kind": "Por tipo de activo",
  "home.charts.by_institution": "Por entidad",
  "home.charts.by_pocket": "Por bolsillo",
  "home.charts.other": "Otros",
  "home.charts.note": "Solo se dibuja lo que tienes; las deudas no forman parte de la composición.",
  "home.add_account": "Añadir cuenta",
  "home.empty.title": "Empieza añadiendo una cuenta",
  "home.empty.body":
    "Con el nombre, la moneda y lo que tienes hoy es suficiente. Lo demás puedes añadirlo después.",
  "home.empty.cta": "Añadir tu primera cuenta",
  "home.notices": "Avisos",
  "home.notices.none": "No hay avisos por ahora.",
  "home.partial":
    "Este total no incluye {count} cuenta(s) porque falta un valor o un tipo de cambio.",
  "home.value.today": "Valor de hoy",
  "home.value.age": "Valor de hace {days} días",
  "home.value.stale": "Desactualizado: valor de hace {days} días",
  "home.explain.summary": "¿De dónde sale esta cifra?",
  "home.explain.method": "Suma de las cuentas en {currency} a fecha {date}. Las deudas restan.",
  "home.explain.excluded": "No incluida: {name} ({reason})",
  "home.explain.assumptions": "Supuestos",
  "net_worth.valuation_over_ledger":
    "Si una cuenta tiene valoración, se usa la última; si no, el saldo de sus movimientos.",
  "net_worth.movements_after_valuation":
    "A la última valoración se suman los movimientos apuntados después, si los hay.",
  "net_worth.liabilities_subtract": "Las hipotecas, préstamos y tarjetas restan del patrimonio.",
  "net_worth.fx_latest_on_or_before":
    "Lo que está en otra moneda se convierte con el último tipo de cambio publicado hasta esa fecha.",
  "net_worth.unallocated_to_unassigned":
    "Lo que no está repartido entre bolsillos aparece como «sin asignar».",
  "net_worth.no_value": "falta un valor",
  "fx.rate_not_found": "falta el tipo de cambio",

  "validation.date_invalid": "Escribe una fecha válida.",
  "movement.kind_invalid": "Elige si es un gasto, un ingreso o un traspaso.",
  "movement.to_account_required": "Elige la cuenta de destino.",
  "movement.same_account": "El origen y el destino deben ser cuentas distintas.",
  "movement.description_too_long": "La descripción puede tener como máximo 200 caracteres.",
  "movement.new.title": "Apuntar un movimiento",
  "movement.new.link": "Apuntar movimiento",
  "movement.kind.label": "¿Qué ha pasado?",
  "movement.kind.expense": "Un gasto",
  "movement.kind.income": "Un ingreso",
  "movement.kind.transfer": "Un traspaso entre mis cuentas",
  "movement.account.label": "Cuenta",
  "movement.account.from": "Cuenta de origen",
  "movement.account.to": "Cuenta de destino",
  "movement.amount.label": "Importe",
  "movement.amount.hint":
    "Escríbelo en positivo, por ejemplo 45,90. El tipo indica si entra o sale.",
  "movement.date.label": "Fecha",
  "movement.description.label": "Descripción (opcional)",
  "movement.submit": "Guardar movimiento",
  "movement.failed": "No hemos podido guardar el movimiento. Inténtalo de nuevo.",
  "movement.amount_invalid": "No entendemos el importe. Escríbelo como 1.234,56.",
  "movement.amount_not_positive": "El importe debe ser mayor que cero.",
  "movement.date_future": "La fecha no puede ser posterior a hoy.",
  "movement.account_invalid": "Esa cuenta no es de este hogar.",
  "movement.currency_mismatch": "Un traspaso solo puede ser entre cuentas de la misma moneda.",
  "movement.no_accounts": "Necesitas al menos una cuenta para apuntar un movimiento.",
  "movement.needs_two_accounts": "Para un traspaso necesitas al menos dos cuentas.",
  "returns.link": "Rentabilidad",
  "returns.title": "Rentabilidad",
  "returns.lead":
    "Cuánto has puesto, cuánto has ganado y qué ha rendido tu dinero. Cada cifra dice cómo se calcula.",
  "returns.empty":
    "Todavía no hay cuentas de inversión con valoraciones. Añade una cuenta y actualiza su valor para ver su rentabilidad.",
  "returns.total.title": "Conjunto de tus inversiones",
  "returns.total.needs_two":
    "El conjunto aparece cuando al menos dos cuentas de inversión tienen valoraciones.",
  "returns.accounts": "Por cuenta",
  "returns.period": "Del {from} al {to}, en {currency}.",
  "returns.gain.title": "Aportado y ganado",
  "returns.gain.contributed": "Aportado",
  "returns.gain.withdrawn": "Retirado",
  "returns.gain.net": "Dinero puesto",
  "returns.gain.end": "Valor actual",
  "returns.gain.gain": "Ganado",
  "returns.gain.opening": "Valor al empezar",
  "returns.xirr.title": "Rentabilidad de tu dinero",
  "returns.xirr.hint":
    "Tiene en cuenta cuándo pusiste cada euro (XIRR). Depende de tus aportaciones.",
  "returns.twr.title": "Rentabilidad de la inversión",
  "returns.twr.hint":
    "Quita el efecto de cuánto y cuándo aportaste (TWR). Sirve para comparar con un fondo o un índice.",
  "returns.real.title": "Rentabilidad real",
  "returns.real.hint": "Descontada la inflación. Se calcula sobre la rentabilidad de la inversión.",
  "returns.real.basis_xirr":
    "Se calcula sobre la rentabilidad de tu dinero porque faltan valoraciones para la de la inversión.",
  "returns.real.inflation": "Inflación del periodo: {value}",
  "returns.annualized": "{value} al año",
  "returns.cumulative": "{value} en el periodo",
  "returns.short_period": "Menos de un año: se muestra lo acumulado, no el equivalente anual.",
  "returns.unavailable": "No se puede calcular: {reason}",
  "returns.explain.summary": "¿Cómo se calcula?",
  "returns.explain.assumptions": "Supuestos",
  "returns.explain.notes": "Avisos sobre los datos",
  "returns.explain.method": "Método: {method}.",
  "returns.method.xirr":
    "tasa anual que iguala lo aportado con lo recuperado, según las fechas (XIRR)",
  "returns.method.twr": "encadenado de los tramos entre valoraciones (TWR)",
  "returns.invalid_period": "el periodo no es válido",
  "returns.flow_outside_period": "hay un movimiento fuera del periodo valorado",
  "returns.no_flows": "no hay aportaciones ni valor",
  "returns.same_sign": "hace falta al menos una aportación y un valor final",
  "returns.no_convergence": "el cálculo no encuentra una solución con estas fechas e importes",
  "returns.insufficient_valuations": "hacen falta al menos dos valoraciones",
  "returns.duplicate_valuation_date": "hay dos valoraciones en la misma fecha",
  "returns.twr_no_computable_segments": "ningún tramo tiene una base de cálculo",
  "returns.no_nominal_return": "falta la rentabilidad sobre la que calcularla",
  "returns.cpi_not_available": "faltan datos de inflación (IPC) para estas fechas",
  "returns.cpi_invalid": "los datos de inflación no son válidos",
  "returns.xirr_multiple_roots":
    "Con tantos cambios de aportar y retirar, el cálculo admite más de una solución; se muestra una de ellas.",
  "returns.twr_dietz_approximation":
    "Aproximado entre {from} y {to}: hubo aportaciones o retiradas sin valoración ese día.",
  "returns.twr_segment_skipped":
    "No se cuenta el tramo de {from} a {to}: empezaba sin dinero invertido.",
  "returns.cpi_latest_published":
    "Inflación conocida solo hasta {until}; para fechas posteriores se usa ese último dato.",
  "returns.series_cost_basis_used":
    "Una cuenta aún no tenía valoración en {date}: se ha usado lo aportado hasta entonces.",
  "returns.series_fx_missing":
    "Falta un tipo de cambio en {date}: una cuenta no se ha sumado ese día.",
  "returns.xirr_365_day_year": "Un año tiene 365 días.",
  "returns.xirr_same_day_flows_netted": "Las aportaciones y retiradas del mismo día se suman.",
  "returns.twr_valuation_includes_same_day_flows":
    "Cada valoración incluye los movimientos de su día.",
  "returns.twr_chained_segments": "La rentabilidad de cada tramo entre valoraciones se encadena.",
  "returns.twr_dietz_when_flow_inside_segment":
    "Si hubo movimientos dentro de un tramo, se estima con Dietz modificado.",
  "returns.fees_and_taxes_inside_value":
    "Las comisiones e impuestos ya están descontados del valor.",
  "returns.real_ratio_not_difference":
    "La real se calcula con el cociente, no restando la inflación.",
  "returns.cpi_monthly_linear_interpolation":
    "El IPC es mensual; dentro de un mes se interpola entre un índice y el siguiente.",
  "returns.cpi_index_applies_to_first_day": "Cada índice mensual se toma como el del día 1.",
  "ledger.flows_internal_transfers_excluded":
    "Un traspaso entre cuentas del mismo conjunto no es una aportación.",
  "ledger.flows_fees_taxes_are_costs": "Las comisiones e impuestos son un coste, no una retirada.",
  "ledger.flows_dividends_interest_are_returns":
    "Los dividendos e intereses son rendimiento, no aportaciones.",
  "ledger.flows_fx_on_movement_date": "Las divisas se convierten al tipo del día del movimiento.",
  "ledger.series_last_valuation_plus_flows":
    "Cada cuenta vale su última valoración más lo aportado después.",
  "ledger.series_cost_basis_before_first_valuation":
    "Antes de su primera valoración, una cuenta vale lo aportado.",
  "risk.link": "Riesgo",
  "risk.title": "Riesgo y exposición",
  "risk.lead":
    "Dónde está tu dinero, cuánto se concentra y qué pasaría en una caída hipotética. Son escenarios para entender tu cartera, no previsiones.",
  "risk.empty":
    "Todavía no hay cuentas con valor. Añade una cuenta y su valor para ver su exposición.",
  "risk.unavailable":
    "No se puede calcular la exposición: el reparto de alguna cuenta no es válido.",
  "risk.composition.title": "Qué tienes",
  "risk.composition.low_quality":
    "Parte de este reparto es una estimación por el tipo de cuenta. Ajusta las cuentas de inversión para afinarlo.",
  "risk.composition.adjust": "Ajustar reparto",
  "risk.composition.adjust_list": "Cuentas que puedes ajustar",
  "risk.concentration.title": "Concentración",
  "risk.concentration.account":
    "Tu cuenta más grande es {name} y pesa el {share} de lo que tienes.",
  "risk.concentration.class": "La clase que más pesa es {name} con el {share}.",
  "risk.concentration.effective":
    "Es como tener tu dinero repartido a partes iguales en {count} sitios.",
  "risk.speculative.title": "Parte especulativa",
  "risk.speculative.body":
    "Lo que has marcado como especulativo (las cuentas de criptomonedas) es el {share} de lo que tienes:",
  "risk.scenarios.title": "Escenarios de caída",
  "risk.scenarios.note":
    "Escenarios hipotéticos, no previsiones. Cada clase cae lo indicado y las demás no cambian; no hay correlaciones.",
  "risk.scenario.moderate": "Caída moderada",
  "risk.scenario.strong": "Caída fuerte",
  "risk.scenario.crisis": "Crisis",
  "risk.scenario.impact": "Es el {share} de lo que tienes.",
  "risk.scenario.after": "Te quedarían",
  "risk.scenario.months": "Equivale a {months} meses de tu gasto medio.",
  "risk.scenario.no_spending":
    "Sin gasto registrado de los últimos tres meses no se puede expresar en meses de gasto.",
  "risk.scenario.shock": "{name}: {value}",
  "risk.scenario.by_account": "Por cuenta",
  "risk.explain.summary": "¿Cómo se calcula?",
  "risk.explain.notes": "Avisos sobre los datos",
  "risk.class_by_composition_or_main_class":
    "Cada cuenta se reparte con su reparto por clases; si no lo hay, con la clase que corresponde a su tipo.",
  "risk.unclassified_shown_apart":
    "Lo que no se sabe de qué clase es se muestra aparte como sin clasificar.",
  "risk.stress_hypothetical_not_forecast":
    "Es una hipótesis para entender el riesgo, no una previsión.",
  "risk.stress_no_correlations":
    "No se modelan correlaciones: cada clase cae lo indicado y las demás no cambian.",
  "risk.class_from_fallback": "{name}: clase estimada por el tipo de cuenta.",
  "risk.composition_incomplete":
    "{name}: el reparto no llega al 100 %; lo que falta está sin clasificar.",
  "risk.unclassified": "{name}: sin clase conocida.",
  "risk.edit.title": "Reparto de {name}",
  "risk.edit.lead":
    "Escribe qué parte de esta cuenta es de cada clase. Lo que falte hasta el 100 % queda sin clasificar. Déjalo en blanco para volver al valor por defecto.",
  "risk.edit.submit": "Guardar reparto",
  "risk.edit.back": "Volver a riesgo",
  "risk.field_invalid": "Escribe un porcentaje entre 0 y 100, con hasta dos decimales.",
  "risk.invalid": "Revisa los porcentajes marcados.",
  "risk.sum_over": "La suma de los porcentajes supera el 100 %.",
  "risk.failed": "No hemos podido guardar el reparto. Inténtalo de nuevo.",
  "asset_class.equity": "Renta variable",
  "asset_class.fixed_income": "Renta fija",
  "asset_class.cash": "Liquidez",
  "asset_class.real_estate": "Inmuebles",
  "asset_class.crypto": "Criptomonedas",
  "asset_class.commodity": "Materias primas",
  "asset_class.mixed": "Mixto (sin detallar)",
  "asset_class.unclassified": "Sin clasificar",
  "values.title": "Actualizar valores",
  "values.link": "Actualizar valores",
  "values.intro":
    "Escribe el valor actual solo de las cuentas que hayan cambiado; las que dejes en blanco no se tocan.",
  "values.date.label": "Valor a fecha de",
  "values.current": "Ahora: {value}",
  "values.debt_hint": "Lo que debes, en positivo.",
  "values.submit": "Guardar valores",
  "values.failed": "No hemos podido guardar los valores. Inténtalo de nuevo.",
  "values.nothing": "No has escrito ningún valor nuevo.",
  "values.invalid": "Revisa los importes marcados.",
  "values.field_invalid": "No entendemos este importe. Escríbelo como 1.234,56.",
  "values.field_negative": "El importe no puede ser negativo.",
  "values.date_future": "La fecha no puede ser posterior a hoy.",
  "values.partial": "Se guardaron algunos valores, pero otros no. Revisa la lista y repite.",
  "account.institution.label": "Entidad (opcional)",
  "account.institution.hint":
    "El banco, bróker o plataforma donde está. Las cuentas de la misma entidad se agrupan en el inicio.",
  "account.new.title": "Añadir una cuenta",
  "account.name.label": "Nombre",
  "account.name.hint": "Por ejemplo, «Cuenta nómina».",
  "account.kind.label": "Tipo de cuenta",
  "account.currency.label": "Moneda",
  "account.value.label": "Importe de hoy",
  "account.value.hint":
    "Si es una deuda (hipoteca, préstamo o tarjeta), escribe lo que debes, en positivo. Usa coma para los decimales, por ejemplo 1.234,56.",
  "account.new.submit": "Guardar cuenta",
  "account.new.failed": "No hemos podido guardar la cuenta. Inténtalo de nuevo.",
  "account.value_invalid":
    "No entendemos ese importe. Usa coma para los decimales, por ejemplo 1.234,56.",
  "account.value_negative":
    "Escribe el importe en positivo. Si es una deuda, elige su tipo de cuenta.",
  "account.kind.current": "Cuenta corriente",
  "account.kind.savings": "Cuenta de ahorro",
  "account.kind.deposit": "Depósito",
  "account.kind.cash": "Efectivo",
  "account.kind.brokerage": "Cuenta de inversión",
  "account.kind.fund_holding": "Fondos de inversión",
  "account.kind.pension_plan": "Plan de pensiones",
  "account.kind.crypto": "Criptomonedas",
  "account.kind.real_estate": "Inmueble",
  "account.kind.vehicle": "Vehículo",
  "account.kind.other_asset": "Otro bien",
  "account.kind.mortgage": "Hipoteca",
  "account.kind.loan": "Préstamo",
  "account.kind.credit_card": "Tarjeta de crédito",
} as const;

export type MessageKey = keyof typeof esES;

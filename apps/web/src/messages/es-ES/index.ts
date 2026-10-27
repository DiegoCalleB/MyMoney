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
  "mfa.enroll.scan": "Escanea este código con tu aplicación de autenticación.",
  "mfa.enroll.qr_alt": "Código QR para tu aplicación de autenticación",
  "mfa.enroll.secret": "Si no puedes escanearlo, escribe esta clave en la aplicación:",
  "mfa.enroll.confirm": "Activar",
  "mfa.enroll.failed": "No hemos podido iniciar la activación. Inténtalo de nuevo.",
  "mfa.enroll.open_app": "Abrir en mi aplicación de autenticación",
  "mfa.enroll.open_hint":
    "En el móvil, con un toque se añade la cuenta. Si no se abre, usa la clave de abajo.",
  "mfa.enroll.copy": "Copiar clave",
  "mfa.enroll.copied": "Clave copiada",
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
  "net_worth.liabilities_subtract": "Las hipotecas, préstamos y tarjetas restan del patrimonio.",
  "net_worth.fx_latest_on_or_before":
    "Lo que está en otra moneda se convierte con el último tipo de cambio publicado hasta esa fecha.",
  "net_worth.unallocated_to_unassigned":
    "Lo que no está repartido entre bolsillos aparece como «sin asignar».",
  "net_worth.no_value": "falta un valor",
  "fx.rate_not_found": "falta el tipo de cambio",

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

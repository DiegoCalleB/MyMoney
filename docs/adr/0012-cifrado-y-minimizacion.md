# ADR-0012: Minimizar antes que cifrar campo a campo en el MVP

- Estado: Propuesto
- Fecha: 2026-10-26

## Contexto
Se pidió valorar el cifrado a nivel de campo de los datos más sensibles.

## Análisis
- Cifrar importes impediría agregarlos en la base de datos y, si la clave vive en el mismo servidor que descifra para calcular, el beneficio frente a un atacante con acceso a la aplicación es pequeño. Protege sobre todo frente a la filtración de una copia o de un *dump*, que ya está cifrado en reposo por el proveedor.
- El mayor riesgo real está en datos que **no hace falta guardar** (IBAN completo, DNI, descripciones detalladas, fecha de nacimiento completa).

## Decisión
- MVP: **minimización** (no se guardan IBAN completos, DNI, direcciones ni fechas de nacimiento; descripciones recortadas y opcionales) + cifrado en reposo del proveedor + TLS.
- Secretos de integraciones futuras (tokens de agregadores) cifrados con Supabase Vault o equivalente, nunca en claro.
- Fase 2: reevaluar el cifrado en la aplicación de notas de texto libre con una clave gestionada fuera de la base de datos (KMS), si se añaden.

## Consecuencias
- (+) Menos datos = menos riesgo y menos obligaciones; cálculos sencillos.
- (−) Un acceso completo a la aplicación expone los importes; se mitiga con los controles de acceso, auditoría y MFA.

# ADR-0023: Producto de una cuenta para declarar su composición

- Estado: Propuesto
- Fecha: 2026-10-29

## Contexto
La exposición real (mirar dentro de los fondos, ADR-0017) necesita la composición de lo que tienes. Esa composición cuelga de los **activos** (`asset_compositions`), pero las cuentas del hogar no tienen activos asociados: la persona da de alta «mi fondo de ING» como una cuenta con un valor. Pedir además dar de alta activos y valoraciones por posición duplicaría el dato y exigiría entender el modelo para empezar (regla 25, ADR-0018).

## Decisión
1. **Un fondo = una cuenta = un producto.** Se añade `accounts.primary_asset_id` (opcional, clave foránea compuesta por espacio, `on delete set null`). La composición sigue colgando del activo; la cuenta solo apunta a él.
2. El activo se crea **al declarar la composición**, con el nombre y la moneda de la cuenta y clase «mixto»; la persona no ve ni gestiona activos.
3. El valor de la posición es el de la cuenta en el patrimonio (una sola cifra, la misma que se ve en el inicio): no hay valoraciones por posición.
4. La composición se guarda por dimensión (clase de activo, región, divisa, sector) con fecha, fuente «manual» y autor; la exposición usa la última no posterior a hoy. Sin composición, la cuenta queda «sin clasificar» y se dice.
5. Una cuenta con varias posiciones (un bróker con muchos valores) no usa esta vía: se queda sin clasificar hasta que se decida cómo declarar composiciones por posición.

## Alternativas consideradas
- **Composición por cuenta sin activo**: tabla nueva paralela a `asset_compositions` (dos conceptos para lo mismo).
- **Activos y valoraciones por posición**: más fiel, pero obliga a mantener dos cifras (cuenta y posiciones) y complica el alta.

## Consecuencias
- (+) Una pantalla sencilla («¿cómo está repartido?») sin tocar el modelo de patrimonio ni duplicar valores.
- (−) No representa cuentas con varias posiciones; se documenta y queda como ampliación.
- Migración aditiva `20261029040000_account_primary_asset.sql` con pruebas pgTAP.

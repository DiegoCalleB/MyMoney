# ADR-0017: Bolsillos, reglas del usuario, composición con procedencia y sencillez de uso

- Estado: Propuesto
- Fecha: 2026-10-26

## Contexto
El dinero no se organiza por entidades sino por **función**. El propietario pide bolsillos con objetivo y riesgo permitido, reglas editables, transparencia sobre lo que contiene cada producto, efectivo remunerado por tramos y procedencia de cada cifra, y añade que **la aplicación debe seguir siendo sencilla de usar**.

## Decisión
1. **Bolsillo** (`pockets`): función, objetivo opcional (importe y fecha), `risk_level` permitido y horizonte. **Sustituye a `goal_accounts`**, que se elimina (la migración aún no se había aplicado en ningún entorno). `goals` se queda para la planificación (jubilación, compra de vivienda) y un bolsillo puede enlazarse con uno.
2. **Reparto** (`pocket_allocations`): parte de una cuenta o de una posición, en puntos básicos. Por destino la suma es ≤ 100 %; lo no asignado es "efectivo sin función". Una cuenta se reparte entera o por posiciones, nunca de las dos formas (lo impone la base de datos).
3. **Reglas como datos sobre un catálogo cerrado** (`advice_rules`): `template` y `metric` pertenecen al catálogo de `finance-core`; el usuario elige ámbito, comparador, umbral, severidad y duración. **No hay expresiones ni código del usuario.** El texto del aviso sale siempre del catálogo de mensajes (regla 21 y `reco-copy-guard`); `note` es una anotación que nunca se muestra como aviso. Las reglas se pausan con motivo y fecha, se archivan (no se borran) y cada cambio queda en `advice_rule_revisions` mediante un trigger. Los avisos que generan son de nivel 2 y usan `recommendations` (`rule_id = 'r.<uuid sin guiones>'`, `rule_version` = versión de la regla). Esto matiza el ADR-0010: las reglas siguen sin ser código a medida, pero sus parámetros son datos editables.
4. **Composición y coste**: `asset_compositions` (ya existente) y `asset_fee_snapshots` guardan clase, región, divisa, sector, posiciones y TER como instantánea con fuente y fecha. Sin composición, la aplicación lo dice y no inventa un reparto.
5. **Efectivo por tramos** (`cash_rate_tiers`): tipo por tramo de saldo y fecha de inicio, con fuente obligatoria y marca `needs_verification` activada por defecto. Ningún tipo vive en el código.
6. **Procedencia**: `source`, `as_of`, `entered_by` y `needs_verification` en valoraciones, composiciones, comisiones y tramos. `entered_by` lo fija un trigger con el usuario autenticado: el cliente no puede atribuir un dato a otra persona. Los orígenes de una valoración son `manual`, `csv`, `statement`, `price_feed` y `computed`. Los movimientos conservan su procedencia en las filas de importación.
7. **Sencillez como requisito de diseño** (regla de `AGENTS.md`):
   - La pantalla de inicio muestra solo el patrimonio por bolsillo (progreso y encaje de riesgo) y los avisos activos.
   - Composición, reglas, tramos y procedencia se muestran **bajo demanda** ("¿de dónde sale este número?", "ver composición").
   - Los bolsillos y las reglas de arranque se crean con valores por defecto sensatos desde el alta; configurar es opcional.
   - Todo lo avanzado tiene un valor por defecto y una explicación en una frase.
   - Una función que exija al usuario entender el modelo de datos para empezar no está terminada.

## Alternativas consideradas
- Mantener `goal_accounts` y añadir bolsillos: dos conceptos para lo mismo.
- Reglas con expresiones libres o un motor genérico: no testeables, y abren la puerta a texto y productos fuera del control legal.
- Procedencia solo en la interfaz: se pierde la auditoría de quién y cuándo.

## Consecuencias
- (+) Un único concepto por función del dinero; reglas editables sin salir de los límites legales; cifras trazables.
- (−) Cada plantilla nueva exige código y tests en `finance-core`; se acepta porque es la garantía.
- Las plantillas de arranque y su traducción de `risk_level` a umbrales se implementan en `finance-core` (fase 2 de construcción) con tests de propiedades.
- La EIPD se actualiza antes de la fase 2 incluyendo bolsillos y anotaciones.

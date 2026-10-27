# 14. Caso de referencia: el primer hogar

> **Este documento no contiene datos reales.** El caso real del primer usuario vive fuera del repositorio (`privado/`, ignorado por git). Aquí solo está su **forma**, para guiar el diseño y los tests. Las semillas y los *fixtures* usan cifras inventadas con esta misma forma.

## Forma del caso

- Hogar compartido por dos adultos (propietario + editora), con dos menores titulares de sus propias cuentas, que se ven aparte y con acceso restringido.
- Residencia fiscal en España, moneda EUR, zona `Europe/Madrid`. Perfil de inversor principiante: todo término técnico se explica la primera vez.
- Patrimonio repartido en 5 entidades y 11 posiciones:
  - Un plan de pensiones con mucha renta variable y coste bajo, con el límite anual de aportación ya alcanzado.
  - Dos fondos mixtos de un banco (50/50 y 75/25) con coste alto, traspasables.
  - Una cartera indexada en otra gestora con un traspaso entrante pendiente.
  - Un bróker con mucho efectivo remunerado (el principal problema: liquidez muy por encima del colchón) y una pequeña cartera.
  - Un bróker social y un exchange de cripto con euros y criptoactivos, que el usuario considera "apuestas".
  - Cuentas de ahorro de dos menores.
- Plan del usuario: colchón de 6 meses de gasto que no se invierte; entrada escalonada (varias compras quincenales repartidas 80/20 entre renta variable global y emergente, y el resto durante 8-10 meses); tope del 5 % en apuestas; simular una pequeña posición en oro sin registrarla; comparar dos carteras indexadas; vivienda en ~5 años con hipoteca a 25 años.

## Requisitos que este caso añade al diseño (todos genéricos)

1. **Bolsillos** definidos por el usuario (colchón, casa, largo plazo, apuestas, hijas) para los desgloses y las reglas (ADR-0017 y ADR-0018; sustituyen a los grupos de cuentas).
2. **Planes de inversión con calendario**: operaciones planificadas que se marcan como hechas enlazando la transacción real; el resto se recalcula.
3. **Hipótesis** separadas de los datos reales (oro, cambio de cartera, traspaso frente a venta): planes `what_if` que nunca se marcan hechos; las carteras alternativas se dan de alta como activos con su ficha y composición.
4. **Carteras modelo introducidas por el usuario** para comparar composición, coste y caída histórica con su fuente, sin catálogo de productos recomendados.
5. **Composición de fondos** (*look-through*) para diversificación y solapamientos, diciendo "sin datos" cuando falten.
6. **Transacciones en curso** (traspasos entre gestoras).
7. **Reservas por objetivo**: el colchón y el dinero de un objetivo a corto plazo no cuentan como "invertible".
8. **Comparador de costes con dos vías**: traspaso (sin tributar, conserva la antigüedad fiscal) frente a venta y compra (tributa en la base del ahorro), con el ahorro anual estimado de cada una.
9. **Avisos fiscales informativos**: límite de aportación a planes de pensiones, tributación del rescate, permuta cripto↔cripto como transmisión.
10. **Simulador de caídas contra la pérdida máxima declarada** en el perfil.
11. **Carga inicial auditable**: cada saldo inicial como `opening_balance` o valoración con fuente y, opcionalmente, el justificante adjunto.

Las tablas correspondientes están en `04-modelo-datos.md`, sección "Ampliación tras el caso de referencia".

## Importación por entidad (investigación pública, octubre de 2026)

| Entidad | Formato conocido | Prioridad |
|---------|------------------|-----------|
| Trade Republic | CSV oficial de transacciones desde abril de 2026, según fuentes de terceros; revisar el staking [A VERIFICAR] | Fase 1 |
| eToro | Extracto de cuenta en .xlsx [A VERIFICAR el formato actual] | Fase 1-2 |
| Binance | CSV del historial (tramos de 3 meses) y API de solo lectura | Fase 1-2 (CSV), fase 3 (API) |
| ING (fondos y plan de pensiones) | Sin documentación pública de exportación encontrada; posible solo PDF [A VERIFICAR] | Manual asistida |
| MyInvestor | Sin documentación pública encontrada [A VERIFICAR] | Manual asistida |

Los fondos de inversión y los planes de pensiones **no** son cuentas de pago: quedan fuera de PSD2. La conexión automática de esos productos dependería de la futura normativa europea de acceso a datos financieros (FiDA, en tramitación) [A VERIFICAR estado].

## Pruebas derivadas

- Semilla ficticia `supabase/seed/hogar-referencia` con la misma forma y cifras inventadas.
- Tests E2E: el desglose por bolsillos más lo no asignado suma exactamente el total; el plan escalonado recalcula el resto al marcar una compra; una hipótesis no altera el patrimonio real; el traspaso entre fondos no cambia lo aportado; el aviso de tope especulativo se activa al cruzar el umbral; el aviso de reserva invadida salta si una compra planificada usa dinero reservado.

# Hogar de referencia (datos inventados)

Semilla **ficticia** con la misma forma que el caso real del primer usuario (`docs/plan/14-caso-de-referencia.md`): un plan de pensiones, fondos mixtos de una gestora, un bróker con efectivo remunerado y una pequeña cartera, un bróker social, un exchange de cripto y dos cuentas de menores fuera del patrimonio del hogar. **Todas las cifras, nombres y fechas están inventados.**

Los datos reales viven en `privado/` (ignorado por git) y nunca se copian aquí.

## Archivos

- `cuentas.csv`: una fila por cuenta (`;` como separador, coma decimal, fechas ISO). `ambito` es `household` o `external`; `aportado` y `desde` son opcionales (en un plan, `desde` puede ser solo el año).
- `ingresos-y-gastos.csv`: supuestos de ingresos y gasto del hogar.

## Para qué sirven

- Fixture de las pruebas de carga inicial y del patrimonio con la forma del caso real.
- Datos para probar la aplicación en un entorno de desarrollo sin usar cifras reales.
- El test `apps/web/test/seed.test.ts` comprueba que el archivo es válido (tipos de cuenta, monedas, importes y fechas).

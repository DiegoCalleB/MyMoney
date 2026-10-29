# 11. Costes estimados

> **Todo lo de esta página es [ESTIMACIÓN]** con precios públicos consultados en octubre de 2026 o conocidos previamente, sin IVA. Los precios cambian: **verificar en la página oficial de cada proveedor antes de contratar**. Los proveedores con precios en USD se dejan en USD.

## Referencias de precio consultadas

- **Supabase** ([supabase.com/pricing](https://supabase.com/pricing)): plan Pro desde **25 USD/mes por organización**, que incluye 10 USD/mes de crédito de cómputo (cubre una instancia *Micro*); cada proyecto adicional suma su cómputo (~10 USD/mes una *Micro*). El plan Pro incluye copias diarias con 7 días de retención. **PITR es un complemento desde ~100 USD/mes** (ventana de 7 días). Fuentes secundarias de 2026 dan cifras contradictorias para ventanas de 14 días y sobre si el plan Team la incluye: [A VERIFICAR] ([MakerKit](https://makerkit.dev/blog/saas/supabase-pricing), [JetAdmin](https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/)).
- El plan gratuito de Supabase pausa los proyectos inactivos y no ofrece las mismas garantías de copias [A VERIFICAR condiciones actuales]: válido para desarrollo y *staging*, **no** para guardar tus datos reales sin copias propias.
- **Hosting Next.js** (p. ej., Vercel): plan gratuito solo para uso personal no comercial; plan Pro ~20 USD/mes por miembro [A VERIFICAR]. Alternativas UE: contenedor en Scaleway/Hetzner/OVH desde pocos euros al mes, con más operación propia.
- **Correo, errores, analítica**: niveles gratuitos suficientes en las fases 1-2 [A VERIFICAR límites de cada uno].

## Por fase

| Partida | Fase 0-1 (personal) | Fase 2 (5-15 amigos) | Fase 3 (100-500 clientes, orientativo) |
|---------|---------------------|----------------------|----------------------------------------|
| Supabase producción | 0 (gratis + copia propia semanal) **o** 25-35 USD (Pro) [RECOMENDACIÓN: Pro desde que haya datos reales] | 25-35 USD | 25 USD + cómputo *Small/Medium* (~15-60 USD) |
| Supabase *staging* | 0 (plan gratuito) | 0-10 USD | ~10 USD |
| PITR | — | ~100 USD (recomendado: hay datos de terceros) | ~100-200 USD |
| Hosting web | 0 (uso personal) | ~20 USD (Pro, ya no es uso personal) | 20-60 USD |
| Dominio | ~10-20 €/año | ídem | ídem |
| Correo transaccional | 0 | 0 | 0-20 USD |
| Errores y monitorización | 0 | 0-26 USD | 26-80 USD |
| Limitador / clave-valor | 0 (Postgres) | 0-10 USD | 10-30 USD |
| IA (si se activa) | — | < 10 USD (uso bajo) | Según uso; medir coste por aviso explicado |
| Precios de mercado con licencia | — | — | Muy variable (de 0 con fuentes oficiales limitadas a cientos al mes) [A VERIFICAR] |
| Agregador PSD2 | — | — | Por conexión o por usuario; pedir ofertas. GoCardless Bank Account Data (antes Nordigen) no admite altas nuevas desde julio de 2025 ([aviso oficial](https://bankaccountdata.gocardless.com/new-signups-disabled)). Enable Banking: gratis para cuentas propias, precio por volumen en producción [A VERIFICAR] (capítulo 16) |
| Pagos (fase 3) | — | — | Comisión por transacción del proveedor |
| **Total infraestructura mensual** | **~0-40 USD** | **~150-200 USD con PITR / ~50-90 USD sin PITR** | **~250-500 USD** |

## Costes puntuales (no de infraestructura)

| Partida | Cuándo | Rango orientativo | Nota |
|---------|--------|-------------------|------|
| Dictamen legal (mercado de valores + protección de datos) | Antes de terminar la fase 2 | 1.500-6.000 € | [ESTIMACIÓN muy abierta]; pedir 2-3 presupuestos con el listado de preguntas del capítulo 7 |
| Textos legales (privacidad, condiciones) | Fase 2-3 | 500-2.000 € | A veces incluido en lo anterior |
| Prueba de penetración externa | Fase 3 | 3.000-10.000 € | [ESTIMACIÓN]; alcance: web + API + RLS |
| Seguro de responsabilidad civil profesional / ciberriesgo | Fase 3 | A consultar | |
| Constitución de sociedad y gestoría | Fase 3 | A consultar | |

## Decisión de coste más relevante

**PITR en la fase 2 (~100 USD/mes)** es la partida recurrente más alta y la que más protege. Alternativa más barata: copias diarias del plan Pro + exportación lógica cada hora a un almacenamiento propio cifrado en la UE (RPO de 1 hora, más trabajo propio). Se decide al inicio de la fase 2 con el número real de usuarios.

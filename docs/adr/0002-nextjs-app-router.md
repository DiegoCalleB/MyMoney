# ADR-0002: Next.js (App Router) con TypeScript estricto, hosting en región UE

- Estado: Propuesto
- Fecha: 2026-10-26

## Contexto
Se necesita una web accesible, rápida en móvil, con lógica de servidor para validar, calcular y proteger secretos, y que una sola persona pueda mantener.

## Decisión
- Next.js con App Router: Server Components para leer, Server Actions para escribir, Route Handlers solo cuando hace falta una URL (exportaciones, *webhooks*).
- TypeScript con `strict` y opciones estrictas adicionales.
- Funciones de servidor desplegadas en una región de la UE (p. ej., Fráncfort). Vercel en las fases 0-2 por simplicidad; reevaluar en la fase 3 o si la pregunta 5 exige soberanía UE (alternativa: contenedor `output: standalone` en un proveedor europeo).
- PWA para el uso móvil.

## Alternativas consideradas
- SPA + API separada (Fastify/NestJS): más piezas y superficie sin beneficio a esta escala.
- Remix/SvelteKit: válidos; Next.js tiene el mejor soporte de `@supabase/ssr` y del ecosistema, y es tu preferencia.
- App nativa: fuera de alcance (coste).

## Consecuencias
- (+) Una sola aplicación, secretos en el servidor, buen rendimiento.
- (−) Acoplamiento a las convenciones de Next.js y a cambios entre versiones mayores; mitigado manteniendo el dominio fuera (`finance-core`).
- Vigilar: la región real de ejecución y de logs del hosting; el CDN global no debe cachear páginas con datos (`no-store`).

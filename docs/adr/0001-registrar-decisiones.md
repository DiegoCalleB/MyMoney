# ADR-0001: Registrar las decisiones de arquitectura con ADR

- Estado: Aceptado
- Fecha: 2026-10-26

## Contexto
El proyecto empieza con una persona y debe poder crecer a un equipo y a clientes. Las decisiones de seguridad, dinero y regulación tienen que poder justificarse más adelante (auditorías, abogados, nuevos colaboradores, Claude Code).

## Decisión
Cada decisión significativa se registra en `docs/adr/NNNN-titulo.md` con la plantilla `0000-plantilla.md`. Los ADR no se reescriben: se sustituyen por otro que los referencia.

## Consecuencias
Pequeño coste de escritura; a cambio, contexto duradero y revisable en los PR.

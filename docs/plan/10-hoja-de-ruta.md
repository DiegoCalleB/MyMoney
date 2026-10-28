# 10. Hoja de ruta por fases

Duraciones calculadas con ~10 h/semana [SUPUESTO, pregunta 9]. Con dedicación completa, divide aproximadamente entre 3. Las fases terminan por **criterios de salida**, no por fecha.

## Fase 0: cimientos (≈ 3 semanas)

**Objetivo**: un esqueleto seguro y verificable en el que añadir funciones sea barato.

Entregables:
- Monorepo `pnpm`, TypeScript estricto, lint, formato, *hooks* de *pre-commit* (*gitleaks*, formato).
- CI completo (lint, tipos, unitarios, pgTAP, E2E de humo, seguridad).
- Supabase local + proyecto *staging* en la UE; migración inicial: `profiles`, `spaces`, `space_members`, `space_invitations`, funciones de RLS, auditoría, *flags*.
- Tests pgTAP de aislamiento entre espacios y test de meta-cobertura de RLS.
- Next.js con autenticación (registro, verificación, inicio de sesión, MFA TOTP), cabeceras de seguridad y CSP, *logger* sin PII, limitador.
- `finance-core` con `Money`, `allocate`, `convert` y su batería de propiedades.
- `AGENTS.md` (instrucciones para cualquier agente), skills en `.agents/skills/`, ADR aceptados, lista ASVS iniciada, plantilla de EIPD.

**Criterios de salida**: CI verde; un usuario no puede ver otro espacio (pgTAP + E2E); CSP sin `unsafe-inline` en scripts; ningún secreto en el repositorio (escaneo limpio); puntuación A en un escáner de cabeceras.

**Riesgos**: sobreinvertir en infraestructura (mitigación: nada que no sirva al MVP); curva de aprendizaje de RLS (mitigación: plantilla de políticas y tests desde el día 1).

## Fase 1: MVP personal (≈ 8-10 semanas)

**Objetivo**: tu patrimonio familiar completo, exacto y explicado.

Iteraciones (2 semanas cada una):
1. Cuentas, titulares, movimientos con patas, valoraciones, tipos del BCE → patrimonio neto (HU-04/05/06/08/09).
2. Aportado frente a ganado, XIRR, TWR, IPC del INE, historial con patrimonio tras cada acción (HU-10/11/12). **Hecho** (ADR-0022): `finance-core` (`returns`, `real-return`, `ledger-flows`), función `return_legs` y pantalla *Rentabilidad*. **Pendiente**: carga automática del IPC del INE, rentabilidad por bolsillo e historial de patrimonio.
3. Importación CSV idempotente con mapeo; plantillas de tus 2-3 entidades (HU-07).
4. Objetivos (colchón, vivienda), compras programadas, simulador de caídas, comisiones (HU-13 a 16, 18) **e ingresos y gastos: categorías, resumen mensual y presupuestos (HU-24 a 28)**. Si el calendario aprieta, HU-27 y HU-28 pasan a la iteración siguiente.
5. Avisos de nivel 1-2, perfil, exportar, borrar, actividad de seguridad (HU-19 a 23). Producción.

**Criterios de salida**:
- Conciliación: en una fecha de corte, cada cuenta coincide al céntimo con el extracto de la entidad.
- XIRR y TWR coinciden con un cálculo independiente en hoja de cálculo para tus cuentas reales (diferencia < 0,01 pp).
- Usado al menos semanalmente durante 4 semanas.
- 0 hallazgos críticos o altos abiertos en la revisión de seguridad (manual + `/security-review` + ZAP).
- Exportación y borrado verificados de extremo a extremo.
- Prueba de restauración hecha y documentada.

**Riesgos**: la entrada manual se hace pesada (mitigación: importación pronto, valoraciones rápidas); los extractos de las entidades cambian de formato (mitigación: mapeo configurable, no analizadores rígidos).

## Fase 2: grupo cerrado de amigos (≈ 8 semanas)

**Objetivo**: validar que sirve a otras personas y situaciones sin comprometer la seguridad.

Entregables:
- **Antes de invitar a nadie**: EIPD completa, aviso de privacidad y condiciones de prueba, DPA firmados con los proveedores, registro de actividades.
- Alta por invitación (HU-30), onboarding (HU-31), plantillas de 5-8 entidades (HU-32).
- PITR en producción; limitador distribuido si hace falta; alertas completas.
- Fiscalidad informativa (HU-39) y, si se aprueba, lotes FIFO (HU-33).
- EIPD actualizada con ingresos y gastos (categorías, descripciones) antes de invitar a nadie.
- Proyecciones Monte Carlo (HU-35); resumen mensual por correo sin cifras (HU-36).
- Evaluación de IA para explicaciones (HU-37) **solo** tras la EIPD y con consentimiento.
- Prueba de accesibilidad con usuarios reales (incluida una persona mayor) y prueba de penetración ligera (externa si el presupuesto lo permite).
- Consulta legal sobre las preguntas 1-3 del capítulo 7.

**Criterios de salida**: 5-15 personas activas durante 6 semanas; ningún incidente de seguridad; ≥ 70 % completa el alta de cuentas; recogida y priorización de comentarios; dictamen legal escrito sobre los niveles 1-2.

**Riesgos**: los amigos introducen datos reales y esperan soporte (mitigación: expectativas claras por escrito, canal de soporte, copias); fallo de aislamiento (mitigación: la batería pgTAP + E2E de dos usuarios ya existe; revisión externa).

## Fase 3: clientes de pago (sin fecha hasta superar la puerta legal)

**Puerta de entrada**: dictamen legal favorable sobre el modelo (niveles 1-2 sin autorización) y sociedad constituida o figura fiscal decidida.

Entregables:
- Suscripciones y facturación (HU-50), condiciones y privacidad definitivas (HU-51), soporte con acceso consentido (HU-52).
- MFA obligatorio para propietarios; revisión ASVS nivel 2 completa con evidencia; prueba de penetración externa.
- Conexión PSD2 mediante agregador autorizado (HU-53) tras EIPD específica y análisis de coste.
- Plan de continuidad, SLA publicado, página de estado.
- Opcional: nivel 3 con socio autorizado (HU-54), segundo país (HU-55), módulos personales para tu espacio (HU-56).

**Criterios de salida (para escalar)**: métricas de conversión y retención fijadas al cierre de la fase 2; coste de infraestructura por usuario por debajo del precio objetivo; 0 incidentes notificables.

**Riesgos**: regulatorio (el principal; ver capítulo 12); responsabilidad por errores de cálculo (condiciones + tests + explicabilidad); escalar el soporte.

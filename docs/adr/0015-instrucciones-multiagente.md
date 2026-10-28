# ADR-0015: Instrucciones y skills agnósticas del agente

- Estado: Propuesto
- Fecha: 2026-10-26

## Contexto
El proyecto debe poder desarrollarse con cualquier agente de programación (Codex, OpenCode, Antigravity, Gemini CLI, Cursor, Copilot, Claude Code, Aider…) y con personas, sin depender de uno.

## Hallazgos (fuentes de terceros; verificar en cada herramienta)
- `AGENTS.md` lo leen Codex, Cursor y Copilot; la lista oficial indica compatibilidad con más de 20 herramientas ([compatibilidad](https://www.mintlify.com/agentsmd/agents.md/compatibility/overview)). Antigravity lista `AGENTS.md`, `GEMINI.md` y `.agents/rules/` como reglas de workspace ([documentación](https://antigravity.google/docs/rules/)). Gemini CLI lee `GEMINI.md` por defecto y `AGENTS.md` con `context.fileName` en `settings.json`. Claude Code no lee `AGENTS.md` de forma nativa: se importa con `@AGENTS.md` desde `CLAUDE.md`.
- Skills: formato abierto `SKILL.md`. OpenCode lee `.opencode/skills`, `.claude/skills` y `.agents/skills` ([documentación](https://opencode.ai/docs/skills/)); Codex lee `.agents/skills`; Gemini CLI `.gemini/skills` con alias a `.agents/skills`; Cursor `.cursor/skills` o `.agents/skills`; Copilot `.github/skills`; Claude Code `.claude/skills`. Para Antigravity las fuentes discrepan (`.agents/skills` según Google AI for Developers; `.agent/skills` según su codelab).

## Decisión
1. **`AGENTS.md` es la única fuente** de instrucciones. `CLAUDE.md` (`@AGENTS.md`), `GEMINI.md` (puntero), `.gemini/settings.json` y `.aider.conf.yml` solo apuntan a él.
2. **Skills en `.agents/skills/`** (fuente única). `scripts/sync-agent-files.mjs` las replica a `.claude/skills`, `.github/skills` y `.agent/skills`, valida `name` y `description` y falla en CI si hay deriva (`pnpm agents:check`).
3. **Entorno agnóstico:** `scripts/setup-env.sh` instala dependencias y pgTAP; el *hook* de Claude Code es un envoltorio de una línea.
4. Ninguna regla ni skill menciona comandos propios de una herramienta.

## Consecuencias
- (+) Un cambio en las reglas o en una skill se hace una vez y vale para todos.
- (−) Réplicas generadas en el repositorio (más archivos); si una herramienta cambia su ruta, se añade a `targets` del script.
- A verificar: la ruta de skills de Antigravity y si Gemini CLI/Antigravity cargan `AGENTS.md` sin configuración adicional.

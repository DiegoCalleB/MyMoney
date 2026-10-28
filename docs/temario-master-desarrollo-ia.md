# Temario – Máster en Desarrollo con IA (E.3 · The Big School)

Referencia de dominio para el desarrollo de **MyMoney**. *(troncal)* = obligatorio, *(optativa)* = opcional. Se omiten cuestionarios, encuestas de feedback y lecciones de "Conclusiones" (existen en casi todos los módulos). Cada bloque tiene además directos opcionales (3 ediciones).

---

## Bienvenida

- **Hola mundo** *(troncal)*: bienvenida, campus, dudas, calendario, comunidad, certificaciones, Fundae, conclusiones.
- **Directos de bienvenida** *(optativa)*.

## Introducción

- **Mentalidad y metodología de estudio** *(troncal)*: cómo estudiar desarrollo, técnicas de estudio, documentación y gestión del conocimiento, hábitos sostenibles.
- **IA en el proceso de aprendizaje** *(troncal)*: IA como tutor, modo estudio (ChatGPT/Gemini), NotebookLM, uso responsable.
- **IA en el proceso de desarrollo** *(troncal)*: filosofía de uso, GitHub Copilot, Warp, herramientas por fase, uso responsable.

## Fundamentos del desarrollo de software (módulo 0, todo optativo)

- **Pensamiento computacional y resolución de problemas**: fundamentos, metodologías, ejercicios.
- **Ecosistema del desarrollo moderno**: terminal y línea de comandos, Git y GitHub, IDE.
- **Fundamentos de la programación**: sintaxis, variables/tipos/operadores, estructuras de control, estructuras de datos, funciones, errores y excepciones.
- **Fundamentos de sistemas y redes**: computación, redes, APIs y comunicación, gestión de datos.
- **Introducción a los lenguajes**: bases, POO, funcional, asincronía, entornos y dependencias, modularidad.
- **Buenas prácticas**: estilo de código, depuración (debugging y logging), testing, deuda técnica y refactorización, ética.
- **Proyecto práctico inicial**: aplicación integradora.

## Ingeniería de software

- **Ciclo de vida del desarrollo** *(troncal)*: modelos de ciclo de vida.
- **Análisis de requisitos** *(troncal)*: tipologías, métodos de obtención, documentación y especificación, UML, validación y verificación.
- **Spec Driven Development** *(troncal)*: introducción a SDD, ejemplo práctico, práctica de requerimientos (QuickReserve) y solución.
- **Paradigmas de programación** *(troncal)*: estructurado/imperativo, orientado a objetos, funcional, multiparadigma, otros.
- **Buenas prácticas y principios de diseño** *(troncal)*: SOLID (SRP, OCP, LSP, ISP, DIP), DRY/KISS/YAGNI, problemas de la POO, patrones de diseño y alternativas en lenguajes multiparadigma, antipatrones.

## Arquitectura de software

- **Introducción a la arquitectura** *(troncal)*: decisiones arquitectónicas clave; estilos: monolito modular, microservicios, hexagonal (Ports & Adapters), Clean Architecture, Event-Driven; IA para comparar estilos; práctica de proponer arquitectura.
- **Aplicando Clean Architecture con TypeScript** *(troncal)*: estructura mínima, principios clave, carpetas, dominio (entidades y value objects), casos de uso, puertos y adaptadores, composición e inversión de dependencias, implementación paso a paso, testing.
- **Arquitecturas distribuidas y comunicación entre servicios** *(troncal)*: arquitectura distribuida, mitos de microservicios, monolitos modulares, comunicación síncrona/asíncrona, Event Driven Architecture, diseño de flujos de eventos, eventos en Node.js + TypeScript, patrón Outbox, de monolito modular a distribuido, IA para diseñar arquitecturas.

## Fundamentos de la IA

- **Introducción a la IA** *(troncal)*: conceptos, datos y datasets (dato sintético), transferencia, GPUs/infra cloud.
- **IA generativa** *(troncal)*: copilotos, LLMs, librerías y transformers, prácticas con Hugging Face, Google AI Studio, GitHub Models.
- **Prompting y multimodalidad** *(troncal)*: cómo escribir prompts, multimodalidad, práctica con AI Studio y Whisper.
- **AI Frameworks** *(troncal)*: RAG, fine-tuning, LangChain/LlamaIndex, buenas prácticas en asistentes.
- **Estado del arte** *(troncal)*: modelos razonadores, chain-of-thought, test-time compute, AI agents.
- **IA responsable** *(troncal)*: explicabilidad, ética, privacidad, aspectos legales y regulatorios.

## Herramientas

- **Filosofía de uso de herramientas** *(troncal)*.
- **IDEs: VS Code + Copilot avanzado** *(troncal)*: setup, Copilot inline vs chat, tests con IA, GitHub Pull Requests, productividad, guardrails de calidad, Codex en VS Code.
- **Otros IDEs** *(optativa)*: Cursor (incl. 3.0 multiagente), JetBrains (Copilot, AI Assistant, Junie, refactors, inspections/SSR), Antigravity (multiagente, MCPs), Air.
- **Copilot dentro de GitHub** *(troncal)*: PR summaries y code review, Code Scanning + Dependabot, issues/discussions/coding agent, GitHub Loops, Marketplace.
- **IAs desde CLI** *(optativa)*: Claude Code CLI (+ IDEs y custom prompts), Gemini CLI, Copilot CLI.
- **Diseño visual asistido por IA** *(optativa)*: Figma + plugins IA, Uizard, Stitch.
- **MVP con IA** *(troncal)*: qué es un MVP, v0, Lovable.
- **Automatización: n8n** *(optativa)*: primer flujo, webhooks, n8n + IA, scraping, automatización de flujos de desarrollo, gestión de contenido, self-hosting.
- **Codex** *(troncal)*.
- **Modelos de IA locales** *(optativa)*: Ollama, LM Studio, Continue.dev.
- **Warp** *(troncal)*: funciones IA, workflows, Warp Code.
- **Revisión de código con IA: CodeRabbit** *(troncal)*: primer PR, reportes, IDE, CLI.
- **OpenClaw: tu asistente 24/7** *(optativa)*: instalación, agentes y Telegram, skills, IA local (Gemma 4 + Ollama).

## Flujo de desarrollo con IA

- **La IA como parte del stack** *(troncal)*: evolución del stack, tipos de IA, flujos híbridos IA + dev, entornos de ejecución, **modo Plan vs modo Build**, ventajas y riesgos por fase.
- **Prompt engineering para developers** *(troncal)*: principios, estructuras para depuración/generación/optimización, prompt chaining, roles, taller con Codex (to-do app).
- **Reglas, bases de conocimiento y documentación** *(troncal)*: base de conocimiento para IA, carpeta Context, **AGENTS.md**, **skills**, subagentes y delegación, **MCP**, MCP con n8n, talleres Mini Pokédex y **gestor de finanzas**.
- **Integración de APIs y plataformas IA** *(troncal)*: OpenAI (texto, imágenes/visión, audio), ElevenLabs (TTS, diálogos, efectos, música, agentes de voz), Vercel AI SDK, API de n8n, taller de podcasts automáticos.

## Calidad

- **Testing** *(troncal)*: mapa de pruebas front vs back, TDD con IA, integración front, E2E asistido por IA.
- **Code smells, refactor y deuda** *(troncal)*: smells en UI, refactor seguro con TDD, patrones avanzados, deuda técnica práctica.
- **Métricas, coverage y complejidad** *(troncal)*: métricas mínimas, coverage honesto (100/80), Playwright, quality gate con Husky.
- **Observabilidad con Sentry** *(troncal)*: testear menos vs observar más, implementación, errores y release health, performance (Web Vitals), alertas y playbook.
- **Seguridad + ENV + OWASP Top 10** *(troncal)*: variables de entorno y secretos, web security esencial, AuthN/AuthZ con tokens, OWASP aplicado.
- **Documentación con IA** *(optativa)*: docs as code, APIs y componentes, **ADR**, resúmenes ejecutivos.
- **Usabilidad** *(optativa)*: heurísticas + A11y, formularios, microcopy con IA, sensación de rapidez.
- **Primeros pasos del TFM** *(optativa)*.

## Infraestructura y Cloud

- **DevOps y CI/CD** *(troncal)*: qué es DevOps y CI/CD, plataformas, Hola Mundo con GitHub Actions.
- **Cloud computing** *(troncal)*: proveedores, IA en el cloud, infraestructura como código, costes y buenas prácticas, certificaciones.
- **Bases de datos** *(troncal)*: relacionales, no relacionales, vectoriales.
- **Contenerización** *(troncal)*: contenedores, Kubernetes, cloud-vendor, Docker Hub, Kubernetes en local, despliegue.
- **LangChain con Python** *(troncal)*: RAG, indexer, retriever, agente, frontend con Gradio, despliegue en Railway.
- **LLMOps** *(troncal)*: observabilidad de LLMs, LangSmith, evaluations.
- **Multi-Agents** *(troncal)*: Google ADK, arquitectura multi-agent, práctica.

## Seguridad

- **Introducción al desarrollo seguro** *(troncal)*: security by design/default, impacto de la IA en amenazas, MITRE ATT&CK, OWASP Top 10 2025.
- **OWASP Top 10** *(troncal)*: Broken Access Control, Cryptographic Failures, Injection, Insecure Design, Security Misconfiguration, Vulnerable/Outdated Components, Identification & Authentication Failures, Software & Data Integrity Failures, Logging & Monitoring Failures, SSRF.
- **Metodologías de desarrollo seguro** *(troncal)*: SSDLC, DevSecOps en CI/CD, Shift Left, Snyk.
- **Prácticas de codificación segura** *(troncal)*: validación y sanitización, autenticación/autorización/credenciales, seguridad en APIs, arquitectura de proyecto e infraestructura seguros.
- **Uso de la IA en el desarrollo seguro** *(troncal)*: desarrollo de app segura con IA (3 partes).

## Desarrollo potenciado por IA (proyectos)

- **Proyecto front** *(troncal)*: web ecommerce con React y Vite sólo con prompts.
- **Proyecto IA** *(troncal)*: CLI interactivo con búsquedas web en tiempo real.
- **Práctica: Desarrollo moderno con IA** *(troncal)*: IA generativa, context window, chat vs agente, evolución del contexto, memoria (Engram), skills y registry, SDD fundamentos e implementación, ecosistema.
- **Proyecto backend** *(troncal)*: API con OpenAPI, Express y PostgreSQL.
- **Proyecto mobile** *(troncal)*: app desde el prototipo al consumo de APIs.

## Bonus: productividad, desarrollo profesional y estrategia (optativa)

Productividad y metodologías ágiles, soft skills, emprendimiento y freelancing, casos de uso de IA en empresa y futuro del trabajo, inglés para programadores (3 partes), comunicación/marca personal/networking.

## Masterclass (optativa)

Nvim + terminal moderna con IA · fine-tuning de un LLM · agentes con Voiceflow · tRPC (backend tipado end-to-end) · Domain-Driven Design · Docker con IA · cómo evaluar LLMs · GitHub + agentes IA (de idea a producción).

---

# Aplicación al desarrollo de MyMoney

Criterios del máster a seguir al construir la app:

| Área | Criterio |
|---|---|
| Proceso | Spec Driven Development: requisitos y specs antes del código; ADRs para decisiones; modo Plan antes de Build |
| Arquitectura | Clean/Hexagonal con TypeScript: dominio puro (entidades, value objects), casos de uso, puertos y adaptadores, inversión de dependencias; monolito modular antes que microservicios |
| Diseño | SOLID, DRY/KISS/YAGNI, evitar antipatrones |
| Calidad | TDD, pirámide de tests (unit/integración/E2E con Playwright), coverage honesto, quality gate con Husky, CI en GitHub Actions |
| Observabilidad | Sentry (errores, release health, Web Vitals) |
| Seguridad | Secretos en variables de entorno, OWASP Top 10, validación/sanitización de entradas, authN/authZ correctas, Dependabot/Snyk; datos financieros = datos sensibles |
| Backend | API con OpenAPI, Express y PostgreSQL |
| IA | AGENTS.md, carpeta Context, skills, MCP; si hay funciones IA: RAG, evaluaciones y observabilidad de LLMs (LangSmith), IA responsable y privacidad |
| Infra | Contenedores con Docker, despliegue cloud, IaC, control de costes |
| UX | Heurísticas de usabilidad, A11y, formularios claros, microcopy |

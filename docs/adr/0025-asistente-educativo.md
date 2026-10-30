# ADR-0025: Asistente educativo con IA (niveles 1 y 2)

- Estado: Aceptado
- Fecha: 2026-10-30

## Contexto
La persona propietaria quiere un chatbot que le diga «cuándo es mejor hacer ciertas inversiones», por ejemplo cuándo entrar en el S&P 500, aun sabiendo que no es fiable. Elegir el momento de una operación para una persona concreta es una recomendación personalizada de inversión (nivel 3). El nivel 3 está desactivado en el producto y en la base de datos (regla 20) y exige revisión legal (MiFID II / CNMV); un aviso de «no es fiable» no cambia su naturaleza.

## Decisión
1. **Asistente educativo, no asesor.** Responde dudas y explica las cifras de la propia persona; **nunca** dice si conviene operar, esperar o entrar, ni que sea buen o mal momento, ni pronostica, ni nombra productos, entidades o ISIN. Ante «¿cuándo invertir?» dice que nadie puede saberlo y da *pistas*: factores que mirar (plazo, colchón, peso de lo que sube y baja, aguante ante caídas del 20-30 %) y preguntas que hacerse. La decisión es de la persona (regla 22).
2. **Cifras con método** (`finance-core.profileFacts`, `investPathScenarios`; regla 17-18): reparto entre disponible y activos que suben y bajan, meses de gasto cubiertos, prueba de resistencia ilustrativa (−10/−20/−30/−50 %) y comparación de aportar de golpe o poco a poco en cuatro caminos de precio inventados (sube, plano, baja y recupera, baja). Devuelven `{ value, explanation }` con los supuestos visibles; no son previsiones. El simulador se muestra en la página sin necesidad de IA.
3. **IA externa con mínimos datos.** Se llama a la API de Anthropic por HTTP desde el servidor (`ANTHROPIC_API_KEY`, nunca `NEXT_PUBLIC_`; sin SDK, regla 11). Al modelo viajan solo la conversación y cifras **agregadas y redondeadas al centenar**: sin nombres de cuentas, entidades, comercios, fechas ni movimientos. La pantalla lo dice antes de preguntar y avisa de que es una IA (transparencia, Reglamento de IA).
4. **Defensa en profundidad.** (a) Instrucciones fijas del modelo; (b) filtro de salida (`guardReply`) que descarta respuestas con recomendaciones de operar o del momento, entidades o ISIN y las sustituye por un texto fijo; (c) textos estáticos bajo `reco-copy-guard` (prefijo `assistant.`); (d) el aviso legal lo pone la web, no el modelo.
5. **Control de uso.** Conversación sin estado (máx. 12 turnos de 1500 caracteres, validada con Zod), 20 preguntas por hora y persona en memoria, tiempo máximo de 30 s y 700 tokens de respuesta. Los logs solo llevan latencia, estado y código (regla 8): nunca el texto ni importes. No se guarda la conversación.
6. **Sin migraciones.** No hay tablas nuevas; el límite de uso en memoria se sustituirá por uno persistente cuando haya varias instancias.

## Alternativas consideradas
- **Chatbot que recomiende el momento de comprar** (lo pedido literalmente): rechazado; es nivel 3 y necesita ADR propio, revisión legal y, probablemente, autorización.
- **Solo simulador, sin conversación:** más seguro, pero menos útil para entender las cifras; el simulador se mantiene además del chat.
- **Modelo local:** sin datos fuera, pero sin calidad suficiente ni infraestructura para ello.

## Consecuencias
- Hace falta configurar `ANTHROPIC_API_KEY` en el entorno; sin ella la pantalla muestra las cifras y el simulador, y avisa de que el chat no está activado.
- Cada pregunta tiene coste por uso y envía a un tercero cifras agregadas; la persona debe estar informada (lo está en pantalla).
- Los textos de nivel 2 y el filtro de salida deben pasar la revisión legal pendiente (docs/plan/07) antes de abrir la app a terceros.
- El filtro de salida es heurístico: puede dejar pasar una recomendación disfrazada o bloquear una frase inocua. Se vigilará con uso real.

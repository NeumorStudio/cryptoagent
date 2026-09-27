---
name: trading
description: Configura y lanza una misión del agente trader. Pregunta capital, objetivo y tiempo, abre el panel en directo si el usuario quiere y pone al agente a trabajar en segundo plano.
disable-model-invocation: true
allowed-tools: mcp__plugin_cryptoagent_cryptosim__mission_status, mcp__plugin_cryptoagent_cryptosim__create_mission, mcp__plugin_cryptoagent_cryptosim__start_dashboard, mcp__plugin_cryptoagent_cryptosim__stop_mission
---

Vas a preparar y lanzar una misión del agente `cryptoagent:trader`. Habla con el usuario en español. Sigue estos pasos en orden.

## 1. Comprobar el simulador

Las herramientas del servidor MCP `cryptosim` (`mission_status`, `create_mission`, `start_dashboard`) pueden estar diferidas: si no las tienes cargadas, cárgalas con ToolSearch (`+cryptosim`). Si no aparecen, explica al usuario que el plugin `cryptoagent` debe estar instalado y activado, y que después hay que abrir una sesión nueva; para aquí.

Llama a `mission_status`.

## 2. Misión activa

Si hay una misión activa, pregunta con AskUserQuestion qué quiere hacer. En la descripción de las opciones incluye el objetivo, el valor actual y el tiempo restante:
- "Continuar la misión activa": pregunta solo si quiere abrir el panel (Sí / No) y salta al paso 4.
- "Empezar una nueva": la actual se cancelará. Sigue en el paso 3 y crea la misión con `replace: true`.
- "Detenerla": pregunta con AskUserQuestion si cerrar las posiciones a mercado o dejar la cartera como está, llama a `stop_mission` con `close_positions` según la respuesta, resume el valor final y para aquí.

## 3. Configurar la misión nueva

Haz una sola llamada a AskUserQuestion con estas cuatro preguntas:

1. **Capital inicial** (header "Capital"): 100 $, 1.000 $ (Recommended), 10.000 $.
2. **Objetivo** (header "Objetivo"), expresado como ganancia sobre el capital: +2 %, +5 % (Recommended), +10 %, +25 %.
3. **Tiempo para conseguirlo** (header "Tiempo"): 1 hora, 6 horas, 24 horas (Recommended), 3 días.
4. **Panel en directo** (header "Panel"): "Sí, abrir el panel (Recommended)", con la descripción "Arranca en tu ordenador (localhost) una web para ver en directo lo que hace el agente"; o "No".

El usuario puede escribir otro valor con "Other". Interpreta respuestas libres ("500", "2.500 $", "llegar a 1.300", "+20 %", "90 minutos", "2 días"). Un objetivo en porcentaje se aplica sobre el capital; una cifra absoluta es el valor final que debe alcanzar la cartera. Si algo no tiene sentido (cantidades no positivas, objetivo igual o menor que el capital), vuelve a preguntar solo eso.

Después, en otra llamada a AskUserQuestion, pregunta por las **instrucciones para el agente** (header "Enfoque"):
- "Modo libre (Recommended)": sin instrucciones, el agente decide todo.
- "Memecoins de pump.fun": instrucciones = "Dedica parte del tiempo a investigar memecoins de pump.fun y apuesta por las que veas con más opciones."
- Con "Other" el usuario puede escribir sus propias instrucciones: pásalas tal cual, sin reescribirlas.

Crea la misión con `create_mission` (`capital_usd`, `target_usd` en valor absoluto, `duration_minutes` e `instructions` si las hay; en modo libre no lo envíes).

## 4. Panel

Solo si el usuario ha dicho que sí:
- Si tienes el navegador integrado de la app (herramientas `mcp__Claude_Browser__*`, cárgalas con ToolSearch si están diferidas), llama a `start_dashboard` y abre la URL que devuelve con `preview_start`.
- Si no, llama a `start_dashboard` con `open_in_system_browser: true`.

Si falla, díselo al usuario con el motivo y sigue: el agente puede trabajar sin panel.

## 5. Lanzar el agente

Lanza el subagente con la herramienta Agent:
- `subagent_type`: `cryptoagent:trader`
- `description`: `Misión de trading`
- `run_in_background`: `true`
- `prompt`: exactamente `Trabaja en tu misión.`

No añadas nada más al prompt: ni ideas, ni estrategias, ni contexto de esta conversación. El agente decide solo; todo lo que necesita está en su propia configuración y en el simulador.

## 6. Avisar al usuario

Resume en pocas líneas: capital, objetivo y plazo (fecha y hora de fin), las instrucciones si las hay, dónde está el panel si se abrió, y que el agente ya trabaja en segundo plano. La misión termina sola al alcanzar el objetivo o al acabarse el tiempo.

Cuando el agente termine, llama a `mission_status`. Si la misión sigue activa (el agente se detuvo antes de tiempo), díselo al usuario y ofrécele relanzarlo con el mismo prompt. Si ha terminado, resume el resultado.

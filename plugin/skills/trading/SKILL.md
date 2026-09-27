---
name: trading
description: Configura y lanza una misión del agente trader. Pregunta capital, objetivo y tiempo, abre el panel en directo si el usuario quiere y pone a trabajar en segundo plano al agente y a su revisor.
disable-model-invocation: true
allowed-tools: Agent, mcp__plugin_cryptoagent_cryptosim__mission_status, mcp__plugin_cryptoagent_cryptosim__create_mission, mcp__plugin_cryptoagent_cryptosim__start_dashboard, mcp__plugin_cryptoagent_cryptosim__stop_mission, mcp__plugin_cryptoagent_cryptosim__status_report
---

Vas a preparar y lanzar una misión del agente `cryptoagent:trader`, con su revisor `cryptoagent:reviewer` (analiza lo que hace el trader y escribe su memoria). Habla con el usuario en español. Sigue estos pasos en orden.

## 1. Comprobar el simulador

Las herramientas del servidor MCP `cryptosim` (`mission_status`, `create_mission`, `start_dashboard`) pueden estar diferidas: si no las tienes cargadas, cárgalas con ToolSearch (`+cryptosim`). Si no aparecen, díselo al usuario según el caso y para aquí:
- Si no tienes la herramienta Agent, estás en el chat normal de Claude, no en Claude Code. Explica que este plugin solo funciona en **Claude Code** (la pestaña **Code** de la app de escritorio, la terminal o las extensiones de VS Code y JetBrains), porque el simulador se ejecuta en su ordenador y el agente trabaja en segundo plano; el chat normal no puede arrancarlos. Dile que abra una sesión en la pestaña Code (sirve cualquier carpeta) y escriba `/cryptoagent:trading`.
- Si sí la tienes, estás en Claude Code pero el plugin no está cargado: que compruebe en el gestor de plugins que `cryptoagent` está instalado y activado, y que abra una sesión nueva.

Llama a `mission_status`.

## 2. Misión activa

Si hay una misión activa, pregunta con AskUserQuestion qué quiere hacer. En la descripción de las opciones incluye el objetivo, el valor actual y el tiempo restante:
- "Continuar la misión activa": pregunta solo si quiere abrir el panel (Sí / No) y salta al paso 4. En el paso 5, lanza el trader y el revisor en segundo plano (5.2 y 5.3), sin la preparación.
- "Empezar una nueva": la actual se cancelará. Sigue en el paso 3 y crea la misión con `replace: true`.
- "Detenerla": pregunta con AskUserQuestion si cerrar las posiciones a mercado o dejar la cartera como está, llama a `stop_mission` con `close_positions` según la respuesta, resume el valor final y para aquí.

## 3. Configurar la misión nueva

Haz una sola llamada a AskUserQuestion con estas cuatro preguntas:

1. **Capital inicial** (header "Capital"): 100 $, 1.000 $ (Recommended), 10.000 $.
2. **Objetivo** (header "Objetivo"), expresado como ganancia sobre el capital: +2 %, +5 % (Recommended), +10 %, +25 %.
3. **Tiempo para conseguirlo** (header "Tiempo"): 1 hora, 6 horas, 24 horas (Recommended), 3 días.
4. **Panel en directo** (header "Panel"): "Sí, abrir el panel (Recommended)", con la descripción "Arranca en tu ordenador (localhost) una web para ver en directo lo que hace el agente"; o "No".

El usuario puede escribir otro valor con "Other". Interpreta respuestas libres ("500", "2.500 $", "llegar a 1.300", "+20 %", "90 minutos", "2 días"). Un objetivo en porcentaje se aplica sobre el capital; una cifra absoluta es el valor final que debe alcanzar la cartera. Si algo no tiene sentido (cantidades no positivas, objetivo igual o menor que el capital), vuelve a preguntar solo eso.

Después, en otra llamada a AskUserQuestion, haz dos preguntas:

1. **Instrucciones para el agente** (header "Enfoque"):
   - "Modo libre (Recommended)": sin instrucciones, el agente decide todo.
   - "Memecoins de pump.fun": instrucciones = "Dedica parte del tiempo a investigar memecoins de pump.fun y apuesta por las que veas con más opciones."
   - Con "Other" el usuario puede escribir sus propias instrucciones: pásalas tal cual, sin reescribirlas.
2. **Dónde empieza el dinero** (header "Reparto"). Explica en la pregunta que en cada cadena una parte llega en su token nativo para pagar la red:
   - "Repartido": Solana 30 %, Base 25 %, BNB Chain 25 %, Binance 20 % (`{"solana":30,"base":25,"bsc":25,"binance":20}`).
   - "Todo en Solana" (`{"solana":100}`).
   - "Solo cadenas, sin Binance": Solana 40 %, Base 30 %, BNB Chain 30 % (`{"solana":40,"base":30,"bsc":30}`).
   - Con "Other" el usuario puede dar su propio reparto ("mitad Base, mitad Solana"): conviértelo a porcentajes que sumen 100.
   Marca como recomendada "Repartido" si el capital es de 100 $ o más, y "Todo en Solana" si es menor: repartido quedarían saldos de pocos dólares por sitio, y Binance exige unos 5 $ por orden.

Crea la misión con `create_mission` (`capital_usd`, `target_usd` en valor absoluto, `duration_minutes`, `allocation` con el reparto elegido e `instructions` si las hay; en modo libre no lo envíes).

## 4. Panel

Solo si el usuario ha dicho que sí:
Llama a `start_dashboard` con `open_in_system_browser: true`: el panel se abre en el navegador normal del usuario. No lo abras en el navegador integrado de la app: el agente usa ese navegador para investigar y taparía el panel.

Si falla, díselo al usuario con el motivo y sigue: el agente puede trabajar sin panel.

## 5. Lanzar los agentes

Con la herramienta Agent, en este orden:

1. **Preparación** (en primer plano, espera a que termine): `subagent_type` `cryptoagent:reviewer`, `description` `Preparar la misión`, `prompt` exactamente `Prepara la misión.` El revisor repasa las misiones anteriores y escribe un briefing para esta. Si falla, díselo al usuario en una línea y sigue: el trader puede trabajar sin briefing.
2. **Trader** (en segundo plano): `subagent_type` `cryptoagent:trader`, `description` `Misión de trading`, `run_in_background` `true`, `prompt` exactamente `Trabaja en tu misión.`
3. **Revisor durante la misión** (en segundo plano): `subagent_type` `cryptoagent:reviewer`, `description` `Revisor de la misión`, `run_in_background` `true`, `prompt` exactamente `Vigila la misión.`

No añadas nada más a los prompts: ni ideas, ni estrategias, ni contexto de esta conversación. Todo lo que necesitan está en su propia configuración y en el simulador.

## 6. Avisar al usuario

Resume en pocas líneas: capital, objetivo y plazo (fecha y hora de fin), el reparto, las instrucciones si las hay, dónde está el panel si se abrió, y que el agente ya trabaja en segundo plano con un revisor que analiza lo que hace y le prepara lo aprendido. La misión termina sola al alcanzar el objetivo o al acabarse el tiempo. Añade que puede escribir `/cryptoagent:estado` en cualquier momento para ver cómo va, también desde el móvil con Remote Control.

## 7. Mientras dura la misión

Cuando termine un **revisor** en segundo plano:
- Si su respuesta empieza por "Misión terminada:", no lo relances.
- Si no, y la misión sigue activa (compruébalo con `mission_status`), vuelve a lanzarlo igual que en el paso 5.3. No se lo cuentes al usuario más allá de una línea breve: es rutina.

Cuando termine el **trader**, llama a `status_report`:
- Si la misión sigue activa (el agente se detuvo antes de tiempo), díselo al usuario y ofrécele relanzarlo con el mismo prompt.
- Si ha terminado, resume el resultado y envía una notificación con PushNotification (`status: "proactive"`), en una línea de menos de 200 caracteres y sin formato, empezando por el resultado. Por ejemplo: "Misión #4 conseguida: 100 $ → 111,20 $ (+11,2 %) en 38 min". Si la herramienta no existe o no se envía, no pasa nada: el resumen ya está en el chat. El revisor hará la retrospectiva de la misión; si no hay ninguno trabajando en segundo plano, lánzalo como en el paso 5.3.

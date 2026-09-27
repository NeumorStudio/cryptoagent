---
name: parar
description: Detiene la misión activa del agente trader antes de que termine el plazo.
disable-model-invocation: true
allowed-tools: mcp__plugin_cryptoagent_cryptosim__mission_status, mcp__plugin_cryptoagent_cryptosim__stop_mission
---

Vas a detener la misión activa. Habla con el usuario en español.

1. Si no tienes cargadas las herramientas del servidor `cryptosim`, cárgalas con ToolSearch (`+cryptosim`). Llama a `mission_status`. Si no hay ninguna misión activa, díselo al usuario y para aquí.

2. Pregunta con AskUserQuestion qué hacer con la cartera. En la pregunta incluye el valor actual, el objetivo y el tiempo restante:
   - "Cerrar posiciones (Recommended)": vende todo a mercado al precio real, como al terminar una misión.
   - "Dejar la cartera como está": solo detiene la misión y cancela las órdenes.
   - "No detenerla": no hagas nada más.

3. Llama a `stop_mission` con `close_positions` según la respuesta.

4. Si en esta sesión hay un agente `cryptoagent:trader` trabajando en segundo plano, detenlo con TaskStop.

5. Resume en una o dos líneas el valor final y cómo quedó la misión. Recuerda que con `/cryptoagent:trading` puede empezar otra.

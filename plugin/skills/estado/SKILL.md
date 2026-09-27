---
name: estado
description: Muestra cómo va la misión del agente trader - progreso, posiciones, últimos movimientos y su última nota - y la clasificación del laboratorio si hay una tanda. Sirve también desde el móvil con Remote Control.
disable-model-invocation: true
allowed-tools: mcp__plugin_cryptoagent_cryptosim__status_report
---

Enseña al usuario cómo va la misión. Habla en español.

1. Si no tienes cargadas las herramientas del servidor `cryptosim`, cárgalas con ToolSearch (`+cryptosim`). Si no aparecen, explica que el plugin solo funciona en Claude Code con el plugin `cryptoagent` activado, y para aquí.
2. Llama a `status_report` y muestra su contenido tal cual, sin tablas ni adornos: el usuario puede estar leyéndolo en el móvil.
   Si incluye la clasificación de una tanda del laboratorio, muéstrala también: es la parte que más interesa mientras la tanda está en curso.
3. Si la misión está en curso, termina con una línea que diga que puede volver a escribir `/cryptoagent:estado` cuando quiera. Si ha terminado, recuerda que con `/cryptoagent:trading` puede empezar otra.

No añadas análisis ni opiniones propias sobre las decisiones del agente salvo que el usuario lo pida.

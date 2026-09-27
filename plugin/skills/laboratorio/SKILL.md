---
name: laboratorio
description: Lanza una tanda del laboratorio - varios agentes a la vez con la misma misión, repartidos entre grupos (control, memoria, explorador), para acumular experiencia y medir si la memoria ayuda.
disable-model-invocation: true
allowed-tools: mcp__plugin_cryptoagent_cryptosim__lab_status, mcp__plugin_cryptoagent_cryptosim__create_lab_run, mcp__plugin_cryptoagent_cryptosim__stop_lab_run, mcp__plugin_cryptoagent_cryptosim__start_dashboard
---

Vas a preparar y lanzar una tanda del laboratorio. Habla con el usuario en español. Sigue estos pasos en orden.

## 1. Comprobar el simulador

Si no tienes cargadas las herramientas del servidor `cryptosim` (`lab_status`, `create_lab_run`, `stop_lab_run`, `start_dashboard`), cárgalas con ToolSearch (`+cryptosim`). Si no aparecen:
- Sin la herramienta Agent, estás en el chat normal: explica que el plugin solo funciona en Claude Code (pestaña Code de la app, terminal o extensiones de IDE) y para aquí.
- Con ella, el plugin no está cargado: que compruebe que `cryptoagent` está instalado y activado, y que abra una sesión nueva. Para aquí.

Llama a `lab_status`.

## 2. Tanda en curso

Si la última tanda tiene `status: "active"`, solo puede haber una a la vez. Pregunta con AskUserQuestion, enseñando la clasificación actual:
- "Ver cómo va": resume la clasificación y para aquí.
- "Detenerla": pregunta si cerrar posiciones a mercado o dejarlas, llama a `stop_lab_run` con `close_positions`, detén con TaskStop los agentes `cryptoagent:lab-trader` que sigan en segundo plano en esta sesión, resume y para aquí.

## 3. Configurar la tanda

Haz una sola llamada a AskUserQuestion con estas cuatro preguntas:

1. **Agentes** (header "Agentes"): 3 (Recommended), 5, 10. En la descripción de 10 avisa de que consume mucho del plan de uso.
2. **Capital por agente** (header "Capital"): 50 $ (Recommended), 100 $, 1.000 $.
3. **Objetivo** (header "Objetivo"), ganancia sobre el capital: +5 %, +10 % (Recommended), +25 %.
4. **Tiempo** (header "Tiempo"): 15 minutos (Recommended), 30 minutos, 1 hora.

Después, en otra llamada a AskUserQuestion:

5. **Reparto entre grupos** (header "Grupos"):
   - "A partes iguales (Recommended)": control, memoria y explorador. Si no divide exacto, el sobrante va a control.
   - "Todos en control": sin memoria, para acumular experiencia pura.
   - "Todos exploradores": para descubrir tokens y estrategias nuevas.
6. **Panel en directo** (header "Panel"): "Sí, abrir el panel (Recommended)" o "No".

Interpreta respuestas libres de "Other" (por ejemplo "4 agentes", "20 minutos", "llegar a 60"). Máximo 50 agentes; si piden más de 10, recuerda el consumo y confirma.

## 4. Crear la tanda y abrir el panel

Llama a `create_lab_run` con `capital_usd`, `target_usd` (valor absoluto), `duration_minutes` y el número de agentes de cada grupo en `control`, `memoria` y `explorador`.

Si el usuario quiere el panel, llama a `start_dashboard` con `open_in_system_browser: true`. Muestra la clasificación de la tanda en directo.

## 5. Lanzar los agentes

Lanza **todos** los agentes en un mismo mensaje, con una llamada a la herramienta Agent por cada misión que devolvió `create_lab_run`:
- `subagent_type`: `cryptoagent:lab-trader`
- `description`: `Laboratorio <label>`
- `run_in_background`: `true`
- `prompt`: exactamente `Trabaja en tu misión del laboratorio: mission_id = <missionId> (<label>, grupo <group>).`

No añadas nada más al prompt: ni ideas, ni estrategias, ni contexto de esta conversación.

## 6. Avisar y cerrar

Resume en pocas líneas: número de agentes y grupos, capital, objetivo, plazo (hora de fin) y dónde está el panel. Indica que puede consultar la clasificación en cualquier momento con `/cryptoagent:estado`, también desde el móvil, y que mientras dure la tanda su agente normal (`/cryptoagent:trading`) no está disponible.

Cuando todos los agentes hayan terminado, llama a `lab_status` y resume el resultado: cuántos llegaron al objetivo, el mejor y el peor, y el resultado medio de cada grupo. Envía una notificación con PushNotification (`status: "proactive"`), en una línea de menos de 200 caracteres y sin formato, por ejemplo: "Tanda #3 terminada: 2 de 6 agentes llegaron al objetivo; mejor +14 % (explorador)". Si la herramienta no existe o no se envía, no pasa nada.

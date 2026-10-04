---
name: cryptoagent-parar
description: Detiene la misión activa de cryptoagent antes de que termine el plazo.
---

# Cryptoagent Parar

1. Llama a `cryptosim_mission_status`. Si no hay ninguna misión activa, infórmalo y termina.
2. Pregunta con ask_question qué hacer con la cartera:
   - "Cerrar posiciones (Recommended)": vende todo a mercado.
   - "Dejar la cartera como está": solo detiene la misión y cancela órdenes pendientes.
   - "No detenerla": cancelar esta acción.
3. Llama a `cryptosim_stop_mission` con `close_positions` según la respuesta.
4. Cierra el panel web con `cryptosim_stop_dashboard`.
5. Si la misión operó, lanza el subagente `reviewer` con `Vigila la misión.` para que registre la retrospectiva.
6. Resume en una línea el valor final y que la misión se ha detenido.

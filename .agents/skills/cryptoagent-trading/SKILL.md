---
name: cryptoagent-trading
description: Configura y lanza una misión del agente trader de cryptoagent (simulado o dinero real) con su revisor.
---

# Cryptoagent Trading

Vas a preparar y lanzar una misión de cryptoagent. Habla en español. Tú no operas ni escribes memoria: preparas la misión y lanzas a los subagentes.
Para preguntar al usuario, usa la herramienta ask_question siempre que haya opciones predefinidas.

## 1. Comprobar el simulador
Llama a `cryptosim_mission_status`. Si la herramienta no está disponible, verifica que el servidor MCP `cryptosim` esté activo en `~/.gemini/config/mcp_config.json`.

## 2. Misión activa
Si hay una misión activa, pregunta con ask_question si continuarla (salta al paso 5 sin crearla), empezar una nueva (la actual se cancela, crea la nueva con `replace: true`) o detenerla (`cryptosim_stop_mission`, preguntando si cerrar posiciones).

## 3. Configurar la misión nueva
Pregunta primero el modo con ask_question:
- Simulado (Recommended): dinero ficticio con precios reales. Sigue en 3A.
- Real: dinero de verdad de la cartera de la IA. Sigue en 3B.

### 3A. Misión simulada
Pregunta:
1. **Capital inicial**: 100 $, 1.000 $ (Recommended), 10.000 $.
2. **Objetivo**: +5 % (Recommended), +10 %, +25 %, o Sin objetivo (open_target: true).
3. **Tiempo**: Modo continuo (continuous: true, Recommended), 1 hora, 6 horas, 24 horas, 3 días.
4. **Panel en directo**: Sí, abrir el panel (Recommended) / No.
5. **Enfoque**: Modo libre (Recommended), Memecoins de pump.fun, o personalizadas.
6. **Reparto**: Repartido ({"solana":30,"base":25,"bsc":25,"binance":20}), Todo en Solana (si < 100 $), etc.
7. **Al objetivo**: Seguir hasta el final (close_on_target: false, Recommended) o Terminar (close_on_target: true).

Crea la misión con `cryptosim_create_mission` (`capital_usd`, `target_usd` en valor absoluto, `duration_minutes` (o `continuous: true` para modo continuo sin plazo), `allocation`, `close_on_target` e `instructions` si las hay; sin objetivo, `open_target: true` en lugar de `target_usd` y `close_on_target`).

### 3B. Misión real
1. Llama a `cryptosim_wallet_status`. Si no hay cartera o no está desbloqueada, llama a `cryptosim_start_wallet` y pide al usuario que la cree o desbloquee en la página del navegador. **Nunca pidas ni aceptes en el chat la frase de recuperación ni la contraseña.**
2. Enseña el saldo real y pregunta objetivo en %, tiempo, aprobación (manual o autónoma con límites), límites y enfoque.
3. Crea la misión con `cryptosim_create_mission` (`mode: "live"`, `target_pct`, `duration_minutes`, `approval`, `max_trade_usd`, `max_loss_pct`, `instructions`).

## 4. Panel
Si el usuario eligió abrir el panel, llama a `cryptosim_start_dashboard` con `open_in_system_browser: true`.

## 5. Lanzar los agentes
Asegúrate de que los subagentes `reviewer` y `trader` estén definidos (con `define_subagent` si no existen todavía en la sesión, con `enable_mcp_tools: true` y `enable_write_tools: false`).

1. Lanza el subagente `reviewer` con el mensaje exacto `Prepara la misión.` y espera a que termine. (Si falla, sigue: el trader puede trabajar sin briefing).
2. Lanza el subagente `trader` con el mensaje exacto `Trabaja en tu misión.` y espera a que termine.
3. Si la misión sigue activa tras una sesión del trader, vuelve a lanzarlo con el mismo mensaje.
4. Cuando la misión haya terminado, lanza el subagente `reviewer` con el mensaje exacto `Vigila la misión.` (hará la retrospectiva) y espera.
5. Llama a `cryptosim_status_report` y resume el resultado en pocas líneas.

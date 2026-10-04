# Reglas de Cryptoagent para Antigravity

Este repositorio contiene **cryptoagent**, un agente autónomo de trading cripto en simulación (y real) con datos de mercado en directo.

## Servidor MCP y Herramientas
El simulador expone sus herramientas a través del servidor MCP `cryptosim` configurado en `~/.gemini/config/mcp_config.json`.
Las herramientas principales incluyen:
- Gestión de misiones: `cryptosim_mission_status`, `cryptosim_create_mission`, `cryptosim_stop_mission`, `cryptosim_status_report`
- Panel web: `cryptosim_start_dashboard`, `cryptosim_stop_dashboard`
- Cartera real y fiscalidad: `cryptosim_start_wallet`, `cryptosim_wallet_status`, `cryptosim_export_taxes`
- Peticiones: `cryptosim_capability_requests`, `cryptosim_resolve_capability_request`

## Subagentes Autónomos
Cuando se ejecuta una misión de trading, se orquestan dos subagentes especializados utilizando `define_subagent` (con `enable_mcp_tools: true`) e `invoke_subagent`:
1. **`reviewer`**:
   - Prompt: `.agents/prompts/reviewer.md`
   - Tareas: "Prepara la misión." (briefing inicial y memoria previa) y "Vigila la misión." (retrospectiva y actualización de howtos/creencias).
2. **`trader`**:
   - Prompt: `.agents/prompts/trader.md`
   - Tarea: "Trabaja en tu misión." (opera en bucle on-chain / dex / binance hasta que la misión concluya).

## Flujo de Trabajo
Para iniciar misiones o consultar el estado, utiliza las skills disponibles en `.agents/skills/`:
- `cryptoagent-trading`
- `cryptoagent-estado`
- `cryptoagent-parar`
- `cryptoagent-panel`
- `cryptoagent-cartera`
- `cryptoagent-impuestos`
- `cryptoagent-peticiones`

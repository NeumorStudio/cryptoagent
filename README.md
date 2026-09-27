# cryptoagent

Plugin de Claude Code: un agente autónomo que opera criptomonedas **en simulación**.
El dinero es ficticio, pero los precios, la liquidez y las comisiones son reales y del momento:
Solana a través de Jupiter (incluidos los tokens de pump.fun) y Binance spot. Nunca se firma ni se envía nada real.

- **Misiones**: capital inicial, objetivo y plazo real. La misión termina sola al alcanzar el objetivo
  o al acabarse el tiempo, y entonces se venden todas las posiciones a mercado.
- **Agente libre**: decide qué investigar y qué hacer. Opcionalmente le das instrucciones por misión.
- **Memoria entre misiones**: historial objetivo de resultados y lecciones que escribe el propio agente.
- **Panel en directo** (localhost): progreso, gráfico, posiciones, órdenes, memoria y una transcripción
  de lo que hace el agente.

## Instalar

Necesitas **Node.js 22.13 o superior** (usa el SQLite integrado en Node).

En Claude Code:

```
/plugin marketplace add elneumorstudio/cryptoagent
/plugin install cryptoagent@cryptoagent
```

En la app de escritorio también: **+ → Plugins → Añadir plugin**. Después abre una sesión nueva.

## Usar

- `/cryptoagent:trading`: te pregunta capital, objetivo, tiempo, enfoque y si abrir el panel; crea la misión
  y lanza el agente en segundo plano. Si ya hay una misión activa, te deja continuarla, reemplazarla o detenerla.
- `/cryptoagent:parar`: detiene la misión activa (cerrando posiciones o no).

No inicies sesión en exchanges ni redes sociales dentro del navegador de la app: el agente lo usa.

Los datos (misiones, diario, lecciones) se guardan en la carpeta persistente del plugin
(`~/.claude/plugins/data/…`) y se conservan al actualizar.

## Actualizaciones

En marketplaces que no son de Anthropic la actualización automática viene desactivada. Para actualizar:

```
/plugin marketplace update cryptoagent
/plugin update cryptoagent@cryptoagent
```

O activa la actualización automática de este marketplace en el gestor de plugins.

## Qué se simula y cómo

| Acción | Cálculo |
|---|---|
| Swap en Solana | Cotización real de Jupiter + fee de red en SOL + renta de la cuenta del token |
| Orden de mercado en Binance | Se recorre el order book real + comisión taker + tamaño mínimo |
| Transferencia Solana ↔ Binance | Fee de red o comisión de retirada |
| Orden condicional | Se dispara cuando el precio real cruza el umbral (comprobado cada ~60 s) |
| Valoración | Precio de liquidación: cuánto se obtendría vendiéndolo todo ahora |
| Acciones hipotéticas | Solo se anotan (crear tokens, publicar…); no afectan a la cartera |

No se simulan MEV, latencia ni el impacto de tus operaciones en los demás.
El agente tiene una guía con estos detalles y las APIs de datos disponibles: [knowledge/guia-del-terreno.md](knowledge/guia-del-terreno.md).

## Estructura del repositorio

```
.claude-plugin/marketplace.json   marketplace (este repo)
plugin/                           el plugin que se instala
  .claude-plugin/plugin.json      manifiesto y versión
  .mcp.json                       servidor MCP del simulador
  agents/trader.md                el agente
  skills/trading, skills/parar    los comandos
  dist/                           servidor MCP empaquetado (generado, se sube al repo)
src/                              código fuente del simulador, el panel y el runner por API
knowledge/                        guía del terreno
```

## Desarrollo

```bash
npm install
npm run build:plugin      # regenera plugin/dist a partir de src/
npm run typecheck
```

Para probar tus cambios en tu Claude Code, añade este repositorio local como marketplace
(`/plugin marketplace add C:\ruta\a\cryptoagent`), instala el plugin y, tras cada cambio,
ejecuta `npm run build:plugin` y `/plugin update cryptoagent@cryptoagent`.

**Publicar una versión**: `npm run build:plugin`, sube `version` en `plugin/.claude-plugin/plugin.json`,
haz commit (incluido `plugin/dist/`) y push. Los usuarios reciben la versión nueva al actualizar;
mientras no cambies `version`, no ven los cambios.

### Runner por API (opcional, sin Claude Code)

El mismo agente puede ejecutarse con la API de Anthropic y un navegador propio (Playwright):

```bash
npx playwright install chromium
cp .env.example .env      # pon tu ANTHROPIC_API_KEY
npm run mission -- --capital 1000 --target 1050 --hours 24
npm run agent             # trabaja hasta que termine la misión
npm run dashboard         # panel en http://localhost:4321
npm run watcher           # vigila órdenes y misión sin agente
npm run report
```

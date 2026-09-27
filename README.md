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

Funciona solo en **Claude Code**: la pestaña **Code** de la app de escritorio, la terminal o las extensiones
de VS Code y JetBrains. En el chat normal de Claude las habilidades se cargan, pero el simulador y el agente no pueden arrancar.

En Claude Code:

```
/plugin marketplace add NeumorStudio/claude-plugins
/plugin install cryptoagent@neumorstudio
```

En la app de escritorio: **Ajustes → Plugins → Añadir marketplace** con `NeumorStudio/claude-plugins`, e instala
el plugin desde **Descubrir**. Después abre una sesión nueva.

El plugin se distribuye desde el marketplace [NeumorStudio/claude-plugins](https://github.com/NeumorStudio/claude-plugins);
este repositorio es su código fuente.

## Usar

- `/cryptoagent:trading`: te pregunta capital, objetivo, tiempo, enfoque y si abrir el panel; crea la misión
  y lanza el agente en segundo plano. Si ya hay una misión activa, te deja continuarla, reemplazarla o detenerla.
- `/cryptoagent:estado`: resumen de la misión en el chat (progreso, posiciones, últimos movimientos con su motivo
  y la última nota del agente). Pensado también para consultarlo desde el móvil con Remote Control.
- `/cryptoagent:parar`: detiene la misión activa (cerrando posiciones o no).

Al terminar una misión, Claude te avisa con una notificación; con Remote Control conectado, también en el móvil.

No inicies sesión en exchanges ni redes sociales dentro del navegador de la app: el agente lo usa.

Los datos (misiones, diario, lecciones) se guardan en `~/.cryptoagent`, fuera del plugin: se conservan al
actualizar o reinstalar, y son los mismos se instale desde la app o desde la CLI.

## Actualizaciones

En marketplaces que no son de Anthropic la actualización automática viene desactivada. Para actualizar:

```
/plugin marketplace update neumorstudio
/plugin update cryptoagent@neumorstudio
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

Para probar tus cambios, clona `NeumorStudio/claude-plugins` junto a este repositorio (`../claude-plugins`),
añádelo como marketplace local e instala el plugin. Tras cada cambio: `npm run build:plugin` (también copia el
plugin a `../claude-plugins`) y `/plugin update cryptoagent@neumorstudio`.

**Publicar una versión**: sube `version` en `plugin/.claude-plugin/plugin.json` y ejecuta `npm run build:plugin`,
que copia el plugin a `../claude-plugins` con la versión sincronizada. Haz commit y push en los dos repositorios.
Los usuarios reciben la versión nueva al actualizar; mientras no cambies `version`, no ven los cambios.

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

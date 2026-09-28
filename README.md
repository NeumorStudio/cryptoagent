# cryptoagent

Plugin de Claude Code: un agente autónomo que opera criptomonedas **en simulación**.
El dinero es ficticio, pero los precios, la liquidez y las comisiones son reales y del momento:
Solana a través de Jupiter (incluidos los tokens de pump.fun), Base y BNB Chain con un monedero tipo MetaMask (KyberSwap y ParaSwap) y Binance spot. Nunca se firma ni se envía nada real.

- **Misiones**: capital inicial, objetivo y plazo real. La misión termina sola al alcanzar el objetivo
  o al acabarse el tiempo, y entonces se venden todas las posiciones a mercado.
- **Agente libre**: decide qué investigar y qué hacer. Opcionalmente le das instrucciones por misión.
- **Memoria entre misiones, escrita por un revisor**: un segundo agente analiza lo que hace el que opera y escribe su memoria.
  Tiene tres partes: howtos (cómo se hace algo y qué errores evitar), creencias sobre el mercado cuya evidencia calcula el
  simulador con las operaciones reales, y la retrospectiva de cada misión. Antes de cada misión, el revisor le prepara un briefing;
  en misiones largas, revisa también a mitad y le avisa si hay algo importante.
- **Multicadena**: Solana, Base y BNB Chain (con un monedero tipo MetaMask) y Binance, con depósitos, retiradas y puentes
  entre ellos que tardan lo que tardarían de verdad. También puede estimar lo que costaría lanzar su propio token.
- **Peticiones**: si el agente necesita algo que no tiene (una cuenta en una red social, otro exchange, una herramienta…),
  lo anota y tú decides si se lo das.
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
- `/cryptoagent:peticiones`: lo que el agente ha pedido y no tiene; puedes aceptarlo, rechazarlo o marcarlo como hecho.

Al terminar una misión, Claude te avisa con una notificación; con Remote Control conectado, también en el móvil.

No inicies sesión en exchanges ni redes sociales dentro del navegador de la app: el agente lo usa.

Los datos (misiones, diario, lecciones) se guardan en `~/.cryptoagent`, fuera del plugin: se conservan al
actualizar o reinstalar, y son los mismos se instale desde la app o desde la CLI.

## Usar en OpenCode

También funciona en [OpenCode](https://opencode.ai) (escritorio o terminal), con el modelo que tengas seleccionado allí.
Desde este repositorio:

```bash
npm install
npm run install:opencode
```

Copia el simulador a `~/.cryptoagent/opencode`, añade el servidor MCP `cryptosim` a `~/.config/opencode/opencode.json`
(sin tocar el resto), y genera los agentes `trader` y `reviewer` (a partir de los mismos prompts) y los comandos:
`/cryptoagent-trading` (p. ej. `/cryptoagent-trading 20 40 5`), `/cryptoagent-estado`, `/cryptoagent-parar`,
`/cryptoagent-peticiones` y `/cryptoagent-panel`. Después, reinicia OpenCode.

OpenCode tiene su propia base de datos (`~/.cryptoagent/opencode-data`) y su propio panel (http://localhost:4322):
sus misiones y su memoria no se mezclan con las de Claude Code, así que puedes comparar cómo aprende con cada modelo.
Otras diferencias: en OpenCode los agentes
van uno detrás de otro (el revisor prepara, el trader trabaja y el revisor hace la retrospectiva al final, sin revisar a
mitad), no hay navegador ni aviso al terminar, y el panel no muestra la transcripción del agente (sí todo lo demás).
Tras actualizar el código, vuelve a ejecutar `npm run install:opencode`.

## Actualizaciones

En marketplaces que no son de Anthropic la actualización automática viene desactivada. Para actualizar:

```
/plugin marketplace update neumorstudio
/plugin update cryptoagent@neumorstudio
```

O activa la actualización automática de este marketplace en el gestor de plugins.

## Cartera real (en desarrollo)

`/cryptoagent:cartera` (o `/cryptoagent-cartera` en OpenCode) abre la página de la cartera real de la IA: una cartera **nueva**, solo para ella, en Solana, Base y BNB Chain.

- **Cómo se guarda la clave.** La página la sirve el *firmante*, un proceso aparte que escucha solo en `127.0.0.1` y es el único que descifra la clave. La frase se guarda cifrada en `~/.cryptoagent/live/wallet.enc` con tu contraseña.
- **Qué ve el modelo.** La frase de recuperación se muestra una sola vez en esa página; el modelo nunca la ve. No la pegues nunca en un chat.
- **Verla en otras carteras.** Puedes importar la frase en MetaMask (Base y BNB Chain) y en Phantom (Solana) para ver la cartera.
- **Misiones reales.** `/cryptoagent:trading` pregunta primero el modo. En **real**, el agente opera con el saldo de esa cartera, solo con swaps (Jupiter en Solana, KyberSwap en Base y BNB Chain), y tú eliges:
  - **aprobación**: apruebas cada operación en la página de la cartera, o autónomo;
  - **límites**: máximo por operación y pérdida máxima. Por debajo de la pérdida máxima, solo puede vender a estables.
- **Qué comprueba el firmante antes de firmar.** Cada transacción:
  - solo puede ir a Jupiter o al router de KyberSwap, y siempre de vuelta a la propia cartera;
  - los approves son por la cantidad exacta;
  - se simula antes de enviarla.

  No existe ninguna forma de enviar fondos a otra dirección. El botón **Parar todo** de la página lo bloquea al instante.
- **Qué falta todavía.** Los puentes entre cadenas con dinero real llegarán en una próxima versión.

## Qué se simula y cómo

| Acción | Cálculo |
|---|---|
| Swap en Solana | Cotización real de Jupiter + fee de red en SOL + renta de la cuenta del token |
| Swap en Base o BNB Chain | Cotización real de KyberSwap (o ParaSwap) + gas real en ETH o BNB + approve la primera vez que se vende un token + impuestos del token (GoPlus): si superan el slippage, revierte y se pierde el gas |
| Orden de mercado en Binance | Se recorre el order book real + comisión taker + tamaño mínimo |
| Depósito o retirada de Binance | Por la red de cada cadena: gas al depositar, comisión y mínimo reales de Binance al retirar; llega en 1-3 min |
| Puente entre cadenas | Cotización real de Li.Fi (coste, gas y duración); si se agota su cupo gratuito, una estimación |
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
  agents/trader.md                el agente que opera
  agents/reviewer.md              el revisor: escribe la memoria y prepara cada misión
  skills/                         los comandos (trading, estado, parar, peticiones)
  dist/                           servidor MCP empaquetado (generado, se sube al repo)
src/                              código fuente del simulador, el panel y el runner por API
knowledge/                        guía del terreno
```

## Desarrollo

```bash
npm install
npm run build:plugin      # regenera plugin/dist a partir de src/
npm run typecheck
npm test                  # tests (cada archivo usa una base de datos temporal)
npx tsx scripts/migrate-dry.ts   # prueba las migraciones sobre una copia de ~/.cryptoagent/sim.db
npx tsx scripts/smoke.ts         # recorrido contra las APIs reales en una base de datos temporal
```

Los cambios de esquema van en `src/migrations.ts`, como un paso nuevo al final de la lista. Antes de migrar una
base de datos con datos se guarda una copia en `~/.cryptoagent/backups`.

Los prompts de los agentes están solo en `plugin/agents/`. El runner por API los lee de ahí y quita las líneas
marcadas con `<!-- solo-plugin -->`.

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

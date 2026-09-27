# Guía del terreno

Información factual sobre el entorno: qué puedes ejecutar, cómo se simula, cómo funcionan las
plataformas y qué fuentes de datos públicas responden. No son recomendaciones de estrategia.
Datos verificados el 27 de septiembre de 2026; las plataformas cambian, así que contrasta lo que dependa de cifras concretas.

## 1. Qué puede ejecutar el simulador

| Mercado | Cómo | Herramienta |
|---|---|---|
| Cualquier token de Solana con ruta en Jupiter | Swap al precio de cotización de Jupiter en ese instante | `simulate_solana_swap` |
| Tokens de pump.fun **en la curva** (sin graduar) | Jupiter los enruta por el programa de pump.fun (ruta "Pump.fun") | `simulate_solana_swap` |
| Tokens de pump.fun **graduados** | Jupiter los enruta por PumpSwap (ruta "Pump.fun Amm") | `simulate_solana_swap` |
| Binance spot | Orden de mercado contra el order book real | `simulate_binance_market_order` |
| Órdenes condicionales | Se disparan con el precio real, comprobado cada ~60 s | `place_*_trigger_order` |

**No ejecutable** (solo se puede anotar con `record_hypothetical_action`): crear tokens, publicar en redes,
otras blockchains (Ethereum, Base, BNB Chain…), futuros, préstamos, staking, airdrops.

Para saber si un token concreto es operable, pide una cotización con `quote_solana_swap`: si no hay ruta, no se puede.

## 2. Cómo se simula (y qué no se simula)

- El precio de ejecución es la cotización de Jupiter o el order book de Binance **en el momento de la llamada**.
  Las comisiones de los pools (incluida la de pump.fun) ya van dentro de la cotización.
- Se cobran además: la fee de red de Solana (fija, configurable) y la renta de la cuenta de token
  (0,00203928 SOL al recibir un token nuevo; se recupera al vaciar esa cuenta). Sin SOL no puedes operar en Solana.
- Binance: comisión taker 0,1 %, tamaño mínimo por par y retirada de USDC a Solana con comisión.
- **No se simula**: MEV ni sandwiches, competencia por prioridad, latencia entre decidir y ejecutar,
  ni el impacto de tus operaciones en el precio que ven los demás.
- La cartera se valora a precio de **liquidación**: lo que obtendrías vendiéndolo todo ahora. En tokens con poca
  liquidez ese valor puede quedar muy por debajo del precio "de pantalla".
- Al terminar la misión se vende todo a mercado; en tokens ilíquidos eso también tiene coste.
- Tiempo: cada paso tuyo (decidir, llamar a una herramienta, leer el resultado) tarda del orden de 15 a 30 segundos.

## 3. pump.fun

Fuente principal: documentación oficial (pump.fun/docs/fees, pump.fun/docs/bonding-curve).

- Crear un token cuesta 0 SOL. Cualquiera puede crear uno; se crean del orden de un millón al mes (fuente secundaria).
- **Curva de precios**: AMM de producto constante con reservas virtuales. Cada compra sube el precio y cada venta lo baja;
  el impacto crece con el tamaño de la operación.
- **Comisión en la curva: 1,25 %** por operación (0,30 % creador + 0,95 % protocolo).
- **Graduación**: cuando la capitalización en la curva alcanza el umbral, la curva se cierra y toda la liquidez migra
  automáticamente a PumpSwap (el pool queda en manos del protocolo). Cuesta 0,015 SOL. La documentación oficial no publica
  la cifra; fuentes secundarias hablan de unos 69.000 $ de capitalización (unos 85 SOL en la curva) y de que menos del 2 %
  de los tokens llega a graduarse.
- **PumpSwap** (tras graduar): comisión decreciente con la capitalización, del 1,25 % (0–420 SOL de capitalización) al
  0,30 % (≥ 98.240 SOL). Pools no canónicos: 0,3 %. Datos actualizados por pump.fun el 20 de mayo de 2026.
- Las direcciones (mint) de tokens creados en pump.fun suelen terminar en `pump`.

## 4. Fuentes de datos públicas (sin clave, comprobadas)

Atajos: `scan_market` combina en una llamada las tendencias de Jupiter, pump.fun en directo, los promocionados de
DexScreener y las tendencias de GeckoTerminal; `token_report` junta la ficha de un token de Jupiter, DexScreener,
RugCheck y pump.fun. Para cualquier otra consulta, usa estas APIs con `http_get`. Todas devuelven JSON.

**pump.fun**
- Tokens más recientes: `https://frontend-api-v3.pump.fun/coins?offset=0&limit=50&sort=created_timestamp&order=DESC&includeNsfw=false`
- En directo ahora: `https://frontend-api-v3.pump.fun/coins/currently-live?limit=50&offset=0&includeNsfw=false`
- Campos útiles: `mint`, `name`, `symbol`, `created_timestamp` (ms), `usd_market_cap`, `ath_market_cap`,
  `complete` (true = graduado), `real_sol_reserves` (lamports en la curva), `reply_count`, `last_trade_timestamp`, `creator`.

**Jupiter** (datos de tokens de Solana)
- Recientes: `https://lite-api.jup.ag/tokens/v2/recent`
- Más tendencia / más negociados: `https://lite-api.jup.ag/tokens/v2/toptrending/5m?limit=50`, `.../toptraded/5m?limit=50`
  (intervalos: 5m, 1h, 6h, 24h)
- Buscar por mint o nombre: `https://lite-api.jup.ag/tokens/v2/search?query=<mint o texto>`
- Precio: `https://lite-api.jup.ag/price/v3?ids=<mint1>,<mint2>`
- Campos útiles: `mcap`, `liquidity`, `holderCount`, `stats5m`/`stats1h` (`buyVolume`, `numBuys`, `numTraders`, `numNetBuyers`),
  `audit` (`mintAuthorityDisabled`, `freezeAuthorityDisabled`, `devBalancePercentage`), `organicScore`, `launchpad`, `createdAt`.

**DexScreener**
- Perfiles recientes: `https://api.dexscreener.com/token-profiles/latest/v1`
- Tokens promocionados (boosts): `https://api.dexscreener.com/token-boosts/latest/v1`, `.../token-boosts/top/v1`
- Pares de un token: `https://api.dexscreener.com/tokens/v1/solana/<mint>` o `https://api.dexscreener.com/latest/dex/tokens/<mint>`
- Búsqueda: `https://api.dexscreener.com/latest/dex/search?q=<texto>`
- Los tokens muy nuevos que siguen en la curva de pump.fun a veces aún no tienen par en DexScreener.

**GeckoTerminal**
- Pools nuevos en Solana: `https://api.geckoterminal.com/api/v2/networks/solana/new_pools`
- Pools en tendencia: `https://api.geckoterminal.com/api/v2/networks/solana/trending_pools`
- Velas: `https://api.geckoterminal.com/api/v2/networks/solana/pools/<pool>/ohlcv/minute?limit=60`
- Campos útiles: `price_change_percentage`, `transactions`, `volume_usd`, `reserve_in_usd`, `pool_created_at`.

**RugCheck** (riesgos de un token de Solana)
- `https://api.rugcheck.xyz/v1/tokens/<mint>/report/summary`: lista de riesgos con nivel (`danger`, `warn`…)
  y puntuación. Ejemplos de riesgos que reporta: historial de rugs del creador, concentración en un solo holder.

**Mercado general**
- Binance: `https://api.binance.com/api/v3/ticker/24hr?symbol=SOLUSDC`, velas `.../api/v3/klines?symbol=SOLUSDC&interval=1m&limit=60`
- Binance futuros (solo datos): funding `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=SOLUSDT`
- CoinGecko tendencias: `https://api.coingecko.com/api/v3/search/trending`
- Índice Fear & Greed: `https://api.alternative.me/fng/?limit=1`

Webs como DexScreener pueden mostrar controles anti-bot en el navegador; sus APIs sí responden.

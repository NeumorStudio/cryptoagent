# Guía del terreno

Información factual sobre el entorno: qué puedes ejecutar, cómo se simula, cómo funcionan las
plataformas y qué fuentes de datos públicas responden. No son recomendaciones de estrategia.
Datos verificados el 27 de septiembre de 2026; las plataformas cambian, así que contrasta lo que dependa de cifras concretas.

## 1. Qué puede ejecutar el simulador

| Mercado | Cómo | Herramienta |
|---|---|---|
| Cualquier token de Solana con ruta en Jupiter | Swap al precio de cotización de Jupiter en ese instante | `simulate_swap` (chain: solana) |
| Tokens de pump.fun **en la curva** (sin graduar) | Jupiter los enruta por el programa de pump.fun (ruta "Pump.fun") | `simulate_swap` (chain: solana) |
| Tokens de pump.fun **graduados** | Jupiter los enruta por PumpSwap (ruta "Pump.fun Amm") | `simulate_swap` (chain: solana) |
| Cualquier token de **Base** con ruta en KyberSwap (o ParaSwap) | Swap al precio de cotización del agregador en ese instante | `simulate_swap` (chain: base) |
| Cualquier token de **BNB Chain** con ruta en KyberSwap (o ParaSwap) | Igual que en Base | `simulate_swap` (chain: bsc) |
| Binance spot | Orden de mercado contra el order book real | `simulate_binance_market_order` |
| Órdenes condicionales | Se disparan con el precio real, comprobado cada ~60 s | `place_*_trigger_order` |

**No ejecutable** (solo se puede anotar con `record_hypothetical_action`): crear tokens, publicar en redes,
otras blockchains (Ethereum, Arbitrum…), futuros, préstamos, staking, airdrops. Si necesitas algo que no
tienes para intentarlo, pídelo con `request_capability`.

Para saber si un token concreto es operable, pide una cotización con `quote_swap` en su cadena: si no hay ruta, no se puede.

Tus monederos: uno en Solana y uno tipo MetaMask (la misma dirección en Base y en BNB Chain, cada cadena con
sus propios saldos), más tu cuenta de Binance. El reparto inicial del capital lo elige el usuario en cada misión.
Por ahora solo puedes mover dinero entre Solana y Binance (`simulate_transfer`); entre Base, BNB Chain y el
resto, no (no hay puentes todavía).

## 2. Cómo se simula (y qué no se simula)

- El precio de ejecución es la cotización de Jupiter o el order book de Binance **en el momento de la llamada**.
  Las comisiones de los pools (incluida la de pump.fun) ya van dentro de la cotización.
- Se cobran además: la fee de red de Solana (fija, configurable) y la renta de la cuenta de token
  (0,00203928 SOL al recibir un token nuevo; se recupera al vaciar esa cuenta). Sin SOL no puedes operar en Solana.
- Base y BNB Chain (EVM), como en MetaMask:
  - El gas se paga en el nativo (ETH en Base, BNB en BNB Chain), con el gas estimado por el agregador y el precio
    del gas real; en Base se suma la pequeña fee de L1. Sin nativo no puedes operar en esa cadena
    ("insufficient funds for gas * price + value").
  - La primera vez que vendes un token hay que aprobar al router (approve): es otra transacción con su gas.
  - Impuestos de compra y venta del token (datos de GoPlus): recibes menos de lo cotizado. Si el impuesto supera
    tu slippage, **el swap revierte y pierdes el gas**. Con tokens con impuesto, sube el slippage.
  - Un token marcado como honeypot no se puede vender: el swap revierte (pagas el gas) y en tu cartera vale 0.
  - Si GoPlus no conoce el impuesto de un token, la cotización lo avisa: podría tenerlo.
- Binance: comisión taker 0,1 %, tamaño mínimo por par (unos 5 $) y retirada de USDC o SOL a Solana con comisión.
- Al transferir un token entre Solana y Binance (`simulate_transfer`), su coste viaja con él: el resultado se mide al venderlo en el destino.
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

Atajos: `scan_market` combina en una llamada, para la cadena que indiques, las fuentes de candidatos (en Solana:
tendencias de Jupiter, pump.fun en directo, promocionados de DexScreener y tendencias de GeckoTerminal; en Base y
BNB Chain: tendencias y pools nuevos de GeckoTerminal y promocionados de DexScreener); `token_report` junta la ficha
de un token (en Solana: Jupiter, DexScreener, RugCheck y pump.fun; en Base y BNB Chain: DexScreener y la seguridad
de GoPlus). Para cualquier otra consulta, usa estas APIs con `http_get`. Todas devuelven JSON.

**Base y BNB Chain**
- Seguridad de un token (honeypot, impuestos, holders): `https://api.gopluslabs.io/api/v1/token_security/<8453 en Base | 56 en BNB Chain>?contract_addresses=<dirección>`
  (una dirección por consulta; los impuestos vienen en tanto por uno, y vacíos si no se conocen).
- Pares y precios: `https://api.dexscreener.com/tokens/v1/<base|bsc>/<dirección>`.
- Tendencias y pools nuevos: `https://api.geckoterminal.com/api/v2/networks/<base|bsc>/trending_pools` y `.../new_pools`.

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

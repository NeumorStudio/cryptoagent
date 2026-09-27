// Cuánto costaría lanzar un token propio, con precios y gas del momento. Crear el token no se simula
// (su mercado depende de otras personas): el agente lo anota con record_hypothetical_action, y con esta
// estimación sabe qué parte de su capital tendría que dedicar.
import { config } from "../config.js";
import * as evm from "../market/evm.js";
import type { ChainId } from "./types.js";
import { getChain } from "./venues/index.js";

// Gas aproximado de contratos estándar (un ERC-20 sencillo y un par de un DEX tipo Uniswap V2 con su
// primera liquidez). Cada contrato concreto gasta algo distinto: es una referencia, no una cifra exacta.
const DEPLOY_ERC20_GAS = 1_200_000n;
const CREATE_POOL_GAS = 3_000_000n;
/** Comisión de la curva de pump.fun en cada compra, incluida la primera del creador. */
const PUMPFUN_FEE = 0.0125;

export async function estimateTokenLaunch(a: { chain: ChainId; initialLiquidityUsd?: number }) {
  const chain = getChain(a.chain);
  const nativeUsd = (await chain.priceUsd([chain.native.address]))[chain.native.address];
  if (!nativeUsd) throw new Error(`Sin precio de ${chain.native.symbol}`);
  const usd = (native: number) => Number((native * nativeUsd).toFixed(4));
  const liquidity = a.initialLiquidityUsd ?? 0;

  if (a.chain === "solana") {
    const fee = config.solanaTxFeeSol;
    return {
      chain: chain.label,
      platform: "pump.fun (curva de precios; se gradúa a PumpSwap al llegar a su umbral)",
      steps: [
        { step: "crear el token en pump.fun", costNative: `0 SOL de comisión + ${fee} SOL de red`, costUsd: usd(fee) },
        ...(liquidity
          ? [{ step: `primera compra del creador (${liquidity} $)`, costNative: "-", costUsd: Number((liquidity * PUMPFUN_FEE).toFixed(4)), note: "comisión del 1,25 % de la curva; el resto sigue siendo tuyo en tokens" }]
          : []),
      ],
      capitalCommittedUsd: liquidity,
      notes: [
        "En pump.fun no hace falta poner liquidez: la curva la pone la plataforma. La primera compra es opcional.",
        "No se incluye la renta de las cuentas del token (pump.fun no la publica).",
        "Se gradúa (y paga 0,015 SOL) al llegar al umbral de la curva: según fuentes secundarias, menos del 2 % de los tokens lo consigue.",
      ],
    };
  }

  const gasPrice = await evm.gasPriceWei(a.chain as evm.EvmChainId);
  const native = (gas: bigint) => Number(gas * gasPrice) / 1e18;
  const deploy = native(DEPLOY_ERC20_GAS);
  const pool = native(CREATE_POOL_GAS);
  return {
    chain: chain.label,
    platform: "contrato ERC-20 propio + pool en un DEX",
    gasPriceGwei: Number(gasPrice) / 1e9,
    steps: [
      { step: "desplegar el contrato del token", gasUnits: Number(DEPLOY_ERC20_GAS), costNative: `${deploy.toPrecision(3)} ${chain.native.symbol}`, costUsd: usd(deploy) },
      { step: "crear el pool y añadir la primera liquidez", gasUnits: Number(CREATE_POOL_GAS), costNative: `${pool.toPrecision(3)} ${chain.native.symbol}`, costUsd: usd(pool) },
    ],
    totalGasUsd: usd(deploy + pool),
    capitalCommittedUsd: liquidity,
    notes: [
      "El gas es el de contratos estándar con el precio del gas de ahora; un contrato con más funciones cuesta más.",
      liquidity
        ? `La liquidez (${liquidity} $, mitad en tu token y mitad en ${chain.native.symbol} o una stablecoin) no es un coste, pero queda en el pool y cualquiera puede comprarte o venderte contra ella.`
        : "Sin liquidez inicial nadie puede comprar el token: indica initial_liquidity_usd para estimarla.",
    ],
  };
}

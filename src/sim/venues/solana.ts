// Solana: monedero propio, swaps con Jupiter (agregador de DEX de mainnet).
import { config } from "../../config.js";
import * as binance from "../../market/binance.js";
import { fetchJson, isNoRouteError } from "../../market/http.js";
import { SOL_MINT, USDC_MINT, fromBaseUnits, getQuote, getTokenInfo, resolveMint, toBaseUnits } from "../../market/jupiter.js";
import * as research from "../../market/research.js";
import type { Features } from "../types.js";
import type { ChainAdapter, CostLine, Settlement, SwapQuote, TokenRef, WalletView } from "./types.js";

// Renta de una cuenta de token (ATA): se paga al recibir un token nuevo
// y se recupera al cerrar la cuenta cuando el saldo vuelve a cero.
export const TOKEN_ACCOUNT_RENT_SOL = 0.00203928;
export const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const CASH = new Set([USDC_MINT, USDT_MINT]);
const DUST = 1e-12;

const SOL: TokenRef = { address: SOL_MINT, symbol: "SOL", decimals: 9 };
const USDC: TokenRef = { address: USDC_MINT, symbol: "USDC", decimals: 6 };

/** Reglas del monedero al ejecutar un swap: fee de red en SOL y renta de las cuentas de token. */
export function settleSolanaSwap(q: SwapQuote, w: WalletView): Settlement {
  const input = q.input.address;
  const output = q.output.address;
  const inBalance = w.balance(input);
  if (q.amountIn > inBalance + DUST) {
    return { ok: false, error: `Saldo insuficiente: tienes ${inBalance} ${q.input.symbol} y quieres vender ${q.amountIn}`, deltas: [], costs: [] };
  }
  const opensAccount = output !== SOL_MINT && w.balance(output) <= DUST;
  const closesAccount = input !== SOL_MINT && inBalance - q.amountIn <= DUST;
  const costs: CostLine[] = [{ kind: "network_fee", asset: SOL_MINT, symbol: "SOL", amount: config.solanaTxFeeSol }];
  if (opensAccount) costs.push({ kind: "rent", asset: SOL_MINT, symbol: "SOL", amount: TOKEN_ACCOUNT_RENT_SOL });
  if (closesAccount) costs.push({ kind: "rent_refund", asset: SOL_MINT, symbol: "SOL", amount: -TOKEN_ACCOUNT_RENT_SOL });
  const solCost = costs.reduce((s, c) => s + c.amount, 0);

  const solAfter = w.balance(SOL_MINT) - solCost - (input === SOL_MINT ? q.amountIn : 0) + (output === SOL_MINT ? q.amountOut : 0);
  if (solAfter < -DUST) {
    return {
      ok: false,
      error: `SOL insuficiente para pagar la red (${solCost.toFixed(6)} SOL de fees/renta). En Solana necesitas SOL para operar.`,
      deltas: [],
      costs: [],
    };
  }
  return {
    ok: true,
    deltas: [
      { asset: input, symbol: q.input.symbol, decimals: q.input.decimals, amount: -q.amountIn },
      { asset: output, symbol: q.output.symbol, decimals: q.output.decimals, amount: q.amountOut },
      { asset: SOL_MINT, symbol: "SOL", decimals: 9, amount: -solCost },
    ],
    costs,
    info: { networkCostSol: solCost, tokenAccountOpened: opensAccount, tokenAccountClosed: closesAccount },
  };
}

async function priceUsd(mints: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  const need = [...new Set(mints)].filter((m) => !CASH.has(m));
  for (const m of mints) if (CASH.has(m)) prices[m] = 1;
  if (need.length) {
    const data = await fetchJson<Record<string, { usdPrice?: number } | null>>(`https://lite-api.jup.ag/price/v3?ids=${need.join(",")}`);
    for (const m of need) if (typeof data[m]?.usdPrice === "number") prices[m] = data[m]!.usdPrice!;
  }
  return prices;
}

/** Datos del token en el momento de entrar (fuente: Jupiter y RugCheck). */
async function entryFeatures(mint: string): Promise<Features> {
  const [jup, rug] = await Promise.allSettled([
    fetchJson<any[]>(`https://lite-api.jup.ag/tokens/v2/search?query=${mint}`, 8000),
    fetchJson<any>(`https://api.rugcheck.xyz/v1/tokens/${mint}/report/summary`, 8000),
  ]);
  const t = jup.status === "fulfilled" ? jup.value.find((x) => x.id === mint) : undefined;
  const risks = rug.status === "fulfilled" ? (rug.value.risks ?? []) : undefined;
  const round = (v: unknown, d = 2) => (typeof v === "number" ? Number(v.toFixed(d)) : undefined);
  return {
    venue: "solana",
    ageMinutes: t?.createdAt ? Math.round((Date.now() - new Date(t.createdAt).getTime()) / 60_000) : undefined,
    liquidityUsd: round(t?.liquidity, 0),
    mcapUsd: round(t?.mcap, 0),
    priceChange5mPct: round(t?.stats5m?.priceChange),
    priceChange1hPct: round(t?.stats1h?.priceChange),
    priceChange24hPct: round(t?.stats24h?.priceChange),
    buyVolume5mUsd: round(t?.stats5m?.buyVolume, 0),
    sellVolume5mUsd: round(t?.stats5m?.sellVolume, 0),
    buySellRatio5m: t?.stats5m?.sellVolume > 0 ? round(t.stats5m.buyVolume / t.stats5m.sellVolume) : undefined,
    holders: t?.holderCount,
    topHoldersPct: round(t?.audit?.topHoldersPercentage, 1),
    netBuyers5m: t?.stats5m?.numNetBuyers,
    organicScore: round(t?.organicScore, 1),
    launchpad: t?.launchpad,
    rugcheckDangerRisks: risks ? risks.filter((r: any) => r.level === "danger").length : undefined,
    rugcheckWarnRisks: risks ? risks.filter((r: any) => r.level === "warn").length : undefined,
  };
}

export const solana: ChainAdapter = {
  kind: "chain",
  id: "solana",
  label: "Solana",
  native: SOL,
  cash: USDC,
  liquidationReserve: config.solanaTxFeeSol,
  // Entre ~0,005 SOL (la fee de muchas operaciones y la renta de dos tokens a la vez) y ~0,05 SOL.
  gasBudgetUsd: { min: 0.75, max: 7.5 },
  isCash: (asset) => CASH.has(asset),

  async resolveToken(ref) {
    const mint = resolveMint(ref.trim());
    const info = await getTokenInfo(mint);
    return { address: mint, symbol: info.symbol, decimals: info.decimals };
  },

  priceUsd,

  async triggerPrice(asset) {
    const price = (await priceUsd([asset]))[asset];
    if (typeof price !== "number") throw new Error(`Jupiter no da precio para ${asset}`);
    return price;
  },

  async quote({ input, output, amountIn, slippageBps }) {
    if (input.address === output.address) throw new Error("El token de entrada y salida son el mismo");
    const q = await getQuote(input.address, output.address, toBaseUnits(amountIn, input.decimals), slippageBps);
    const out = fromBaseUnits(q.outAmount, output.decimals);
    return {
      chain: "solana",
      input,
      output,
      amountIn,
      grossOut: out,
      amountOut: out,
      priceImpactPct: q.priceImpactPct,
      route: q.routePlan.map((r) => `${r.swapInfo.label ?? r.swapInfo.ammKey} (${r.percent}%)`),
      slippageBps,
      extra: { slot: q.contextSlot },
      warnings: [],
    };
  },

  settle: settleSolanaSwap,

  async liquidationValue(h) {
    if (CASH.has(h.asset)) return { usd: h.amount, method: "stable", reliable: true };
    if (h.asset === SOL_MINT) {
      // El SOL se valora con el libro de Binance: igual de líquido y no gasta turnos de Jupiter.
      try {
        const fill = binance.walkBook((await binance.getOrderBook("SOLUSDT")).bids, "SELL", h.amount);
        return { usd: fill.quoteQty, method: "libro Binance SOLUSDT", reliable: true };
      } catch {
        /* se intenta con Jupiter */
      }
    }
    try {
      // Valor de liquidación: cuánto USDC darían hoy vendiéndolo todo.
      const q = await getQuote(h.asset, USDC_MINT, toBaseUnits(h.amount, h.decimals), 100, 10_000);
      return { usd: fromBaseUnits(q.outAmount, 6), method: "liquidación Jupiter", reliable: true };
    } catch (err) {
      // Sin ruta de venta: no se puede cobrar, así que vale 0 (si vuelve a haber ruta, volverá a valer).
      if (isNoRouteError(err)) return { usd: 0, method: "sin ruta de venta: ahora no se puede vender", reliable: true };
      const info = await getTokenInfo(h.asset).catch(() => null);
      return { usd: (info?.usdPrice ?? 0) * h.amount, method: "precio spot (sin cotización de venta)", reliable: false };
    }
  },

  entryFeatures,

  research: {
    scan: (limit) => research.scanMarket(limit),
    report: (token) => research.tokenReport(resolveMint(token.trim())),
  },
};

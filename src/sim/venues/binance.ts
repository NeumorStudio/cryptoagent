// Binance spot: órdenes de mercado contra el libro real, comisión taker incluida.
import { config } from "../../config.js";
import * as market from "../../market/binance.js";
import { fetchJson } from "../../market/http.js";
import type { CexVenue, Delta } from "./types.js";

const CASH = new Set(["USDT", "USDC", "FDUSD"]);
const DUST = 1e-12;
/** Binance no expone decimales por activo en este modelo: se guardan con 8. */
const DECIMALS = 8;

export interface BinanceFill {
  fill: market.MarketFill;
  /** La comisión taker se descuenta del activo recibido. */
  feePaid: number;
  feeAsset: string;
  deltas: Delta[];
}

/**
 * Reglas de una orden de mercado: saldo, tamaño mínimo y comisión. Puro: recibe el par, el libro y el saldo.
 * BUY: `amount` es el quote a gastar. SELL: la cantidad base a vender.
 */
export function fillMarketOrder(args: {
  info: market.SymbolInfo;
  book: { bids: market.Level[]; asks: market.Level[] };
  side: "BUY" | "SELL";
  amount: number;
  balance: (asset: string) => number;
  takerFee: number;
}): BinanceFill {
  const { info, book, side } = args;
  let fill: market.MarketFill;
  if (side === "BUY") {
    const have = args.balance(info.quoteAsset);
    if (args.amount > have + DUST) throw new Error(`Saldo insuficiente: tienes ${have} ${info.quoteAsset} en Binance`);
    fill = market.walkBook(book.asks, "BUY", args.amount);
  } else {
    const qty = market.roundDownToStep(args.amount, info.stepSize);
    const have = args.balance(info.baseAsset);
    if (qty > have + DUST) throw new Error(`Saldo insuficiente: tienes ${have} ${info.baseAsset} en Binance`);
    if (qty <= 0) throw new Error(`Cantidad menor que el mínimo (stepSize ${info.stepSize})`);
    fill = market.walkBook(book.bids, "SELL", qty);
  }
  if (fill.quoteQty < info.minNotional) {
    throw new Error(`Orden rechazada: el importe mínimo en ${info.symbol} es ${info.minNotional} ${info.quoteAsset}`);
  }
  const d = (asset: string, amount: number): Delta => ({ asset, symbol: asset, decimals: DECIMALS, amount });
  if (side === "BUY") {
    const feePaid = fill.baseQty * args.takerFee;
    return { fill, feePaid, feeAsset: info.baseAsset, deltas: [d(info.quoteAsset, -fill.quoteQty), d(info.baseAsset, fill.baseQty - feePaid)] };
  }
  const feePaid = fill.quoteQty * args.takerFee;
  return { fill, feePaid, feeAsset: info.quoteAsset, deltas: [d(info.baseAsset, -fill.baseQty), d(info.quoteAsset, fill.quoteQty - feePaid)] };
}

export const binance: CexVenue = {
  kind: "cex",
  id: "binance",
  label: "Binance",
  isCash: (asset) => CASH.has(asset),

  async triggerPrice(symbol) {
    const data = await fetchJson<{ price: string }>(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
    return Number(data.price);
  },

  async liquidationValue(h) {
    if (CASH.has(h.asset)) return { usd: h.amount, method: "stable", reliable: true };
    for (const quoteAsset of ["USDT", "USDC"]) {
      try {
        const book = await market.getOrderBook(`${h.asset}${quoteAsset}`);
        const fill = market.walkBook(book.bids, "SELL", h.amount);
        return { usd: fill.quoteQty * (1 - config.binanceTakerFee), method: `liquidación Binance ${h.asset}${quoteAsset}`, reliable: true };
      } catch {
        /* se prueba el siguiente par */
      }
    }
    return { usd: 0, method: "sin precio", reliable: false };
  },
};

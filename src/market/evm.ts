// Datos reales de cadenas EVM (Base, BNB Chain) con APIs públicas sin clave:
// - RPC públicos: precio del gas y datos de los tokens (decimales, símbolo).
// - KyberSwap (y ParaSwap de reserva): cotizaciones de swaps con su gas estimado.
// - GoPlus: seguridad del token (honeypot, impuestos de compra y venta, holders).
// - DexScreener: precio, liquidez y actividad de los pares.
import { db } from "../db.js";
import { fetchJson, isTransientError } from "./http.js";

export type EvmChainId = "base" | "bsc";

export const NATIVE = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

export interface EvmChainInfo {
  chainId: number;
  rpc: string;
  /** RPC públicos de reserva: el principal limita pronto las peticiones (en Base, "over rate limit"). */
  fallbackRpcs: string[];
  /** Nombre de la cadena en la URL de KyberSwap, DexScreener y GeckoTerminal. */
  kyber: string;
  dexscreener: string;
  gecko: string;
}

export const EVM_CHAINS: Record<EvmChainId, EvmChainInfo> = {
  base: { chainId: 8453, rpc: "https://mainnet.base.org", fallbackRpcs: ["https://base-rpc.publicnode.com", "https://base.drpc.org"], kyber: "base", dexscreener: "base", gecko: "base" },
  bsc: { chainId: 56, rpc: "https://bsc-dataseed.binance.org", fallbackRpcs: ["https://bsc-rpc.publicnode.com"], kyber: "bsc", dexscreener: "bsc", gecko: "bsc" },
};

export const isAddress = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s);

// ─── RPC ────────────────────────────────────────────────────────────────────

export async function rpcBatch(chain: EvmChainId, calls: Array<{ method: string; params: unknown[] }>): Promise<unknown[]> {
  const body = calls.map((c, i) => ({ jsonrpc: "2.0", id: i + 1, ...c }));
  const urls = [EVM_CHAINS[chain].rpc, ...EVM_CHAINS[chain].fallbackRpcs];
  for (let i = 0; ; i++) {
    try {
      const res = await fetchJson<Array<{ id: number; result?: string; error?: { message: string } }>>(urls[i]!, { method: "POST", body, ttlMs: 10_000 });
      const byId = new Map(res.map((r) => [r.id, r]));
      return body.map((b) => {
        const r = byId.get(b.id);
        if (!r || r.error) throw new Error(`RPC de ${chain}: ${r?.error?.message ?? "sin respuesta"}`);
        return r.result;
      });
    } catch (err) {
      // Límite de peticiones o fallo de red: el siguiente RPC. Un error de la llamada (p. ej. un revert), no.
      if (i + 1 >= urls.length || !isTransientError(err)) throw err;
    }
  }
}

/** Decodifica un string ABI (o bytes32, que usan algunos tokens antiguos). */
function decodeString(hex: string): string {
  const data = hex.replace(/^0x/, "");
  if (data.length >= 128) {
    const len = parseInt(data.slice(64, 128), 16);
    return Buffer.from(data.slice(128, 128 + len * 2), "hex").toString("utf8");
  }
  return Buffer.from(data, "hex").toString("utf8").replace(/\0+$/, "");
}

export interface EvmToken {
  address: string;
  symbol: string;
  decimals: number;
}

/** Símbolo y decimales de un token (se guardan: no cambian). */
export async function tokenMeta(chain: EvmChainId, address: string): Promise<EvmToken> {
  const addr = address.toLowerCase();
  const cached = db.prepare("SELECT symbol, decimals FROM token_meta WHERE chain = ? AND address = ?").get(chain, addr) as
    | { symbol: string; decimals: number }
    | undefined;
  if (cached) return { address: addr, ...cached };
  let decimalsHex: string;
  let symbolHex: string;
  try {
    [decimalsHex, symbolHex] = (await rpcBatch(chain, [
      { method: "eth_call", params: [{ to: addr, data: "0x313ce567" }, "latest"] },
      { method: "eth_call", params: [{ to: addr, data: "0x95d89b41" }, "latest"] },
    ])) as [string, string];
  } catch {
    throw new Error(`No existe un token en ${addr} en ${chain} (o no responde como un ERC-20)`);
  }
  if (!decimalsHex || decimalsHex === "0x") throw new Error(`No existe un token en ${addr} en ${chain}`);
  const decimals = Number(BigInt(decimalsHex));
  const symbol = decodeString(symbolHex).trim() || "?";
  db.prepare("INSERT OR REPLACE INTO token_meta (chain, address, symbol, decimals) VALUES (?, ?, ?, ?)").run(chain, addr, symbol, decimals);
  return { address: addr, symbol, decimals };
}

/** Precio del gas en wei. */
export async function gasPriceWei(chain: EvmChainId): Promise<bigint> {
  const [hex] = (await rpcBatch(chain, [{ method: "eth_gasPrice", params: [] }])) as [string];
  return BigInt(hex);
}

// ─── Cotizaciones ───────────────────────────────────────────────────────────

export interface EvmQuote {
  amountOut: bigint;
  /** Gas estimado del swap (unidades) y su precio (wei). */
  gas: bigint;
  gasPriceWei: bigint;
  gasUsd: number;
  /** Coste de publicar la transacción en L1 (solo en rollups como Base), en USD. */
  l1FeeUsd: number;
  amountInUsd?: number;
  amountOutUsd?: number;
  route: string[];
  source: string;
}

async function kyberQuote(chain: EvmChainId, tokenIn: string, tokenOut: string, amountIn: bigint): Promise<EvmQuote> {
  const url =
    `https://aggregator-api.kyberswap.com/${EVM_CHAINS[chain].kyber}/api/v1/routes` +
    `?tokenIn=${tokenIn}&tokenOut=${tokenOut}&amountIn=${amountIn}&gasInclude=true`;
  const res = await fetchJson<{ code: number; message: string; data?: { routeSummary: Record<string, any> } }>(url, {
    ttlMs: 2_000,
    headers: { "x-client-id": "cryptoagent" },
  });
  const r = res.data?.routeSummary;
  if (res.code !== 0 || !r) throw new Error(`KyberSwap: ${res.message}`);
  return {
    amountOut: BigInt(r.amountOut),
    gas: BigInt(r.gas),
    gasPriceWei: BigInt(r.gasPrice),
    gasUsd: Number(r.gasUsd),
    l1FeeUsd: Number(r.l1FeeUsd ?? 0),
    amountInUsd: Number(r.amountInUsd),
    amountOutUsd: Number(r.amountOutUsd),
    route: (r.route as Array<Array<{ exchange: string }>>).flat().map((s) => s.exchange),
    source: "KyberSwap",
  };
}

async function paraswapQuote(chain: EvmChainId, tokenIn: EvmToken, tokenOut: EvmToken, amountIn: bigint): Promise<EvmQuote> {
  const url =
    `https://api.paraswap.io/prices?srcToken=${tokenIn.address}&destToken=${tokenOut.address}&amount=${amountIn}` +
    `&srcDecimals=${tokenIn.decimals}&destDecimals=${tokenOut.decimals}&side=SELL&network=${EVM_CHAINS[chain].chainId}&version=6.2`;
  const res = await fetchJson<{ priceRoute?: Record<string, any>; error?: string }>(url, { ttlMs: 2_000 });
  const r = res.priceRoute;
  if (!r) throw new Error(`ParaSwap: ${res.error ?? "sin ruta"}`);
  const gas = BigInt(r.gasCost);
  const gasPrice = await gasPriceWei(chain);
  return {
    amountOut: BigInt(r.destAmount),
    gas,
    gasPriceWei: gasPrice,
    gasUsd: Number(r.gasCostUSD),
    l1FeeUsd: 0,
    amountInUsd: Number(r.srcUSD),
    amountOutUsd: Number(r.destUSD),
    route: (r.bestRoute ?? []).flatMap((x: any) => x.swaps.flatMap((s: any) => s.swapExchanges.map((e: any) => e.exchange))),
    source: "ParaSwap",
  };
}

/** StateView de Uniswap v4: lee el estado de los pools. */
const UNISWAP_V4_STATE_VIEW: Partial<Record<EvmChainId, string>> = { base: "0xa3c0c9b65bad0b08107aa264b0f3db444b867a71" };

/**
 * Por qué no hay ruta, si es por esto: el pool de Uniswap v4 del token no tiene liquidez propia (0 fuera de
 * los swaps). Un contrato la pone y la quita dentro de sus propias operaciones, así que el pool muestra volumen
 * y liquidez en DexScreener y GeckoTerminal pero nadie más puede operar en él. Así eran los dos tokens de Base
 * sin ruta de la M24 de la v0.37.3 (en otro pool igual: 269 swaps en 100 minutos, todos de un mismo contrato).
 */
export async function emptyV4Pool(chain: EvmChainId, token: string): Promise<string | null> {
  const view = UNISWAP_V4_STATE_VIEW[chain];
  if (!view) return null;
  const pools = ((await dexPairs(chain, [token])).get(token.toLowerCase()) ?? []).filter((p) => p.dexId === "uniswap" && (p.labels ?? []).includes("v4"));
  if (!pools.length) return null;
  // getLiquidity(bytes32 poolId)
  const liquidity = (await rpcBatch(chain, pools.map((p) => ({ method: "eth_call", params: [{ to: view, data: `0xfa6793d5${p.pairAddress.slice(2)}` }, "latest"] })))) as string[];
  if (liquidity.some((l) => BigInt(l || "0x0") > 0n)) return null;
  const shown = pools.reduce((sum, p) => sum + (p.liquidity?.usd ?? 0), 0);
  const aside = shown ? `, aunque DexScreener le calcule ${Math.round(shown)} USD` : "";
  return (
    `Su pool de Uniswap v4 no tiene liquidez propia (0 fuera de los swaps${aside}): ` +
    "solo la pone un contrato dentro de sus propias operaciones, así que nadie más puede comprar ni vender en él"
  );
}

/** Cotización de un swap: KyberSwap y, si falla, ParaSwap. */
export async function quote(chain: EvmChainId, tokenIn: EvmToken, tokenOut: EvmToken, amountIn: bigint): Promise<EvmQuote> {
  try {
    return await kyberQuote(chain, tokenIn.address, tokenOut.address, amountIn);
  } catch (kyberErr) {
    try {
      return await paraswapQuote(chain, tokenIn, tokenOut, amountIn);
    } catch (paraErr) {
      let why: string | null = null;
      for (const t of [tokenOut, tokenIn]) if (!why && t.address !== NATIVE) why = await emptyV4Pool(chain, t.address).catch(() => null);
      throw new Error(`Sin ruta de swap en ${chain}: ${(kyberErr as Error).message}; ${(paraErr as Error).message}${why ? `. ${why}` : ""}`);
    }
  }
}

// ─── Seguridad (GoPlus) ─────────────────────────────────────────────────────

export interface TokenSecurity {
  /** Impuestos en %; undefined si GoPlus no los conoce. */
  buyTaxPct?: number;
  sellTaxPct?: number;
  honeypot?: boolean;
  mintable?: boolean;
  cannotSellAll?: boolean;
  holders?: number;
  topHoldersPct?: number;
  ownerCanChangeBalance?: boolean;
  raw?: Record<string, unknown>;
}

const pctOrUndefined = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : Number((Number(v) * 100).toFixed(2)));
const flag = (v: unknown) => (v === "1" ? true : v === "0" ? false : undefined);

export async function tokenSecurity(chain: EvmChainId, address: string): Promise<TokenSecurity> {
  const res = await fetchJson<{ code: number; message: string; result?: Record<string, Record<string, any>> }>(
    `https://api.gopluslabs.io/api/v1/token_security/${EVM_CHAINS[chain].chainId}?contract_addresses=${address}`,
    { ttlMs: 10 * 60_000 },
  );
  const r = res.result?.[address.toLowerCase()];
  if (!r) return {};
  const holders = (r.holders ?? []) as Array<{ percent: string }>;
  return {
    buyTaxPct: pctOrUndefined(r.buy_tax),
    sellTaxPct: pctOrUndefined(r.sell_tax),
    honeypot: flag(r.is_honeypot),
    mintable: flag(r.is_mintable),
    cannotSellAll: flag(r.cannot_sell_all),
    holders: r.holder_count ? Number(r.holder_count) : undefined,
    topHoldersPct: holders.length ? Number((holders.slice(0, 10).reduce((s, h) => s + Number(h.percent), 0) * 100).toFixed(1)) : undefined,
    ownerCanChangeBalance: flag(r.owner_change_balance),
    raw: r,
  };
}

// ─── Mercado (DexScreener) ──────────────────────────────────────────────────

export interface DexPair {
  pairAddress: string;
  dexId: string;
  /** Versión del DEX cuando la hay (p. ej. ["v4"]). */
  labels?: string[];
  url: string;
  baseToken: { address: string; symbol: string; name: string };
  quoteToken: { address: string; symbol: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  txns?: Record<string, { buys: number; sells: number }>;
  volume?: Record<string, number>;
  priceChange?: Record<string, number>;
  info?: { websites?: Array<{ url: string }>; socials?: Array<{ type: string; url: string }> };
}

/** Pares de varios tokens (hasta 30), agrupados por token, del más líquido al menos. */
export async function dexPairs(chain: EvmChainId, addresses: string[]): Promise<Map<string, DexPair[]>> {
  const out = new Map<string, DexPair[]>();
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))];
  for (let i = 0; i < unique.length; i += 30) {
    const pairs = await fetchJson<DexPair[]>(`https://api.dexscreener.com/tokens/v1/${EVM_CHAINS[chain].dexscreener}/${unique.slice(i, i + 30).join(",")}`, {
      ttlMs: 15_000,
    });
    for (const p of pairs) {
      const key = p.baseToken.address.toLowerCase();
      out.set(key, [...(out.get(key) ?? []), p]);
    }
  }
  for (const list of out.values()) list.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
  return out;
}

// Saldos reales de la cartera de la IA, leídos de la cadena (RPC públicos o el que configure el usuario).
// Solo lectura: aquí no se firma nada.
import { SOL_MINT } from "../market/jupiter.js";
import { EVM_CHAINS, NATIVE, rpcBatch, type EvmChainId } from "../market/evm.js";
import { fetchJson } from "../market/http.js";
import type { ChainId, Holding } from "../sim/types.js";
import { getVenue } from "../sim/venues/index.js";
import type { ChainAdapter } from "../sim/venues/types.js";
import type { WalletPublic } from "./keystore.js";

/** RPC de Solana. El público sirve para leer; para enviar transacciones conviene uno propio (p. ej. Helius). */
export const solanaRpcUrl = () => process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

const TOKEN_PROGRAMS = ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"];

export async function solanaRpc<T>(method: string, params: unknown[], ttlMs = 5_000): Promise<T> {
  const res = await fetchJson<{ result?: T; error?: { message: string } }>(solanaRpcUrl(), {
    method: "POST",
    body: { jsonrpc: "2.0", id: 1, method, params },
    ttlMs,
  });
  if (res.error) throw new Error(`RPC de Solana (${method}): ${res.error.message}`);
  return res.result as T;
}

async function solanaHoldings(owner: string): Promise<Holding[]> {
  const lamports = (await solanaRpc<{ value: number }>("getBalance", [owner])).value;
  const holdings: Holding[] = [{ venue: "solana", asset: SOL_MINT, symbol: "SOL", decimals: 9, amount: lamports / 1e9 }];
  for (const programId of TOKEN_PROGRAMS) {
    const { value } = await solanaRpc<{ value: Array<{ account: { data: { parsed: { info: { mint: string; tokenAmount: { amount: string; decimals: number } } } } } }> }>(
      "getTokenAccountsByOwner",
      [owner, { programId }, { encoding: "jsonParsed" }],
    );
    for (const a of value) {
      const { mint, tokenAmount } = a.account.data.parsed.info;
      const amount = Number(tokenAmount.amount) / 10 ** tokenAmount.decimals;
      if (amount <= 0) continue;
      const symbol = await (getVenue("solana") as ChainAdapter).resolveToken(mint).then((t) => t.symbol, () => `${mint.slice(0, 4)}…`);
      holdings.push({ venue: "solana", asset: mint, symbol, decimals: tokenAmount.decimals, amount });
    }
  }
  return holdings;
}

const pad32 = (addr: string) => addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");

/** Saldos EVM: el nativo, las stablecoins y los tokens que se indiquen (en EVM no se pueden listar todos). */
async function evmHoldings(chain: EvmChainId, owner: string, extraTokens: Array<{ address: string; symbol: string; decimals: number }>): Promise<Holding[]> {
  const venue = getVenue(chain) as ChainAdapter;
  const seen = new Set<string>();
  const tokens = [...venue.stables, ...extraTokens].filter((t) => {
    const a = t.address.toLowerCase();
    if (a === NATIVE || seen.has(a)) return false;
    seen.add(a);
    return true;
  });
  const results = (await rpcBatch(chain, [
    { method: "eth_getBalance", params: [owner, "latest"] },
    ...tokens.map((t) => ({ method: "eth_call", params: [{ to: t.address, data: `0x70a08231${pad32(owner)}` }, "latest"] })),
  ])) as string[];
  const holdings: Holding[] = [
    { venue: chain, asset: NATIVE, symbol: venue.native.symbol, decimals: 18, amount: Number(BigInt(results[0]!)) / 1e18 },
  ];
  tokens.forEach((t, i) => {
    const raw = results[i + 1];
    const amount = raw && raw !== "0x" ? Number(BigInt(raw)) / 10 ** t.decimals : 0;
    if (amount > 0) holdings.push({ venue: chain, asset: t.address.toLowerCase(), symbol: t.symbol, decimals: t.decimals, amount });
  });
  return holdings;
}

export interface LiveBalance extends Holding {
  usd: number;
  valuedBy: string;
}

export interface WalletBalances {
  totalUsd: number;
  byChain: Record<ChainId, number>;
  balances: LiveBalance[];
  /** Cadenas cuyo saldo no se pudo leer (el total no las incluye). */
  errors: Partial<Record<ChainId, string>>;
}

export type ExtraTokens = Partial<Record<EvmChainId, Array<{ address: string; symbol: string; decimals: number }>>>;

/** Saldos en bruto por cadena (sin valorar). Una cadena que no se pudo leer va en `errors`. */
export async function readHoldings(pub: WalletPublic, extraEvmTokens: ExtraTokens = {}) {
  const chains: ChainId[] = ["solana", ...(Object.keys(EVM_CHAINS) as EvmChainId[])];
  const settled = await Promise.allSettled(
    chains.map((c) => (c === "solana" ? solanaHoldings(pub.solana) : evmHoldings(c as EvmChainId, pub.evm, extraEvmTokens[c as EvmChainId] ?? []))),
  );
  const holdings: Holding[] = [];
  const errors: Partial<Record<ChainId, string>> = {};
  settled.forEach((r, i) => (r.status === "fulfilled" ? holdings.push(...r.value) : (errors[chains[i]!] = (r.reason as Error).message)));
  return { holdings, errors };
}

/** Saldos de la cartera en las tres cadenas, valorados a precio de liquidación como en el simulador. */
export async function walletBalances(pub: WalletPublic, extraEvmTokens: ExtraTokens = {}): Promise<WalletBalances> {
  const { holdings, errors } = await readHoldings(pub, extraEvmTokens);
  const out: WalletBalances = { totalUsd: 0, byChain: { solana: 0, base: 0, bsc: 0 }, balances: [], errors };
  const valued = await Promise.all(
    holdings.map(async (h) => ({ h, v: await getVenue(h.venue).liquidationValue(h).catch(() => ({ usd: 0, method: "sin precio" })) })),
  );
  for (const { h, v } of valued) {
    const chain = h.venue as ChainId;
    out.balances.push({ ...h, usd: Number(v.usd.toFixed(4)), valuedBy: v.method });
    out.byChain[chain] += v.usd;
    out.totalUsd += v.usd;
  }
  return out;
}

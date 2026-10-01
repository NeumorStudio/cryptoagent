// Cadenas EVM (Base, BNB Chain): un monedero tipo MetaMask, swaps con agregadores de DEX (KyberSwap,
// ParaSwap de reserva). Como en la cadena real:
// - El gas se paga en el token nativo (ETH en Base, BNB en BNB Chain). Sin nativo no se puede operar.
// - La primera vez que se vende un token hay que aprobar al router: es otra transacción con su gas.
// - Los tokens con impuesto de compra o venta dan menos de lo cotizado. Si el impuesto supera el
//   slippage permitido, el swap revierte y el gas se pierde igualmente. Un honeypot no se puede vender.
import * as binanceMarket from "../../market/binance.js";
import * as evm from "../../market/evm.js";
import { fetchJson, isNoRouteError } from "../../market/http.js";
import { fromBaseUnits, toBaseUnits } from "../../market/jupiter.js";
import type { Features } from "../types.js";
import { launchpadOf } from "../launchpads.js";
import type { ChainAdapter, CostLine, Delta, Settlement, SwapQuote, TokenRef, WalletView } from "./types.js";

const DUST = 1e-12;
/** Gas de un approve de ERC-20 (aproximado, igual en todas las cadenas). */
export const APPROVE_GAS = 46_000n;

interface EvmChainConfig {
  id: evm.EvmChainId;
  label: string;
  native: TokenRef;
  /** Par de Binance con el que se valora el nativo. */
  nativeBook: string;
  cash: TokenRef;
  stables: TokenRef[];
  /** Alias que entiende resolveToken (además de las direcciones). */
  aliases: Record<string, TokenRef>;
  liquidationReserve: number;
  gasBudgetUsd: { min: number; max: number };
}

// ─── Reglas del monedero (puras) ────────────────────────────────────────────

/** Datos del swap que necesita settle, calculados al cotizar. */
export interface EvmQuoteExtra {
  source: string;
  gasNative: number;
  l1Native: number;
  approvalGasNative: number;
  sellTaxPct?: number;
  buyTaxPct?: number;
  honeypotSell: boolean;
}

export function settleEvmSwap(q: SwapQuote, w: WalletView): Settlement {
  const x = q.extra as unknown as EvmQuoteExtra;
  const native = q.chain === "base" ? "ETH" : "BNB";
  const inBalance = w.balance(q.input.address);
  if (q.amountIn > inBalance + DUST) {
    return { ok: false, error: `Saldo insuficiente: tienes ${inBalance} ${q.input.symbol} y quieres vender ${q.amountIn}`, deltas: [], costs: [] };
  }
  const isNativeIn = q.input.address === evm.NATIVE;
  const needsApproval = !isNativeIn && !w.approved?.(q.input.address);
  const costs: CostLine[] = [{ kind: "network_fee", asset: evm.NATIVE, symbol: native, amount: x.gasNative }];
  if (x.l1Native > 0) costs.push({ kind: "l1_fee", asset: evm.NATIVE, symbol: native, amount: x.l1Native });
  if (needsApproval) costs.push({ kind: "approval", asset: evm.NATIVE, symbol: native, amount: x.approvalGasNative });
  const gasCost = costs.reduce((s, c) => s + c.amount, 0);

  const nativeBalance = w.balance(evm.NATIVE);
  const needed = gasCost + (isNativeIn ? q.amountIn : 0);
  if (nativeBalance + DUST < needed) {
    return {
      ok: false,
      error:
        `insufficient funds for gas * price + value: necesitas ${needed.toPrecision(4)} ${native} ` +
        `(${gasCost.toPrecision(3)} de gas${isNativeIn ? " más lo que envías" : ""}) y tienes ${nativeBalance.toPrecision(4)} ${native}. ` +
        `En esta cadena el gas se paga en ${native}.`,
      deltas: [],
      costs: [],
    };
  }

  const gasDelta: Delta = { asset: evm.NATIVE, symbol: native, decimals: 18, amount: -gasCost };
  const approvals = needsApproval ? [q.input.address] : [];
  // La transacción se envía y revierte: el approve (si lo hubo) queda hecho y el gas se paga igual.
  const revert = (error: string): Settlement => ({ ok: false, error, deltas: [gasDelta], costs, approvals });
  if (x.honeypotSell) return revert(`El swap revierte: ${q.input.symbol} es un honeypot (no se puede vender). Has pagado el gas igualmente.`);
  const taxLoss = q.grossOut > 0 ? 1 - q.amountOut / q.grossOut : 0;
  if (taxLoss * 10_000 > q.slippageBps + 1e-6) {
    return revert(
      `El swap revierte: los impuestos del token (${(taxLoss * 100).toFixed(1)} %) superan tu slippage (${q.slippageBps / 100} %). ` +
        "Has pagado el gas igualmente. Con un token con impuestos, el slippage tiene que cubrirlos.",
    );
  }

  if (x.sellTaxPct) costs.push({ kind: "tax_sell", asset: q.input.address, symbol: q.input.symbol, amount: q.amountIn * (x.sellTaxPct / 100) });
  if (x.buyTaxPct) {
    costs.push({ kind: "tax_buy", asset: q.output.address, symbol: q.output.symbol, amount: q.grossOut * (1 - (x.sellTaxPct ?? 0) / 100) * (x.buyTaxPct / 100) });
  }
  return {
    ok: true,
    deltas: [
      { asset: q.input.address, symbol: q.input.symbol, decimals: q.input.decimals, amount: -q.amountIn },
      { asset: q.output.address, symbol: q.output.symbol, decimals: q.output.decimals, amount: q.amountOut },
      gasDelta,
    ],
    costs,
    approvals,
    info: { gasCost: `${gasCost.toPrecision(3)} ${native}`, approvalSent: needsApproval, quotedBy: x.source },
  };
}

// ─── Adaptador ──────────────────────────────────────────────────────────────

const ageMinutes = (ms: number | undefined) => (ms ? Math.round((Date.now() - ms) / 60_000) : undefined);
const n = (v: unknown, d = 2) => (typeof v === "number" && Number.isFinite(v) ? Number(v.toFixed(d)) : undefined);

function evmAdapter(cfg: EvmChainConfig): ChainAdapter {
  const cash = new Set(cfg.stables.map((t) => t.address));
  const isCash = (a: string) => cash.has(a.toLowerCase());

  async function nativeUsd(): Promise<number> {
    const data = await fetchJson<{ price: string }>(`https://api.binance.com/api/v3/ticker/price?symbol=${cfg.nativeBook}`, { ttlMs: 10_000 });
    return Number(data.price);
  }

  async function resolveToken(ref: string): Promise<TokenRef> {
    const r = ref.trim();
    const alias = cfg.aliases[r.toUpperCase()];
    if (alias) return alias;
    if (!evm.isAddress(r)) {
      throw new Error(`En ${cfg.label} indica la dirección del token (0x…) o un alias: ${Object.keys(cfg.aliases).join(", ")}`);
    }
    if (r.toLowerCase() === evm.NATIVE) return cfg.native;
    return evm.tokenMeta(cfg.id, r);
  }

  async function priceUsd(assets: string[]): Promise<Record<string, number>> {
    const prices: Record<string, number> = {};
    const rest: string[] = [];
    for (const a of assets.map((x) => x.toLowerCase())) {
      if (isCash(a)) prices[a] = 1;
      else if (a === evm.NATIVE) prices[a] = await nativeUsd();
      else rest.push(a);
    }
    if (rest.length) {
      const pairs = await evm.dexPairs(cfg.id, rest);
      for (const a of rest) {
        const p = Number(pairs.get(a)?.[0]?.priceUsd);
        if (Number.isFinite(p) && p > 0) prices[a] = p;
      }
    }
    return prices;
  }

  /** Seguridad de un token para operar (vacía para el nativo y las stablecoins, o si GoPlus no responde). */
  const security = (a: string) => (a === evm.NATIVE || isCash(a) ? Promise.resolve({} as evm.TokenSecurity) : evm.tokenSecurity(cfg.id, a).catch(() => ({}) as evm.TokenSecurity));

  const adapter: ChainAdapter = {
    kind: "chain",
    id: cfg.id,
    label: cfg.label,
    native: cfg.native,
    cash: cfg.cash,
    stables: cfg.stables,
    liquidationReserve: cfg.liquidationReserve,
    gasBudgetUsd: cfg.gasBudgetUsd,
    isCash,
    resolveToken,
    priceUsd,

    async triggerPrice(asset) {
      const price = (await priceUsd([asset]))[asset.toLowerCase()];
      if (typeof price !== "number") throw new Error(`Sin precio para ${asset} en ${cfg.label}`);
      return price;
    },

    async quote({ input, output, amountIn, slippageBps }) {
      if (input.address === output.address) throw new Error("El token de entrada y salida son el mismo");
      const [q, secIn, secOut] = await Promise.all([
        evm.quote(cfg.id, input, output, toBaseUnits(amountIn, input.decimals)),
        security(input.address),
        security(output.address),
      ]);
      const grossOut = fromBaseUnits(q.amountOut, output.decimals);
      const gasNative = Number(q.gas * q.gasPriceWei) / 1e18;
      // El agregador da el gas en USD: de ahí sale el precio del nativo para pasar la fee de L1 a nativo.
      const nativePrice = gasNative > 0 && q.gasUsd > 0 ? q.gasUsd / gasNative : await nativeUsd();
      const warnings: string[] = [];
      const taxable = (t: TokenRef) => t.address !== evm.NATIVE && !isCash(t.address);
      if (taxable(input) && secIn.sellTaxPct === undefined) warnings.push(`No se conoce el impuesto de venta de ${input.symbol}: podría tenerlo.`);
      if (taxable(output) && secOut.buyTaxPct === undefined) warnings.push(`No se conoce el impuesto de compra de ${output.symbol}: podría tenerlo.`);
      if (secIn.sellTaxPct) warnings.push(`${input.symbol} cobra un ${secIn.sellTaxPct} % al venderlo.`);
      if (secOut.buyTaxPct) warnings.push(`${output.symbol} cobra un ${secOut.buyTaxPct} % al comprarlo.`);
      if (secOut.sellTaxPct) warnings.push(`${output.symbol} cobra un ${secOut.sellTaxPct} % al venderlo.`);
      if (secOut.honeypot) warnings.push(`GoPlus marca ${output.symbol} como honeypot: podrías no poder venderlo.`);
      if (secOut.cannotSellAll) warnings.push(`${output.symbol} no deja vender todo el saldo de una vez.`);
      const extra: EvmQuoteExtra = {
        source: q.source,
        gasNative,
        l1Native: q.l1FeeUsd / nativePrice,
        approvalGasNative: Number(APPROVE_GAS * q.gasPriceWei) / 1e18,
        sellTaxPct: secIn.sellTaxPct,
        buyTaxPct: secOut.buyTaxPct,
        honeypotSell: secIn.honeypot === true,
      };
      return {
        chain: cfg.id,
        input,
        output,
        amountIn,
        grossOut,
        amountOut: grossOut * (1 - (secIn.sellTaxPct ?? 0) / 100) * (1 - (secOut.buyTaxPct ?? 0) / 100),
        route: [`${q.source}: ${[...new Set(q.route)].join(", ")}`],
        slippageBps,
        extra: extra as unknown as Record<string, unknown>,
        warnings,
      };
    },

    settle: settleEvmSwap,

    async liquidationValue(h) {
      const asset = h.asset.toLowerCase();
      if (isCash(asset)) return { usd: h.amount, method: "stable", reliable: true };
      if (asset === evm.NATIVE) {
        try {
          const fill = binanceMarket.walkBook((await binanceMarket.getOrderBook(cfg.nativeBook)).bids, "SELL", h.amount);
          return { usd: fill.quoteQty, method: `libro Binance ${cfg.nativeBook}`, reliable: true };
        } catch {
          /* se intenta con el agregador */
        }
      }
      try {
        const sec = await security(asset);
        if (sec.honeypot) return { usd: 0, method: "honeypot: no se puede vender", reliable: true };
        const token = asset === evm.NATIVE ? cfg.native : await evm.tokenMeta(cfg.id, asset);
        const q = await evm.quote(cfg.id, token, cfg.cash, toBaseUnits(h.amount, h.decimals));
        const usd = fromBaseUnits(q.amountOut, cfg.cash.decimals) * (1 - (sec.sellTaxPct ?? 0) / 100);
        return { usd, method: `liquidación ${q.source}${sec.sellTaxPct ? ` (con ${sec.sellTaxPct} % de impuesto)` : ""}`, reliable: true };
      } catch (err) {
        // Sin ruta de venta: no se puede cobrar, así que vale 0 (si vuelve a haber ruta, volverá a valer).
        if (isNoRouteError(err)) return { usd: 0, method: "sin ruta de venta: ahora no se puede vender", reliable: true };
        const p = (await priceUsd([asset]).catch(() => ({}) as Record<string, number>))[asset];
        return { usd: (p ?? 0) * h.amount, method: "precio spot (sin cotización de venta)", reliable: false };
      }
    },

    async entryFeatures(asset): Promise<Features> {
      const [pairs, sec] = await Promise.all([evm.dexPairs(cfg.id, [asset]).catch(() => new Map<string, evm.DexPair[]>()), security(asset.toLowerCase())]);
      const top = pairs.get(asset.toLowerCase())?.[0];
      const m5 = top?.txns?.m5;
      const raw = sec.raw ?? {};
      // Liquidez bloqueada o quemada: % de los tokens LP en lockers o en direcciones muertas (GoPlus).
      const lp = (raw.lp_holders ?? []) as Array<{ address: string; percent: string; is_locked: number; tag?: string }>;
      const lpLocked = lp.length
        ? lp.filter((h) => h.is_locked === 1 || /^0x0{40}$|dead$/i.test(h.address)).reduce((s, h) => s + Number(h.percent), 0) * 100
        : undefined;
      return {
        creator: typeof raw.creator_address === "string" && raw.creator_address ? raw.creator_address.toLowerCase() : undefined,
        devHoldingPct: raw.creator_percent !== undefined && raw.creator_percent !== "" ? n(Number(raw.creator_percent) * 100, 1) : undefined,
        creatorHoneypots: raw.honeypot_with_same_creator === "1" ? true : raw.honeypot_with_same_creator === "0" ? false : undefined,
        // Con pools v4 / Infinity no hay tokens LP: el dato no significa nada.
        lpLockedPct: lpLocked !== undefined && Number(raw.lp_total_supply ?? 0) > 1e-6 ? n(Math.min(100, lpLocked), 1) : undefined,
        venue: cfg.id,
        ageMinutes: ageMinutes(top?.pairCreatedAt),
        // En EVM la edad ya es la del par principal.
        pairAgeMinutes: ageMinutes(top?.pairCreatedAt),
        liquidityUsd: n(top?.liquidity?.usd, 0),
        mcapUsd: n(top?.marketCap ?? top?.fdv, 0),
        priceChange5mPct: n(top?.priceChange?.m5),
        priceChange1hPct: n(top?.priceChange?.h1),
        priceChange24hPct: n(top?.priceChange?.h24),
        holders: sec.holders,
        topHoldersPct: sec.topHoldersPct,
        netBuyers5m: m5 ? m5.buys - m5.sells : undefined,
        buySellCountRatio5m: m5 && m5.sells > 0 ? n(m5.buys / m5.sells) : undefined,
        launchpad: launchpadOf(cfg.id, asset, top?.dexId),
        buyTaxPct: sec.buyTaxPct,
        sellTaxPct: sec.sellTaxPct,
        honeypot: sec.honeypot,
        mintable: sec.mintable,
      };
    },

    research: {
      async scan(limit) {
        const merged = new Map<string, Record<string, any>>();
        const add = (address: string | undefined, source: string, data: Record<string, unknown>) => {
          if (!address) return;
          const key = address.toLowerCase();
          const c = merged.get(key) ?? { token: key, sources: [] as string[] };
          if (!c.sources.includes(source)) c.sources.push(source);
          for (const [k, v] of Object.entries(data)) if (v !== undefined && c[k] === undefined) c[k] = v;
          merged.set(key, c);
        };
        const gecko = async (kind: "trending_pools" | "new_pools") => {
          const res = await fetchJson<{ data: any[] }>(`https://api.geckoterminal.com/api/v2/networks/${evm.EVM_CHAINS[cfg.id].gecko}/${kind}`);
          for (const p of res.data) {
            const a = p.attributes ?? {};
            const tx = a.transactions?.m5;
            add(String(p.relationships?.base_token?.data?.id ?? "").replace(/^[a-z_]+?_(0x)/, "$1"), `geckoterminal_${kind}`, {
              name: a.name,
              liquidityUsd: n(Number(a.reserve_in_usd), 0),
              priceChange5mPct: n(Number(a.price_change_percentage?.m5)),
              priceChange1hPct: n(Number(a.price_change_percentage?.h1)),
              netBuyers5m: tx ? tx.buyers - tx.sellers : undefined,
              volume1hUsd: n(Number(a.volume_usd?.h1), 0),
              ageMinutes: a.pool_created_at ? ageMinutes(new Date(a.pool_created_at).getTime()) : undefined,
            });
          }
          return res.data.length;
        };
        const boosts = async () => {
          const list = await fetchJson<any[]>("https://api.dexscreener.com/token-boosts/latest/v1");
          const mine = list.filter((b) => b.chainId === evm.EVM_CHAINS[cfg.id].dexscreener);
          for (const b of mine) add(b.tokenAddress, "dexscreener_boosted", { dexscreenerBoost: b.totalAmount });
          return mine.length;
        };
        const sources = ["geckoterminal_trending_pools", "geckoterminal_new_pools", "dexscreener_boosted"];
        const status = await Promise.all(
          [() => gecko("trending_pools"), () => gecko("new_pools"), boosts].map((fn, i) => fn().then((c) => `${sources[i]}: ${c}`, (e) => `${sources[i]}: ${(e as Error).message.slice(0, 120)}`)),
        );
        // Fuera el nativo envuelto y las stablecoins: no son candidatos.
        const skip = new Set([...cash, ...Object.values(cfg.aliases).map((t) => t.address)]);
        const all = [...merged.values()]
          .filter((c) => !skip.has(c.token))
          .map((c) => {
            const lp = launchpadOf(cfg.id, c.token);
            return lp ? { ...c, launchpad: lp } : c;
          });
        // Por actividad (volumen de la última hora), no por liquidez: ordenar por liquidez dejaba arriba solo los tokens
        // establecidos y el agente concluía que en Base y BNB Chain no había tokens nuevos (v0.53, M1-M9).
        const candidates = [...all].sort((a, b) => b.sources.length - a.sources.length || (b.volume1hUsd ?? 0) - (a.volume1hUsd ?? 0)).slice(0, limit);
        const shown = new Set(candidates.map((c) => c.token));
        // Los recién lanzados (menos de 3 h) que no entran en la lista, como "newest" en Solana.
        const newest = all
          .filter((c) => !shown.has(c.token) && typeof c.ageMinutes === "number" && c.ageMinutes < 180)
          .sort((a, b) => (b.volume1hUsd ?? 0) - (a.volume1hUsd ?? 0))
          .slice(0, 8);
        return {
          chain: cfg.id,
          note: `Candidatos de ${cfg.label} de varias fuentes (los que aparecen en más fuentes van primero; a igualdad, los de más volumen en 1 h). Para uno a fondo: token_report con chain: ${cfg.id} y su dirección.`,
          sourcesStatus: status,
          totalUnique: merged.size,
          candidates,
          ...(newest.length ? { newest } : {}),
        };
      },

      async report(token) {
        const t = await resolveToken(token);
        const [pairs, sec] = await Promise.all([
          evm.dexPairs(cfg.id, [t.address]).then(
            (m) => m.get(t.address) ?? [],
            (e) => ({ error: (e as Error).message }),
          ),
          t.address === evm.NATIVE || isCash(t.address) ? Promise.resolve(null) : evm.tokenSecurity(cfg.id, t.address).catch((e) => ({ error: (e as Error).message })),
        ]);
        const summarize = (p: evm.DexPair) => ({
          dex: p.dexId,
          quote: p.quoteToken.symbol,
          priceUsd: p.priceUsd,
          liquidityUsd: n(p.liquidity?.usd, 0),
          mcapUsd: n(p.marketCap ?? p.fdv, 0),
          pairAgeMinutes: ageMinutes(p.pairCreatedAt),
          txns: p.txns,
          volumeUsd: p.volume,
          priceChangePct: p.priceChange,
          url: p.url,
        });
        const top = Array.isArray(pairs) ? pairs[0] : undefined;
        const s = sec && !("error" in sec) ? (sec as evm.TokenSecurity) : undefined;
        return {
          chain: cfg.id,
          token: t,
          pairs: Array.isArray(pairs) ? { count: pairs.length, top: pairs.slice(0, 3).map(summarize) } : pairs,
          websites: top?.info?.websites?.map((w) => w.url),
          socials: top?.info?.socials?.map((x) => `${x.type}: ${x.url}`),
          security: s
            ? {
                buyTaxPct: s.buyTaxPct ?? "desconocido",
                sellTaxPct: s.sellTaxPct ?? "desconocido",
                honeypot: s.honeypot,
                cannotSellAll: s.cannotSellAll,
                mintable: s.mintable,
                ownerCanChangeBalance: s.ownerCanChangeBalance,
                holders: s.holders,
                top10HoldersPct: s.topHoldersPct,
                openSource: s.raw?.is_open_source,
                proxy: s.raw?.is_proxy,
                creatorPercent: s.raw?.creator_percent,
                lpHolders: (s.raw?.lp_holders as Array<{ percent: string; is_locked: number }> | undefined)?.slice(0, 3),
              }
            : (sec ?? undefined),
        };
      },
    },
  };
  return adapter;
}

const token = (address: string, symbol: string, decimals: number): TokenRef => ({ address: address.toLowerCase(), symbol, decimals });

const ETH = token(evm.NATIVE, "ETH", 18);
const BASE_USDC = token("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "USDC", 6);
const BASE_USDBC = token("0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA", "USDbC", 6);
const BASE_WETH = token("0x4200000000000000000000000000000000000006", "WETH", 18);

const BNB = token(evm.NATIVE, "BNB", 18);
const BSC_USDT = token("0x55d398326f99059fF775485246999027B3197955", "USDT", 18);
const BSC_USDC = token("0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", "USDC", 18);
const BSC_WBNB = token("0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", "WBNB", 18);

export const base = evmAdapter({
  id: "base",
  label: "Base",
  native: ETH,
  nativeBook: "ETHUSDT",
  cash: BASE_USDC,
  stables: [BASE_USDC, BASE_USDBC],
  aliases: { ETH, WETH: BASE_WETH, USDC: BASE_USDC },
  liquidationReserve: 0.00003,
  gasBudgetUsd: { min: 0.3, max: 3 },
});

export const bsc = evmAdapter({
  id: "bsc",
  label: "BNB Chain",
  native: BNB,
  nativeBook: "BNBUSDT",
  cash: BSC_USDT,
  stables: [BSC_USDT, BSC_USDC],
  aliases: { BNB, WBNB: BSC_WBNB, USDT: BSC_USDT, USDC: BSC_USDC },
  liquidationReserve: 0.0002,
  gasBudgetUsd: { min: 0.3, max: 3 },
});

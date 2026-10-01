// Mover dinero entre sitios, con tiempo de llegada como en la realidad:
// - Depósitos y retiradas de Binance por la red de cada cadena (comisión, mínimo y tiempo reales de Binance).
// - Puentes entre cadenas con Li.Fi (coste, gas y duración reales; si se agota su cupo gratuito, una estimación).
// El dinero sale al momento y llega en arrives_at; mientras tanto está "en tránsito". settleTransfers
// abona las que ya han llegado (lo llaman el vigilante, las herramientas y el cierre de la misión).
import { createHash } from "node:crypto";
import { config } from "../config.js";
import { db, logJournal, now } from "../db.js";
import * as market from "../market/binance.js";
import * as evm from "../market/evm.js";
import { fromBaseUnits, toBaseUnits } from "../market/jupiter.js";
import * as lifi from "../market/lifi.js";
import { applyDeltas, assertSimulated, balance, evmAddress, isLiveMission } from "./portfolio.js";
import { attachPosition, buyIntoPosition, detachPosition, sellFromPosition, type Carry } from "./positions.js";
import type { ChainId, TradeMeta, VenueId } from "./types.js";
import { getChain, getVenue, type Delta, type TokenRef } from "./venues/index.js";

const DUST = 1e-12;

// ─── Depósitos y retiradas de Binance ───────────────────────────────────────

export const TRANSFER_ASSETS = ["USDC", "USDT", "SOL", "ETH", "BNB"] as const;
export type TransferAsset = (typeof TRANSFER_ASSETS)[number];

/** Por qué redes mueve Binance cada moneda (solo las de las cadenas del simulador). */
const NETWORKS_FOR: Record<TransferAsset, ChainId[]> = {
  USDC: ["solana", "base", "bsc"],
  USDT: ["solana", "bsc"],
  SOL: ["solana"],
  ETH: ["base"],
  BNB: ["bsc"],
};
const NETWORK: Record<ChainId, string> = { solana: "SOL", base: "BASE", bsc: "BSC" };
/** Minutos hasta que Binance acredita un depósito (confirmaciones de cada red). */
const DEPOSIT_MINUTES: Record<ChainId, number> = { solana: 1, base: 2, bsc: 1 };
/** Gas de un envío en cadenas EVM: token ERC-20 o nativo. */
const EVM_SEND_GAS = { token: 65_000n, native: 21_000n };

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

/** Coste de red de enviar un token desde un monedero propio (en el nativo de la cadena). */
async function sendCost(chain: ChainId, token: TokenRef): Promise<number> {
  if (chain === "solana") return config.solanaTxFeeSol;
  const gas = token.address === evm.NATIVE ? EVM_SEND_GAS.native : EVM_SEND_GAS.token;
  return Number(gas * (await evm.gasPriceWei(chain))) / 1e18;
}

interface TransferRow {
  id: number;
  mission_id: number;
  kind: string;
  from_venue: VenueId;
  to_venue: VenueId;
  provider: string;
  asset_out: string;
  symbol_out: string;
  amount_out: number;
  asset_in: string;
  symbol_in: string;
  decimals_in: number;
  amount_in: number;
  value_usd: number | null;
  arrives_at: string;
  carry: string | null;
}

/** Qué viaja con el dinero: el coste de una posición que se mueve, o el coste de la que se abrirá al llegar. */
interface CarryInfo {
  move?: Carry;
  buyCostUsd?: number;
  meta?: TradeMeta;
}

function insertTransfer(t: Omit<TransferRow, "id"> & { sessionId: number | null; costs: unknown }) {
  return Number(
    db
      .prepare(
        `INSERT INTO transfers (mission_id, session_id, created_at, arrives_at, kind, from_venue, to_venue, provider, asset_out, symbol_out,
           amount_out, asset_in, symbol_in, decimals_in, amount_in, value_usd, costs, carry)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        t.mission_id,
        t.sessionId,
        now(),
        t.arrives_at,
        t.kind,
        t.from_venue,
        t.to_venue,
        t.provider,
        t.asset_out,
        t.symbol_out,
        t.amount_out,
        t.asset_in,
        t.symbol_in,
        t.decimals_in,
        t.amount_in,
        t.value_usd,
        JSON.stringify(t.costs),
        t.carry,
      ).lastInsertRowid,
  );
}

/** Envía una moneda de un monedero propio a Binance, o la retira de Binance a un monedero propio. */
export async function cexTransfer(args: {
  missionId: number;
  sessionId: number | null;
  asset: TransferAsset;
  from: VenueId;
  to: VenueId;
  amount: number;
  reasoning: string;
}) {
  const m = args.missionId;
  assertSimulated(m, "mover dinero con Binance");
  if (!(args.amount > 0)) throw new Error("La cantidad debe ser positiva");
  if (args.from === args.to) throw new Error("El origen y el destino son el mismo");
  if (args.from !== "binance" && args.to !== "binance") {
    throw new Error("Entre dos cadenas no se transfiere directamente: usa simulate_bridge (un puente), o pasa por Binance");
  }
  const chainId = (args.from === "binance" ? args.to : args.from) as ChainId;
  const chain = getChain(chainId);
  if (!NETWORKS_FOR[args.asset].includes(chainId)) {
    const nets = NETWORKS_FOR[args.asset].map((c) => getChain(c).label).join(", ");
    throw new Error(`Binance no mueve ${args.asset} por la red de ${chain.label}. Redes disponibles para ${args.asset}: ${nets}`);
  }
  const token = await chain.resolveToken(args.asset);
  const info = await market.networkInfo(args.asset, NETWORK[chainId]);
  if (!info) throw new Error(`Binance no tiene ${args.asset} en la red ${NETWORK[chainId]}`);
  const costs: Array<{ kind: string; amount: number; symbol: string }> = [];
  let arrivesAt: string;
  let received: number;

  if (args.to === "binance") {
    if (!info.depositEnable) throw new Error(`Binance tiene suspendidos los depósitos de ${args.asset} por ${NETWORK[chainId]}`);
    const fee = await sendCost(chainId, token);
    const have = balance(m, chainId, token.address);
    if (args.amount > have + DUST) throw new Error(`Saldo insuficiente: tienes ${have} ${args.asset} en ${chain.label}`);
    const deltas: Delta[] = [
      { asset: token.address, symbol: token.symbol, decimals: token.decimals, amount: -args.amount },
      { asset: chain.native.address, symbol: chain.native.symbol, decimals: chain.native.decimals, amount: -fee },
    ];
    const nativeNeeded = fee + (token.address === chain.native.address ? args.amount : 0);
    if (balance(m, chainId, chain.native.address) + DUST < nativeNeeded) {
      throw new Error(`No tienes ${chain.native.symbol} suficiente para pagar la red de ${chain.label} (${fee.toPrecision(3)} ${chain.native.symbol})`);
    }
    applyDeltas(m, chainId, deltas);
    costs.push({ kind: "network_fee", amount: fee, symbol: chain.native.symbol });
    received = args.amount;
    arrivesAt = inMinutes(DEPOSIT_MINUTES[chainId]);
  } else {
    if (!info.withdrawEnable) throw new Error(`Binance tiene suspendidas las retiradas de ${args.asset} por ${NETWORK[chainId]}`);
    if (args.amount < info.withdrawMin) throw new Error(`La retirada mínima de ${args.asset} por ${NETWORK[chainId]} es ${info.withdrawMin}`);
    if (args.amount <= info.withdrawFee) throw new Error(`La retirada debe superar la comisión de ${info.withdrawFee} ${args.asset}`);
    const have = balance(m, "binance", args.asset);
    if (args.amount > have + DUST) throw new Error(`Saldo insuficiente: tienes ${have} ${args.asset} en Binance`);
    applyDeltas(m, "binance", [{ asset: args.asset, symbol: args.asset, decimals: 8, amount: -args.amount }]);
    costs.push({ kind: "withdraw_fee", amount: info.withdrawFee, symbol: args.asset });
    received = args.amount - info.withdrawFee;
    arrivesAt = inMinutes(1 + info.arrivalMinutes);
  }

  const assetOut = args.from === "binance" ? args.asset : token.address;
  const assetIn = args.to === "binance" ? args.asset : token.address;
  const carry = detachPosition({ missionId: m, venue: args.from, asset: assetOut, qty: args.amount, toVenue: args.to });
  const id = insertTransfer({
    mission_id: m,
    sessionId: args.sessionId,
    kind: args.to === "binance" ? "cex_deposit" : "cex_withdraw",
    from_venue: args.from,
    to_venue: args.to,
    provider: `Binance (red ${NETWORK[chainId]}${info.source === "tabla fija" ? ", comisiones de la tabla fija" : ""})`,
    asset_out: assetOut,
    symbol_out: args.asset,
    amount_out: args.amount,
    asset_in: assetIn,
    symbol_in: args.to === "binance" ? args.asset : token.symbol,
    decimals_in: args.to === "binance" ? 8 : token.decimals,
    amount_in: received,
    value_usd: null,
    arrives_at: arrivesAt,
    costs,
    carry: carry ? JSON.stringify({ move: carry } satisfies CarryInfo) : null,
  });
  const result = {
    transferId: id,
    asset: args.asset,
    from: args.from,
    to: args.to,
    network: NETWORK[chainId],
    sent: args.amount,
    willReceive: received,
    costs: costs.map((c) => `${c.kind}: ${Number(c.amount.toPrecision(6))} ${c.symbol}`),
    arrivesAt,
    note: `Llega hacia las ${hhmm(arrivesAt)}. Mientras tanto aparece en tu cartera como "en tránsito".`,
  };
  logJournal({
    missionId: m,
    sessionId: args.sessionId,
    kind: "transfer",
    summary: `Transferencia ${args.amount} ${args.asset} ${getVenue(args.from).label} → ${getVenue(args.to).label} (llega hacia las ${hhmm(arrivesAt)})`,
    reasoning: args.reasoning,
    details: result,
  });
  return result;
}

// ─── Puentes entre cadenas ──────────────────────────────────────────────────

/** Dirección de Solana de la misión: ficticia, derivada del id (32 bytes en base58, como una clave pública). */
export function solanaAddress(missionId: number): string {
  const bytes = createHash("sha256").update(`cryptoagent-solana-${missionId}`).digest();
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = BigInt(`0x${bytes.toString("hex")}`);
  let out = "";
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = "1" + out;
  }
  return out;
}

/** Li.Fi usa sus propias direcciones para los nativos. */
const lifiToken = (chain: ChainId, t: TokenRef) => (t.address === getChain(chain).native.address ? lifi.LIFI_NATIVE[chain]! : t.address);

// Estimación sin Li.Fi (si se agota su cupo): comisión del 0,25 % más 5 céntimos, gas típico y 2 minutos.
const STATIC_BRIDGE = { feePct: 0.25, fixedUsd: 0.05, seconds: 120, gas: { solana: 0.00005, base: 0.000005, bsc: 0.00003 } as Record<ChainId, number> };

interface BridgeEstimate {
  provider: string;
  /** Nombre de la ruta en Li.Fi. */
  tool?: string;
  amountOut: number;
  gasNative: number;
  seconds: number;
  fees: string[];
  fromUsd?: number;
  toUsd?: number;
  estimated: boolean;
}

async function staticEstimate(from: ChainId, to: ChainId, tin: TokenRef, tout: TokenRef, amount: number): Promise<BridgeEstimate> {
  const [pin, pout] = await Promise.all([getChain(from).priceUsd([tin.address]), getChain(to).priceUsd([tout.address])]);
  const priceIn = pin[tin.address];
  const priceOut = pout[tout.address];
  if (!priceIn || !priceOut) throw new Error(`Sin precio para estimar el puente de ${tin.symbol} a ${tout.symbol}`);
  const fromUsd = amount * priceIn;
  const toUsd = fromUsd * (1 - STATIC_BRIDGE.feePct / 100) - STATIC_BRIDGE.fixedUsd;
  if (toUsd <= 0) throw new Error("La cantidad no cubre el coste del puente");
  return {
    provider: "estimación (sin Li.Fi)",
    amountOut: toUsd / priceOut,
    gasNative: STATIC_BRIDGE.gas[from],
    seconds: STATIC_BRIDGE.seconds,
    fees: [`comisión estimada: ${STATIC_BRIDGE.feePct} % + ${STATIC_BRIDGE.fixedUsd} $`],
    fromUsd,
    toUsd,
    estimated: true,
  };
}

async function liveEstimate(missionId: number, from: ChainId, to: ChainId, tin: TokenRef, tout: TokenRef, amount: number, slippageBps: number, routing: lifi.RouteOptions = {}): Promise<BridgeEstimate> {
  // En una misión real, cotiza con las direcciones de la cartera de verdad.
  const real = isLiveMission(missionId) ? (await import("../live/sync.js")).livePub() : null;
  const address = (c: ChainId) => (c === "solana" ? (real?.solana ?? solanaAddress(missionId)) : (real?.evm ?? evmAddress(missionId)));
  const q = await lifi.bridgeQuote({
    fromChain: from,
    toChain: to,
    fromToken: lifiToken(from, tin),
    toToken: lifiToken(to, tout),
    fromAmount: toBaseUnits(amount, tin.decimals),
    fromAddress: address(from),
    toAddress: address(to),
    slippage: slippageBps / 10_000,
    ...routing,
  });
  const native = getChain(from).native;
  return {
    provider: `Li.Fi (${q.tool})`,
    tool: q.tool,
    amountOut: fromBaseUnits(q.toAmount, tout.decimals),
    gasNative: q.gas.filter((g) => g.symbol === native.symbol || g.symbol === `W${native.symbol}`).reduce((s, g) => s + fromBaseUnits(g.amount, g.decimals), 0),
    seconds: q.durationSeconds,
    fees: q.fees.map((f) => `${f.name}: ${f.usd} $ (incluida en lo que recibes)`),
    fromUsd: q.fromUsd,
    toUsd: q.toUsd,
    estimated: false,
  };
}

/** Última ruta cotizada con quote_bridge en una misión real, por misión y par de cadenas (para avisar si se ejecuta otra). */
export const lastQuotedBridge = new Map<string, string>();

async function resolveBridge(fromChain: ChainId, toChain: ChainId, tokenIn: string, tokenOut: string) {
  if (fromChain === toChain) throw new Error("Un puente une dos cadenas distintas: dentro de la misma cadena usa simulate_swap");
  const [tin, tout] = await Promise.all([getChain(fromChain).resolveToken(tokenIn), getChain(toChain).resolveToken(tokenOut)]);
  return { tin, tout };
}

/**
 * Cotiza un puente. En simulación es una estimación que no gasta el cupo de Li.Fi (el coste real se calcula al
 * ejecutarlo); en una misión real, la cotización de Li.Fi con la ruta que elegiría, para verla antes de ejecutar.
 */
export async function quoteBridge(a: { missionId?: number | null; fromChain: ChainId; toChain: ChainId; tokenIn: string; tokenOut: string; amount: number } & lifi.RouteOptions) {
  const { tin, tout } = await resolveBridge(a.fromChain, a.toChain, a.tokenIn, a.tokenOut);
  if (a.missionId != null && isLiveMission(a.missionId)) {
    const e = await liveEstimate(a.missionId, a.fromChain, a.toChain, tin, tout, a.amount, 50, { route: a.route, avoidBridges: a.avoidBridges, bridge: a.bridge });
    lastQuotedBridge.set(`${a.missionId}:${a.fromChain}:${a.toChain}`, e.tool!);
    return {
      from: `${a.amount} ${tin.symbol} en ${getChain(a.fromChain).label}`,
      to: `~${Number(e.amountOut.toPrecision(6))} ${tout.symbol} en ${getChain(a.toChain).label}`,
      bridge: e.provider,
      bridgeName: e.tool,
      gas: `~${Number(e.gasNative.toPrecision(3))} ${getChain(a.fromChain).native.symbol}`,
      seconds: e.seconds,
      fees: e.fees,
      note:
        `Cotización real de Li.Fi. Al ejecutar, Li.Fi vuelve a elegir y puede cambiar de ruta: para usar exactamente esta, pasa bridge: "${e.tool}" a execute_bridge. ` +
        `Rutas excluidas siempre: ${lifi.ALWAYS_AVOIDED_BRIDGES.join(", ")}. Puedes pedir la más rápida (route: fastest) o excluir otras (avoid_bridges).`,
    };
  }
  const e = await staticEstimate(a.fromChain, a.toChain, tin, tout, a.amount);
  return {
    from: `${a.amount} ${tin.symbol} en ${getChain(a.fromChain).label}`,
    to: `~${Number(e.amountOut.toPrecision(6))} ${tout.symbol} en ${getChain(a.toChain).label}`,
    gas: `~${e.gasNative} ${getChain(a.fromChain).native.symbol}`,
    duration: "unos minutos",
    note: "Estimación orientativa (comisión típica del 0,25 % + 0,05 $). El coste, el gas y la duración reales los da Li.Fi al ejecutar el puente con simulate_bridge.",
  };
}

/** Cruza un puente entre dos cadenas: sale al momento y llega cuando indique el puente. */
export async function bridge(a: {
  missionId: number;
  sessionId: number | null;
  fromChain: ChainId;
  toChain: ChainId;
  tokenIn: string;
  tokenOut: string;
  amount: number;
  slippageBps: number;
  reasoning: string;
  meta?: TradeMeta;
} & lifi.RouteOptions) {
  const m = a.missionId;
  assertSimulated(m, "cruzar un puente");
  if (!(a.amount > 0)) throw new Error("La cantidad debe ser positiva");
  const src = getChain(a.fromChain);
  const dst = getChain(a.toChain);
  const { tin, tout } = await resolveBridge(a.fromChain, a.toChain, a.tokenIn, a.tokenOut);
  const have = balance(m, src.id, tin.address);
  if (a.amount > have + DUST) throw new Error(`Saldo insuficiente: tienes ${have} ${tin.symbol} en ${src.label}`);

  let e: BridgeEstimate;
  try {
    e = await liveEstimate(m, src.id, dst.id, tin, tout, a.amount, a.slippageBps, { route: a.route, avoidBridges: a.avoidBridges, bridge: a.bridge });
  } catch (err) {
    if (!(err instanceof lifi.BudgetExhausted)) throw err;
    e = await staticEstimate(src.id, dst.id, tin, tout, a.amount);
  }
  const nativeNeeded = e.gasNative + (tin.address === src.native.address ? a.amount : 0);
  if (balance(m, src.id, src.native.address) + DUST < nativeNeeded) {
    throw new Error(`No tienes ${src.native.symbol} suficiente para el gas del puente en ${src.label} (${e.gasNative.toPrecision(3)} ${src.native.symbol})`);
  }
  applyDeltas(m, src.id, [
    { asset: tin.address, symbol: tin.symbol, decimals: tin.decimals, amount: -a.amount },
    { asset: src.native.address, symbol: src.native.symbol, decimals: src.native.decimals, amount: -e.gasNative },
  ]);

  // Posiciones: lo que sale se cierra a lo que vale al llegar (si era una posición; el gas inicial no lo es)
  // y lo que llega, si no es efectivo, se abre al llegar con el valor de lo enviado como coste.
  const valueOut = e.fromUsd ?? e.toUsd ?? 0;
  if (!src.isCash(tin.address)) {
    sellFromPosition({ missionId: m, venue: src.id, asset: tin.address, qty: a.amount, proceedsUsd: e.toUsd ?? valueOut, meta: a.meta });
  }
  const opensPosition = !dst.isCash(tout.address);
  const arrivesAt = new Date(Date.now() + Math.max(30, e.seconds) * 1000).toISOString();
  const costs = [`gas: ${Number(e.gasNative.toPrecision(4))} ${src.native.symbol}`, ...e.fees];
  const id = insertTransfer({
    mission_id: m,
    sessionId: a.sessionId,
    kind: "bridge",
    from_venue: src.id,
    to_venue: dst.id,
    provider: e.provider,
    asset_out: tin.address,
    symbol_out: tin.symbol,
    amount_out: a.amount,
    asset_in: tout.address,
    symbol_in: tout.symbol,
    decimals_in: tout.decimals,
    amount_in: e.amountOut,
    value_usd: e.toUsd ?? null,
    arrives_at: arrivesAt,
    costs,
    carry: opensPosition ? JSON.stringify({ buyCostUsd: valueOut, meta: a.meta } satisfies CarryInfo) : null,
  });
  const result = {
    transferId: id,
    bridge: e.provider,
    sent: `${a.amount} ${tin.symbol} desde ${src.label}`,
    willReceive: `${e.amountOut} ${tout.symbol} en ${dst.label}`,
    costs,
    arrivesAt,
    ...(e.estimated ? { warning: "Se ha agotado el cupo gratuito de Li.Fi: el coste y la duración son una estimación." } : {}),
    note: `Llega hacia las ${hhmm(arrivesAt)}. Mientras tanto aparece en tu cartera como "en tránsito".`,
  };
  logJournal({
    missionId: m,
    sessionId: a.sessionId,
    kind: "transfer",
    summary: `Puente ${a.amount} ${tin.symbol} ${src.label} → ${Number(e.amountOut.toPrecision(6))} ${tout.symbol} ${dst.label} (llega hacia las ${hhmm(arrivesAt)})`,
    reasoning: a.reasoning,
    details: result,
  });
  return result;
}

// ─── Llegadas ───────────────────────────────────────────────────────────────

/**
 * Abona las transferencias que ya han llegado. Con `force`, todas las de la misión aunque no hayan
 * llegado (al cerrar una misión, lo que está en tránsito llega). Cada una se reclama de forma atómica:
 * aunque varios procesos lo llamen a la vez, se abona una sola vez.
 */
export async function settleTransfers(opts: { missionId?: number; force?: boolean } = {}): Promise<string[]> {
  // Los puentes con dinero real no se abonan con un temporizador: los confirma Li.Fi y el saldo se lee de la cadena.
  const { settleLiveTransfers } = await import("../live/bridge.js");
  const log: string[] = await settleLiveTransfers(opts.missionId).catch((err) => [`Error consultando puentes reales: ${(err as Error).message}`]);
  const simOnly = "AND mission_id NOT IN (SELECT id FROM missions WHERE mode = 'live')";
  const rows = (
    opts.force && opts.missionId !== undefined
      ? db.prepare(`SELECT * FROM transfers WHERE status = 'pending' AND mission_id = ? ${simOnly} ORDER BY id`).all(opts.missionId)
      : opts.missionId !== undefined
        ? db.prepare(`SELECT * FROM transfers WHERE status = 'pending' AND mission_id = ? AND arrives_at <= ? ${simOnly} ORDER BY id`).all(opts.missionId, now())
        : db.prepare(`SELECT * FROM transfers WHERE status = 'pending' AND arrives_at <= ? ${simOnly} ORDER BY id`).all(now())
  ) as unknown as TransferRow[];
  for (const t of rows) {
    // Reclamarla y abonar el saldo van juntos: una transferencia en 'settling' ya está en la cartera
    // y deja de contar como "en tránsito" (si no, la valoración la contaría dos veces).
    db.exec("SAVEPOINT settle");
    try {
      if (!db.prepare("UPDATE transfers SET status = 'settling' WHERE id = ? AND status = 'pending'").run(t.id).changes) {
        db.exec("RELEASE settle");
        continue;
      }
      applyDeltas(t.mission_id, t.to_venue, [{ asset: t.asset_in, symbol: t.symbol_in, decimals: t.decimals_in, amount: t.amount_in }]);
      db.exec("RELEASE settle");
    } catch (err) {
      db.exec("ROLLBACK TO settle");
      db.exec("RELEASE settle");
      log.push(`No se pudo abonar la transferencia #${t.id}: ${(err as Error).message}`);
      continue;
    }
    try {
      const carry = t.carry ? (JSON.parse(t.carry) as CarryInfo) : null;
      if (carry?.move) {
        await attachPosition({ missionId: t.mission_id, venue: t.to_venue, asset: t.asset_in, symbol: t.symbol_in, received: t.amount_in, carry: carry.move });
      } else if (carry?.buyCostUsd !== undefined) {
        await buyIntoPosition({ missionId: t.mission_id, venue: t.to_venue, asset: t.asset_in, symbol: t.symbol_in, qty: t.amount_in, costUsd: carry.buyCostUsd, meta: carry.meta });
      }
      db.prepare("UPDATE transfers SET status = 'settled', settled_at = ? WHERE id = ?").run(now(), t.id);
      const summary = `Llegan ${Number(t.amount_in.toPrecision(8))} ${t.symbol_in} a ${getVenue(t.to_venue).label} (transferencia #${t.id})`;
      logJournal({ missionId: t.mission_id, sessionId: null, kind: "transfer_arrived", summary });
      log.push(summary);
    } catch (err) {
      // El saldo ya está abonado: no se vuelve a 'pending' (se abonaría dos veces); solo falla el coste base.
      db.prepare("UPDATE transfers SET status = 'settled', settled_at = ? WHERE id = ?").run(now(), t.id);
      log.push(`Transferencia #${t.id} abonada, pero no se pudo trasladar su coste base: ${(err as Error).message}`);
    }
  }
  return log;
}

/** Transferencias en tránsito de una misión (para la cartera). */
export function pendingTransfers(missionId: number) {
  return db
    .prepare("SELECT id, kind, from_venue, to_venue, provider, symbol_out, amount_out, asset_in, symbol_in, decimals_in, amount_in, arrives_at FROM transfers WHERE mission_id = ? AND status = 'pending' ORDER BY id")
    .all(missionId) as unknown as Array<Pick<TransferRow, "id" | "kind" | "from_venue" | "to_venue" | "provider" | "symbol_out" | "amount_out" | "asset_in" | "symbol_in" | "decimals_in" | "amount_in" | "arrives_at">>;
}


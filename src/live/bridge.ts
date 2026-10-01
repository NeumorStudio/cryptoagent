// Puentes con dinero real (Li.Fi). Solo mueven estables o el nativo entre las propias cadenas de la
// cartera: es mover capital, no comprar. El firmante garantiza que no salga más de lo aprobado
// (approve exacto y tope de nativo en EVM; simulación de todas las cuentas en Solana). La llegada se
// sigue con el estado de Li.Fi; mientras tanto, el dinero cuenta "en tránsito".
import { db, logJournal, now } from "../db.js";
import { lastQuotedBridge } from "../sim/transfers.js";
import { EVM_CHAINS, NATIVE, type EvmChainId } from "../market/evm.js";
import * as lifi from "../market/lifi.js";
import { toBaseUnits } from "../market/jupiter.js";
import { getMission, isLive } from "../sim/mission.js";
import { balance } from "../sim/portfolio.js";
import type { ChainId } from "../sim/types.js";
import { getChain } from "../sim/venues/index.js";
import type { ChainAdapter, TokenRef } from "../sim/venues/types.js";
import { pad32 } from "./chain.js";
import { requestIntent, signTx } from "./client.js";
import { erc20Allowance, explorerTx, GAS_FOR_THIS_TX, logLiveTx, rawTokenBalance, solanaBudget } from "./execute.js";
import { livePub, syncHoldings } from "./sync.js";

/** Nativo máximo que puede cobrar un puente EVM como comisión, además de lo enviado. */
const EVM_BRIDGE_FEE_CAP: Record<EvmChainId, bigint> = { base: 500_000_000_000_000n, bsc: 3_000_000_000_000_000n };
/** SOL extra que puede costar un puente desde Solana (cuentas del puente, comisión en SOL). */
const SOLANA_BRIDGE_EXTRA = 20_000_000n;

const isMovable = (chain: ChainAdapter, t: TokenRef) => chain.isCash(t.address) || t.address === chain.native.address;
const lifiToken = (chain: ChainAdapter, t: TokenRef) => (t.address === chain.native.address ? lifi.LIFI_NATIVE[chain.id]! : t.address);
/** Hora de llegada: en UTC, como el resto de datos que ve el agente, y la local entre paréntesis. */
const hhmm = (iso: string) => `${new Date(iso).toISOString().slice(11, 16)} UTC (${new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })} hora local)`;

interface LiveCarry {
  live: { txHash: string; tool: string; baseline: number };
}

export async function liveBridge(a: {
  missionId: number;
  sessionId: number | null;
  fromChain: ChainId;
  toChain: ChainId;
  tokenIn: string;
  tokenOut: string;
  amount: number;
  slippageBps: number;
  reasoning: string;
} & lifi.RouteOptions) {
  const m = a.missionId;
  if (!isLive(getMission(m))) throw new Error("execute_bridge solo existe en misiones reales");
  if (a.fromChain === a.toChain) throw new Error("Un puente une dos cadenas distintas: dentro de la misma cadena usa execute_swap");
  const src = getChain(a.fromChain);
  const dst = getChain(a.toChain);
  const [tin, tout] = await Promise.all([src.resolveToken(a.tokenIn), dst.resolveToken(a.tokenOut)]);
  if (!isMovable(src, tin) || !isMovable(dst, tout)) {
    throw new Error("Con dinero real, los puentes solo mueven estables (USDC, USDT) o el nativo (SOL, ETH, BNB). Vende antes el token con execute_swap.");
  }
  await syncHoldings(m);
  const have = balance(m, src.id, tin.address);
  const isNativeIn = tin.address === src.native.address;
  const spendable = isNativeIn ? Math.max(0, have - GAS_FOR_THIS_TX[src.id]) : have;
  if (!(a.amount > 0)) throw new Error("La cantidad debe ser positiva");
  if (a.amount > spendable * 1.000001) {
    throw new Error(`Saldo insuficiente: tienes ${have} ${tin.symbol} en ${src.label}` + (isNativeIn ? ` y hacen falta ${GAS_FOR_THIS_TX[src.id]} para pagar la red de esta transacción` : ""));
  }
  const nativeLeft = balance(m, src.id, src.native.address) - (isNativeIn ? a.amount : 0);
  if (nativeLeft < GAS_FOR_THIS_TX[src.id]) throw new Error(`No tienes ${src.native.symbol} suficiente para pagar la red de esta transacción en ${src.label}.`);

  const usd = src.isCash(tin.address) ? a.amount : ((await src.priceUsd([tin.address]))[tin.address] ?? 0) * a.amount;
  const summary = `Puente: ${a.amount} ${tin.symbol} de ${src.label} → ${tout.symbol} en ${dst.label} (≈ ${usd.toFixed(2)} $). Motivo: ${a.reasoning.slice(0, 160)}`;
  let ticket: string;
  try {
    ticket = await requestIntent({ missionId: m, chain: src.id, side: "move", usd, summary });
  } catch (err) {
    logLiveTx(m, src.id, "bridge", "rejected", summary, { usd, error: (err as Error).message });
    throw err;
  }

  const pub = livePub();
  const addr = (c: ChainId) => (c === "solana" ? pub.solana : pub.evm);
  const amountIn = !isNativeIn && a.amount >= have * 0.999999 ? await rawTokenBalance(src.id, pub, tin) : toBaseUnits(a.amount * (1 - 1e-9), tin.decimals);
  // La cotización (con la transacción) se pide tras la aprobación: el precio es el del momento.
  const q = await lifi.bridgeTx({
    fromChain: src.id,
    toChain: dst.id,
    fromToken: lifiToken(src, tin),
    toToken: lifiToken(dst, tout),
    fromAmount: amountIn,
    fromAddress: addr(src.id),
    toAddress: addr(dst.id),
    slippage: a.slippageBps / 10_000,
    route: a.route,
    avoidBridges: a.avoidBridges,
    bridge: a.bridge,
  });
  const same = (x: string, y: string) => (x.startsWith("0x") ? x.toLowerCase() === y.toLowerCase() : x === y);
  if (!same(q.fromAddress, addr(src.id)) || !same(q.toAddress, addr(dst.id))) {
    throw new Error(`Li.Fi ha devuelto otras direcciones (${q.fromAddress} → ${q.toAddress}): no se envía`);
  }
  const baseline = balance(m, dst.id, tout.address);

  let res: { hash: string; ok: boolean; error?: string };
  if (src.id === "solana") {
    res = await signTx({ ticket, chain: "solana", kind: "bridge", usd, solanaTx: q.transactionRequest.data, budget: solanaBudget(tin, amountIn, SOLANA_BRIDGE_EXTRA) });
  } else {
    const c = EVM_CHAINS[src.id as EvmChainId];
    if (!isNativeIn) {
      const spender = q.approvalAddress ?? q.transactionRequest.to!;
      if ((await erc20Allowance(src.id as EvmChainId, tin.address, pub.evm, spender)) < amountIn) {
        const data = `0x095ea7b3${pad32(spender)}${amountIn.toString(16).padStart(64, "0")}`;
        const ap = await signTx({ ticket, chain: src.id, kind: "approve", usd, evmTx: { chainId: c.chainId, to: tin.address, data, value: "0" } });
        logLiveTx(m, src.id, "approve", ap.ok ? "confirmed" : "failed", `Approve de ${a.amount} ${tin.symbol} a Li.Fi`, { hash: ap.hash, error: ap.error });
        if (!ap.ok) throw new Error(`El approve falló (${explorerTx(src.id, ap.hash)}): ${ap.error}`);
      }
    }
    const fee = EVM_BRIDGE_FEE_CAP[src.id as EvmChainId];
    res = await signTx({
      ticket,
      chain: src.id,
      kind: "bridge",
      usd,
      evmTx: { chainId: c.chainId, to: q.transactionRequest.to!, data: q.transactionRequest.data, value: String(BigInt(q.transactionRequest.value ?? "0")) },
      evmLimits: { maxValue: ((isNativeIn ? amountIn : 0n) + fee).toString(), destEvm: dst.id !== "solana" },
    });
  }

  const link = explorerTx(src.id, res.hash);
  if (!res.ok) {
    logLiveTx(m, src.id, "bridge", "failed", summary, { hash: res.hash, usd, error: res.error });
    logJournal({ missionId: m, sessionId: a.sessionId, kind: "failed_tx", summary: `Puente REAL fallido en ${src.label}: ${res.error}`, reasoning: a.reasoning, details: { chain: src.id, txHash: res.hash, explorer: link } });
    await syncHoldings(m).catch(() => undefined);
    throw new Error(`La transacción del puente falló: ${res.error}. ${link}`);
  }
  logLiveTx(m, src.id, "bridge", "confirmed", summary, { hash: res.hash, usd });
  const amountOut = Number(q.toAmount) / 10 ** tout.decimals;
  const arrivesAt = new Date(Date.now() + Math.max(20, q.durationSeconds) * 1000).toISOString();
  const costs = [...q.gas.map((g) => `gas: ${Number(g.amount) / 10 ** g.decimals} ${g.symbol}`), ...q.fees.map((f) => `${f.name}: ${f.usd} $`)];
  const carry: LiveCarry = { live: { txHash: res.hash, tool: q.tool, baseline } };
  const id = Number(
    db
      .prepare(
        `INSERT INTO transfers (mission_id, session_id, created_at, arrives_at, status, kind, from_venue, to_venue, provider, asset_out, symbol_out, amount_out,
           asset_in, symbol_in, decimals_in, amount_in, value_usd, costs, carry)
         VALUES (?, ?, ?, ?, 'pending', 'bridge', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(m, a.sessionId, now(), arrivesAt, src.id, dst.id, `Li.Fi (${q.tool})`, tin.address, tin.symbol, Number(amountIn) / 10 ** tin.decimals, tout.address, tout.symbol, tout.decimals, amountOut, q.toUsd ?? usd, JSON.stringify(costs), JSON.stringify(carry))
      .lastInsertRowid,
  );
  const result = {
    real: true,
    transferId: id,
    bridge: `Li.Fi (${q.tool})`,
    ...routeChangeWarning(m, src.id, dst.id, q.tool, a.bridge),
    txHash: res.hash,
    explorer: link,
    sent: `${Number(amountIn) / 10 ** tin.decimals} ${tin.symbol} desde ${src.label}`,
    willReceive: `~${amountOut} ${tout.symbol} en ${dst.label}`,
    costs,
    note: `Llega hacia las ${hhmm(arrivesAt)} (lo confirma Li.Fi). Mientras tanto aparece como "en tránsito".`,
    ...noGasWarning(m, dst, tout.address),
  };
  logJournal({
    missionId: m,
    sessionId: a.sessionId,
    kind: "transfer",
    summary: `Puente REAL ${Number(amountIn) / 10 ** tin.decimals} ${tin.symbol} ${src.label} → ~${Number(amountOut.toPrecision(6))} ${tout.symbol} ${dst.label}`,
    reasoning: a.reasoning,
    details: {
      chain: src.id,
      from: src.id,
      to: dst.id,
      soldQty: Number(amountIn) / 10 ** tin.decimals,
      soldSymbol: tin.symbol,
      receivedQty: amountOut,
      receivedSymbol: tout.symbol,
      valueUsd: usd,
      ...result,
    },
  });
  await syncHoldings(m).catch(() => undefined);
  return result;
}

/** Si no se fijó la ruta y Li.Fi ha elegido otra distinta de la última cotizada para este par de cadenas, lo dice. */
function routeChangeWarning(missionId: number, from: ChainId, to: ChainId, used: string, fixed?: string) {
  if (fixed) return {};
  const quoted = lastQuotedBridge.get(`${missionId}:${from}:${to}`);
  if (!quoted || quoted === used) return {};
  return { routeChanged: `La última cotización era por ${quoted}, pero Li.Fi ha elegido ${used} al ejecutar (para fijar una ruta, pasa bridge).` };
}

/**
 * Si lo que llega a una cadena no es su nativo y allí no hay nativo para el gas, no se podrá mover (ni siquiera
 * devolverlo). Es un dato, no un freno: en la M21 llegaron 4,93 USDC a Base sin ETH y no se podía hacer nada con ellos.
 */
function noGasWarning(missionId: number, dst: ChainAdapter, arriving: string) {
  if (arriving.toLowerCase() === dst.native.address.toLowerCase()) return {};
  const have = balance(missionId, dst.id, dst.native.address);
  if (have >= GAS_FOR_THIS_TX[dst.id]) return {};
  return {
    warning: `En ${dst.label} tienes ${Number(have.toPrecision(3))} ${dst.native.symbol}: sin ${dst.native.symbol} para el gas no podrás mover lo que llegue (ni devolverlo).`,
  };
}

// ─── Llegadas ───────────────────────────────────────────────────────────────

const lastPoll = new Map<number, number>();
const POLL_MS = 20_000;

/** Consulta a Li.Fi los puentes reales pendientes y marca los que han llegado (o fallado). */
export async function settleLiveTransfers(missionId?: number): Promise<string[]> {
  const rows = db
    .prepare(
      `SELECT t.* FROM transfers t JOIN missions m ON m.id = t.mission_id
       WHERE t.status = 'pending' AND m.mode = 'live' ${missionId !== undefined ? "AND t.mission_id = ?" : ""} ORDER BY t.id`,
    )
    .all(...(missionId !== undefined ? [missionId] : [])) as Array<Record<string, any>>;
  const log: string[] = [];
  for (const t of rows) {
    const carry = JSON.parse(t.carry ?? "{}") as Partial<LiveCarry>;
    if (!carry.live) continue;
    if (Date.now() - (lastPoll.get(t.id) ?? 0) < POLL_MS) continue;
    lastPoll.set(t.id, Date.now());
    const st = await lifi.bridgeStatus({ txHash: carry.live.txHash, fromChain: t.from_venue, toChain: t.to_venue, tool: carry.live.tool });
    if (st.status === "DONE") {
      // Lo que llegó de verdad: con PARTIAL el puente puede entregar otro token (y con otros decimales).
      const native = (a: string) => /^0x0{40}$/i.test(a) || a.toLowerCase() === NATIVE || a === "11111111111111111111111111111111";
      const got = st.receivedToken;
      const sameToken = !got || got.address.toLowerCase() === String(t.asset_in).toLowerCase() || (native(got.address) && native(String(t.asset_in)));
      const decimals = got && !sameToken ? got.decimals : t.decimals_in;
      const received = st.receivedAmount !== undefined ? Number(st.receivedAmount) / 10 ** decimals : t.amount_in;
      const changed = got && !sameToken;
      const update = changed
        ? db.prepare("UPDATE transfers SET status = 'settled', settled_at = ?, amount_in = ?, asset_in = ?, symbol_in = ?, decimals_in = ? WHERE id = ? AND status = 'pending'").run(now(), received, got.address.toLowerCase(), got.symbol, got.decimals, t.id)
        : db.prepare("UPDATE transfers SET status = 'settled', settled_at = ?, amount_in = ? WHERE id = ? AND status = 'pending'").run(now(), received, t.id);
      if (!update.changes) continue;
      const summary = changed
        ? `Llegan ${Number(received.toPrecision(8))} ${got!.symbol} a ${getChain(t.to_venue).label} en lugar de ${t.symbol_in} (puente real #${t.id}, ${st.substatus ?? "otro token"}): el puente no hizo el cambio final`
        : `Llegan ${Number(received.toPrecision(8))} ${t.symbol_in} a ${getChain(t.to_venue).label} (puente real #${t.id})`;
      logJournal({
        missionId: t.mission_id,
        sessionId: null,
        kind: "transfer_arrived",
        summary,
        details: st.receivingTxHash ? { txHash: st.receivingTxHash, explorer: explorerTx(t.to_venue, st.receivingTxHash) } : undefined,
      });
      await syncHoldings(t.mission_id).catch(() => undefined);
      const gas = noGasWarning(t.mission_id, getChain(t.to_venue), changed ? got!.address : String(t.asset_in));
      if (gas.warning) logJournal({ missionId: t.mission_id, sessionId: null, kind: "mission", summary: gas.warning });
      log.push(gas.warning ? `${summary}. ${gas.warning}` : summary);
    } else if (st.status === "FAILED" || st.status === "INVALID") {
      if (!db.prepare("UPDATE transfers SET status = 'failed', settled_at = ? WHERE id = ? AND status = 'pending'").run(now(), t.id).changes) continue;
      const summary = `El puente real #${t.id} ha fallado (${st.substatus ?? st.status}). Normalmente el dinero vuelve a ${getChain(t.from_venue).label}: revisa el explorador.`;
      logJournal({ missionId: t.mission_id, sessionId: null, kind: "mission", summary, details: { explorer: explorerTx(t.from_venue, carry.live.txHash) } });
      await syncHoldings(t.mission_id).catch(() => undefined);
      log.push(summary);
    }
  }
  return log;
}


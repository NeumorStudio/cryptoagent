// Puentes con dinero real (Li.Fi). Solo mueven estables o el nativo entre las propias cadenas de la
// cartera: es mover capital, no comprar. El firmante garantiza que no salga más de lo aprobado
// (approve exacto y tope de nativo en EVM; simulación de todas las cuentas en Solana). La llegada se
// sigue con el estado de Li.Fi; mientras tanto, el dinero cuenta "en tránsito".
import { db, logJournal, now } from "../db.js";
import { EVM_CHAINS, type EvmChainId } from "../market/evm.js";
import * as lifi from "../market/lifi.js";
import { toBaseUnits } from "../market/jupiter.js";
import { getMission, isLive } from "../sim/mission.js";
import { balance } from "../sim/portfolio.js";
import type { ChainId } from "../sim/types.js";
import { getChain } from "../sim/venues/index.js";
import type { ChainAdapter, TokenRef } from "../sim/venues/types.js";
import { requestIntent, signTx } from "./client.js";
import { erc20Allowance, explorerTx, logLiveTx, NATIVE_RESERVE, rawTokenBalance, solanaBudget } from "./execute.js";
import { livePub, syncHoldings } from "./sync.js";

/** Nativo máximo que puede cobrar un puente EVM como comisión, además de lo enviado. */
const EVM_BRIDGE_FEE_CAP: Record<EvmChainId, bigint> = { base: 500_000_000_000_000n, bsc: 3_000_000_000_000_000n };
/** SOL extra que puede costar un puente desde Solana (cuentas del puente, comisión en SOL). */
const SOLANA_BRIDGE_EXTRA = 20_000_000n;

const isMovable = (chain: ChainAdapter, t: TokenRef) => chain.isCash(t.address) || t.address === chain.native.address;
const lifiToken = (chain: ChainAdapter, t: TokenRef) => (t.address === chain.native.address ? lifi.LIFI_NATIVE[chain.id]! : t.address);
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

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
}) {
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
  const spendable = isNativeIn ? Math.max(0, have - NATIVE_RESERVE[src.id]) : have;
  if (!(a.amount > 0)) throw new Error("La cantidad debe ser positiva");
  if (a.amount > spendable * 1.000001) {
    throw new Error(`Saldo insuficiente: tienes ${have} ${tin.symbol} en ${src.label}` + (isNativeIn ? ` y se reservan ${NATIVE_RESERVE[src.id]} para la red` : ""));
  }
  const nativeLeft = balance(m, src.id, src.native.address) - (isNativeIn ? a.amount : 0);
  if (nativeLeft < NATIVE_RESERVE[src.id] / 4) throw new Error(`No tienes ${src.native.symbol} suficiente para pagar la red en ${src.label}.`);

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
        const data = `0x095ea7b3${spender.toLowerCase().replace(/^0x/, "").padStart(64, "0")}${amountIn.toString(16).padStart(64, "0")}`;
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
    txHash: res.hash,
    explorer: link,
    sent: `${Number(amountIn) / 10 ** tin.decimals} ${tin.symbol} desde ${src.label}`,
    willReceive: `~${amountOut} ${tout.symbol} en ${dst.label}`,
    costs,
    note: `Llega hacia las ${hhmm(arrivesAt)} (lo confirma Li.Fi). Mientras tanto aparece como "en tránsito".`,
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
      const received = st.receivedAmount !== undefined ? Number(st.receivedAmount) / 10 ** t.decimals_in : t.amount_in;
      if (!db.prepare("UPDATE transfers SET status = 'settled', settled_at = ?, amount_in = ? WHERE id = ? AND status = 'pending'").run(now(), received, t.id).changes) continue;
      const summary = `Llegan ${Number(received.toPrecision(8))} ${t.symbol_in} a ${getChain(t.to_venue).label} (puente real #${t.id})`;
      logJournal({
        missionId: t.mission_id,
        sessionId: null,
        kind: "transfer_arrived",
        summary,
        details: st.receivingTxHash ? { txHash: st.receivingTxHash, explorer: explorerTx(t.to_venue, st.receivingTxHash) } : undefined,
      });
      await syncHoldings(t.mission_id).catch(() => undefined);
      log.push(summary);
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


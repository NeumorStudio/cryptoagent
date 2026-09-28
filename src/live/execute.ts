// Swaps con dinero real. Mismo contrato que `swap()` del simulador: `swap()` delega aquí cuando la
// misión es real. Este proceso (el servidor MCP) cotiza, construye la transacción y la reconcilia;
// la firma la hace el firmante, que aplica la política y los límites y, en modo manual, espera a que
// el usuario apruebe la operación en la página de la cartera.
import { db, logJournal, now } from "../db.js";
import { EVM_CHAINS, NATIVE, rpcBatch, type EvmChainId } from "../market/evm.js";
import { fetchJson } from "../market/http.js";
import { SOL_MINT, fromBaseUnits, getQuote, toBaseUnits } from "../market/jupiter.js";
import { getMission, isLive } from "../sim/mission.js";
import { balance } from "../sim/portfolio.js";
import { recordTrade } from "../sim/positions.js";
import type { ChainId, TradeMeta } from "../sim/types.js";
import { getChain } from "../sim/venues/index.js";
import type { TokenRef } from "../sim/venues/types.js";
import { solanaRpc } from "./chain.js";
import { requestIntent, signTx } from "./client.js";
import { livePub, syncHoldings } from "./sync.js";

/** Nativo que se deja siempre para pagar la red de las siguientes transacciones. */
export const NATIVE_RESERVE: Record<ChainId, number> = { solana: 0.01, base: 0.0003, bsc: 0.002 };
/** Tope de la prioridad que se paga en Solana por transacción (0,001 SOL). */
const SOLANA_MAX_PRIORITY_LAMPORTS = 1_000_000;

export const explorerTx = (chain: ChainId, hash: string) =>
  chain === "solana" ? `https://solscan.io/tx/${hash}` : chain === "base" ? `https://basescan.org/tx/${hash}` : `https://bscscan.com/tx/${hash}`;

export function logLiveTx(missionId: number, chain: ChainId, kind: string, status: string, summary: string, extra: { hash?: string; usd?: number; error?: string } = {}) {
  db.prepare("INSERT INTO live_txs (ts, mission_id, chain, kind, status, summary, tx_hash, explorer_url, usd, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    now(),
    missionId,
    chain,
    kind,
    status,
    summary,
    extra.hash ?? null,
    extra.hash ? explorerTx(chain, extra.hash) : null,
    extra.usd ?? null,
    extra.error ?? null,
  );
}

export interface LiveSwapArgs {
  missionId: number;
  sessionId: number | null;
  chain: ChainId;
  input: string;
  output: string;
  amount?: number;
  sellAll?: boolean;
  slippageBps: number;
  reasoning: string;
  meta?: TradeMeta;
}

export async function liveSwap(args: LiveSwapArgs) {
  const mission = getMission(args.missionId);
  if (!isLive(mission)) throw new Error("liveSwap solo sirve para misiones reales");
  const chain = getChain(args.chain);
  const m = args.missionId;
  const [input, output] = await Promise.all([chain.resolveToken(args.input), chain.resolveToken(args.output)]);
  if (input.address === output.address) throw new Error("El token de entrada y salida son el mismo");
  const evmChain = chain.id === "solana" ? null : (chain.id as EvmChainId);
  // Saldos del momento, leídos de la cadena (incluidos los dos tokens del swap).
  await syncHoldings(m, evmChain ? { [evmChain]: [input, output].filter((t) => t.address !== NATIVE) } : {});

  const have = balance(m, chain.id, input.address);
  const isNativeIn = input.address === chain.native.address;
  const spendable = isNativeIn ? Math.max(0, have - NATIVE_RESERVE[chain.id]) : have;
  let amount = args.sellAll ? spendable : (args.amount ?? 0);
  if (!(amount > 0)) throw new Error(args.sellAll ? `No tienes ${input.symbol} que vender en ${chain.label}` : "La cantidad debe ser positiva (o usa sell_all)");
  if (amount > spendable * 1.000001) {
    throw new Error(
      `Saldo insuficiente: tienes ${have} ${input.symbol}` + (isNativeIn ? ` y se reservan ${NATIVE_RESERVE[chain.id]} para pagar la red` : "") + `; quieres vender ${amount}`,
    );
  }
  amount = Math.min(amount, spendable);
  const nativeLeft = balance(m, chain.id, chain.native.address) - (isNativeIn ? amount : 0);
  if (nativeLeft < NATIVE_RESERVE[chain.id] / 4) {
    throw new Error(`No tienes ${chain.native.symbol} suficiente para pagar la red en ${chain.label} (tienes ${nativeLeft.toPrecision(3)}).`);
  }

  // Cotización para describir la operación y medir su tamaño.
  const quote = await chain.quote({ input, output, amountIn: amount, slippageBps: args.slippageBps });
  let usd = chain.isCash(input.address) ? amount : chain.isCash(output.address) ? quote.amountOut : 0;
  if (!usd) {
    const prices = await chain.priceUsd([input.address, output.address]).catch(() => ({}) as Record<string, number>);
    usd = (prices[input.address] ?? 0) * amount || (prices[output.address] ?? 0) * quote.amountOut;
  }
  const side = chain.isCash(output.address) ? "sell" : "buy";
  const summary =
    `${side === "sell" ? "Vender" : "Comprar"}: ${Number(amount.toPrecision(6))} ${input.symbol} → ~${Number(quote.amountOut.toPrecision(6))} ${output.symbol} ` +
    `en ${chain.label} (≈ ${usd.toFixed(2)} $). Motivo: ${args.reasoning.slice(0, 160)}`;

  let ticket: string;
  try {
    ticket = await requestIntent({ missionId: m, chain: chain.id, side, usd, summary });
  } catch (err) {
    logLiveTx(m, chain.id, "swap", "rejected", summary, { usd, error: (err as Error).message });
    throw err;
  }

  // La transacción se construye tras la aprobación, con un precio del momento.
  const pub = livePub();
  // Cantidad en unidades base: al venderlo todo, el saldo exacto de la cadena (un decimal redondeado
  // hacia arriba haría fallar la transacción); si no, un pelo por debajo por la misma razón.
  const amountIn =
    !isNativeIn && amount >= have * 0.999999
      ? await rawTokenBalance(chain.id, pub, input)
      : toBaseUnits(amount * (1 - 1e-9), input.decimals);
  if (amountIn <= 0n) throw new Error(`No tienes ${input.symbol} en ${chain.label}`);
  let res: { hash: string; ok: boolean; error?: string };
  let pre: Record<string, bigint> | null = null;
  if (chain.id === "solana") {
    const q = await getQuote(input.address, output.address, amountIn, args.slippageBps, 0);
    const built = await fetchJson<{ swapTransaction?: string; error?: string }>("https://lite-api.jup.ag/swap/v1/swap", {
      method: "POST",
      ttlMs: 0,
      body: {
        quoteResponse: q,
        userPublicKey: pub.solana,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: SOLANA_MAX_PRIORITY_LAMPORTS, priorityLevel: "high" } },
      },
    });
    if (!built.swapTransaction) throw new Error(`Jupiter no construyó la transacción: ${built.error ?? "sin respuesta"}`);
    res = await signTx({ ticket, chain: "solana", kind: "swap", usd, solanaTx: built.swapTransaction, budget: solanaBudget(input, amountIn) });
  } else {
    const c = EVM_CHAINS[evmChain!];
    const headers = { "x-client-id": "cryptoagent" };
    const route = await fetchJson<{ code: number; message?: string; data?: { routeSummary: unknown; routerAddress: string } }>(
      `https://aggregator-api.kyberswap.com/${c.kyber}/api/v1/routes?tokenIn=${input.address}&tokenOut=${output.address}&amountIn=${amountIn}&gasInclude=true`,
      { headers, ttlMs: 0 },
    );
    if (route.code !== 0 || !route.data) throw new Error(`KyberSwap no encuentra ruta: ${route.message ?? route.code}`);
    const built = await fetchJson<{ code: number; message?: string; data?: { data: string; routerAddress: string; transactionValue: string; amountIn: string } }>(
      `https://aggregator-api.kyberswap.com/${c.kyber}/api/v1/route/build`,
      {
        method: "POST",
        ttlMs: 0,
        headers,
        body: { routeSummary: route.data.routeSummary, sender: pub.evm, recipient: pub.evm, slippageTolerance: args.slippageBps, enableGasEstimation: false },
      },
    );
    if (built.code !== 0 || !built.data) throw new Error(`KyberSwap no construyó la transacción: ${built.message ?? built.code}`);
    const router = built.data.routerAddress;
    // Approve de la cantidad exacta si el router no puede gastar aún ese token.
    if (!isNativeIn) {
      const allowance = await erc20Allowance(evmChain!, input.address, pub.evm, router);
      if (allowance < amountIn) {
        const data = `0x095ea7b3${pad32(router)}${amountIn.toString(16).padStart(64, "0")}`;
        const ap = await signTx({ ticket, chain: chain.id, kind: "approve", usd, evmTx: { chainId: c.chainId, to: input.address, data, value: "0" } });
        logLiveTx(m, chain.id, "approve", ap.ok ? "confirmed" : "failed", `Approve de ${amount} ${input.symbol} al router de KyberSwap`, { hash: ap.hash, error: ap.error });
        if (!ap.ok) throw new Error(`El approve falló (${explorerTx(chain.id, ap.hash)}): ${ap.error}`);
      }
    }
    pre = await evmBalancesAt(evmChain!, pub.evm, [input, output], "latest");
    res = await signTx({
      ticket,
      chain: chain.id,
      kind: "swap",
      usd,
      evmTx: { chainId: c.chainId, to: router, data: built.data.data, value: built.data.transactionValue },
      evmLimits: { maxValue: (isNativeIn ? amountIn : 0n).toString() },
    });
  }

  const link = explorerTx(chain.id, res.hash);
  if (!res.ok) {
    logLiveTx(m, chain.id, "swap", "failed", summary, { hash: res.hash, usd, error: res.error });
    logJournal({ missionId: m, sessionId: args.sessionId, kind: "failed_tx", summary: `Swap REAL fallido en ${chain.label}: ${res.error}`, reasoning: args.reasoning, details: { chain: chain.id, txHash: res.hash, explorer: link } });
    await syncHoldings(m).catch(() => undefined);
    throw new Error(`La transacción falló: ${res.error}. ${link}`);
  }

  // Lo que de verdad salió y entró (no la cotización).
  const real = await reconcile(chain.id, res.hash, pub, input, output, pre).catch((err) => {
    console.error(`No se pudo reconciliar ${res.hash}: ${(err as Error).message}`);
    return { sold: amount, received: quote.amountOut, networkFee: null as string | null, estimated: true };
  });
  logLiveTx(m, chain.id, "swap", "confirmed", summary, { hash: res.hash, usd });
  const result = {
    chain: chain.id,
    real: true,
    txHash: res.hash,
    explorer: link,
    sold: `${real.sold} ${input.symbol}`,
    received: `${real.received} ${output.symbol}`,
    effectivePrice: `1 ${output.symbol} = ${(real.sold / real.received).toPrecision(6)} ${input.symbol}`,
    ...(real.networkFee ? { networkFee: real.networkFee } : {}),
    ...("estimated" in real ? { note: "Cantidades estimadas con la cotización: no se pudo leer la transacción todavía" } : {}),
    route: quote.route,
  };
  logJournal({
    missionId: m,
    sessionId: args.sessionId,
    kind: "swap",
    summary: `Swap REAL ${Number(real.sold.toPrecision(6))} ${input.symbol} → ${Number(real.received.toPrecision(6))} ${output.symbol}${chain.id === "solana" ? "" : ` en ${chain.label}`}`,
    reasoning: args.reasoning,
    details: { inputMint: input.address, outputMint: output.address, ...result },
  });
  const valueUsd = chain.isCash(input.address) ? real.sold : chain.isCash(output.address) ? real.received : usd;
  await recordTrade({
    missionId: m,
    venue: chain.id,
    sold: { asset: input.address, qty: real.sold },
    bought: { asset: output.address, symbol: output.symbol, qty: real.received },
    valueUsd,
    meta: args.meta,
  }).catch((err) => console.error(`No se pudo registrar la posición: ${(err as Error).message}`));
  await syncHoldings(m, evmChain ? { [evmChain]: [output].filter((t) => t.address !== NATIVE) } : {}).catch(() => undefined);
  return result;
}

/** Holgura de SOL por transacción: comisión, prioridad (≤ 0,001) y la renta de un par de cuentas nuevas. */
export const SOLANA_FEE_ALLOWANCE = 10_000_000n;

/** Lo máximo que puede bajar la cartera de Solana en una operación que gasta `amountIn` de `input`. */
export function solanaBudget(input: TokenRef, amountIn: bigint, extraLamports = 0n) {
  const isSol = input.address === SOL_MINT;
  return {
    lamports: ((isSol ? amountIn : 0n) + SOLANA_FEE_ALLOWANCE + extraLamports).toString(),
    tokens: isSol ? {} : { [input.address]: amountIn.toString() },
  };
}

// ─── Reconciliación ─────────────────────────────────────────────────────────

const pad32 = (addr: string) => addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");

export async function rawTokenBalance(chain: ChainId, pub: { solana: string; evm: string }, token: TokenRef): Promise<bigint> {
  if (chain !== "solana") return (await evmBalancesAt(chain as EvmChainId, pub.evm, [token], "latest"))[token.address]!;
  const { value } = await solanaRpc<{ value: Array<{ account: { data: { parsed: { info: { tokenAmount: { amount: string } } } } } }> }>(
    "getTokenAccountsByOwner",
    [pub.solana, { mint: token.address }, { encoding: "jsonParsed" }],
    0,
  );
  return value.reduce((s, a) => s + BigInt(a.account.data.parsed.info.tokenAmount.amount), 0n);
}

export async function erc20Allowance(chain: EvmChainId, token: string, owner: string, spender: string): Promise<bigint> {
  const [hex] = (await rpcBatch(chain, [{ method: "eth_call", params: [{ to: token, data: `0xdd62ed3e${pad32(owner)}${pad32(spender)}` }, "latest"] }])) as [string];
  return hex && hex !== "0x" ? BigInt(hex) : 0n;
}

async function evmBalancesAt(chain: EvmChainId, owner: string, tokens: TokenRef[], block: string): Promise<Record<string, bigint>> {
  const calls = tokens.map((t) =>
    t.address === NATIVE
      ? { method: "eth_getBalance", params: [owner, block] }
      : { method: "eth_call", params: [{ to: t.address, data: `0x70a08231${pad32(owner)}` }, block] },
  );
  const out = (await rpcBatch(chain, calls)) as string[];
  return Object.fromEntries(tokens.map((t, i) => [t.address, out[i] && out[i] !== "0x" ? BigInt(out[i]!) : 0n]));
}

async function reconcile(chain: ChainId, hash: string, pub: { solana: string; evm: string }, input: TokenRef, output: TokenRef, pre: Record<string, bigint> | null) {
  if (chain === "solana") {
    let tx: any = null;
    for (let i = 0; i < 10 && !tx; i++) {
      tx = await solanaRpc("getTransaction", [hash, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" }], 0);
      if (!tx) await new Promise((r) => setTimeout(r, 1_500));
    }
    if (!tx?.meta) throw new Error("transacción no disponible");
    const fee = Number(tx.meta.fee);
    const tokenDelta = (mint: string) => {
      const sum = (list: any[]) =>
        list.filter((b) => b.owner === pub.solana && b.mint === mint).reduce((s, b) => s + Number(b.uiTokenAmount.amount), 0);
      return sum(tx.meta.postTokenBalances ?? []) - sum(tx.meta.preTokenBalances ?? []);
    };
    // El SOL cuenta la comisión de red (y la renta de cuentas nuevas): para medir el swap se descuenta la comisión.
    const solDelta = Number(tx.meta.postBalances[0]) - Number(tx.meta.preBalances[0]) + fee;
    const delta = (t: TokenRef) => (t.address === SOL_MINT ? solDelta / 1e9 : tokenDelta(t.address) / 10 ** t.decimals);
    return { sold: -delta(input), received: delta(output), networkFee: `${fee / 1e9} SOL` };
  }
  const c = chain as EvmChainId;
  const [receipt] = (await rpcBatch(c, [{ method: "eth_getTransactionReceipt", params: [hash] }])) as [any];
  const block = receipt.blockNumber as string;
  const post = await evmBalancesAt(c, pub.evm, [input, output], block);
  const before = pre ?? (await evmBalancesAt(c, pub.evm, [input, output], "0x" + (BigInt(block) - 1n).toString(16)));
  const gas = BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice) + (receipt.l1Fee ? BigInt(receipt.l1Fee) : 0n);
  const delta = (t: TokenRef) => {
    let d = post[t.address]! - before[t.address]!;
    if (t.address === NATIVE) d += gas; // el nativo también pagó la red
    return fromBaseUnits(d < 0n ? -d : d, t.decimals) * (d < 0n ? -1 : 1);
  };
  return { sold: -delta(input), received: delta(output), networkFee: `${fromBaseUnits(gas, 18)} ${getChain(chain).native.symbol}` };
}

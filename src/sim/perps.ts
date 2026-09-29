// Futuros perpetuos simulados con datos reales de Hyperliquid (precio mark, funding horario, apalancamiento
// máximo por moneda). Se puede ir largo (gana si sube) o corto (gana si baja) con apalancamiento.
//
// Cómo se simula:
// - El margen sale del efectivo (USDC/USDT) de una de tus cadenas y vuelve a ella al cerrar. Mover el
//   dinero a Hyperliquid y de vuelta cuesta como un depósito y una retirada reales (≈0,3 $ + 1 $).
// - Comisión taker del 0,045 % del nocional al abrir y al cerrar, y funding cada hora (a prorrata).
// - Liquidación con margen aislado: si el capital de la posición (margen + resultado − funding) baja del
//   mantenimiento (la mitad del margen inicial al apalancamiento máximo), se pierde el margen.
// - Lo que no se simula: el slippage exacto en momentos de mucha volatilidad, las cascadas y el ADL.
import { db, logJournal, now } from "../db.js";
import { perpMarket, perpMarkets } from "../market/hyperliquid.js";
import { applyDeltas, assertSimulated, balance } from "./portfolio.js";
import type { ChainId, TradeMeta } from "./types.js";
import { allChains, getChain } from "./venues/index.js";

export const PERP_TAKER_FEE = 0.00045;
export const PERP_DEPOSIT_FEE_USD = 0.3;
export const PERP_WITHDRAW_FEE_USD = 1;
/** Hyperliquid pide órdenes de al menos 10 $ de nocional. */
export const PERP_MIN_NOTIONAL_USD = 10;

export interface PerpRow {
  id: number;
  mission_id: number;
  position_id: number | null;
  coin: string;
  side: "long" | "short";
  leverage: number;
  margin_usd: number;
  size: number;
  entry_price: number;
  from_chain: ChainId;
  take_profit: number | null;
  stop_loss: number | null;
  fees_usd: number;
  funding_usd: number;
  last_funding_at: string;
  opened_at: string;
  status: string;
}

const dir = (p: Pick<PerpRow, "side">) => (p.side === "long" ? 1 : -1);

/** Resultado sin realizar a un precio dado (sin comisiones ni funding). */
const upnl = (p: PerpRow, mark: number) => dir(p) * p.size * (mark - p.entry_price);

/** Capital de la posición: margen + resultado − funding pagado. */
export const equity = (p: PerpRow, mark: number) => p.margin_usd + upnl(p, mark) - p.funding_usd;

/** Precio al que se liquidaría (aprox., sin contar el funding futuro). */
export function liquidationPrice(p: Pick<PerpRow, "side" | "size" | "entry_price" | "margin_usd" | "funding_usd">, maxLeverage: number) {
  const mmRate = 1 / (2 * maxLeverage);
  // margin + dir·size·(liq − entry) − funding = mmRate·size·liq
  const d = dir(p);
  return (p.margin_usd - p.funding_usd - d * p.size * p.entry_price) / (mmRate * p.size - d * p.size);
}

/** Efectivo disponible por cadena (USDC/USDT). */
function cashByChain(missionId: number) {
  return allChains().map((c) => ({ chain: c, cash: balance(missionId, c.id, c.cash.address) }));
}

export async function openPerp(a: {
  missionId: number;
  sessionId: number | null;
  coin: string;
  side: "long" | "short";
  leverage: number;
  marginUsd: number;
  fromChain?: ChainId;
  takeProfit?: number;
  stopLoss?: number;
  reasoning: string;
  meta?: TradeMeta;
}) {
  assertSimulated(a.missionId, "operar con futuros");
  const m = await perpMarket(a.coin);
  if (!(a.leverage >= 1) || a.leverage > m.maxLeverage) throw new Error(`Apalancamiento no válido para ${m.coin}: entre 1 y ${m.maxLeverage}x`);
  if (!(a.marginUsd > 0)) throw new Error("El margen debe ser positivo");
  const notional = a.marginUsd * a.leverage;
  if (notional < PERP_MIN_NOTIONAL_USD) throw new Error(`Hyperliquid pide al menos ${PERP_MIN_NOTIONAL_USD} $ de nocional (margen × apalancamiento)`);
  // El margen sale del efectivo de una cadena: la indicada o la que más tenga.
  const source = a.fromChain ? cashByChain(a.missionId).find((x) => x.chain.id === a.fromChain) : cashByChain(a.missionId).sort((x, y) => y.cash - x.cash)[0];
  if (!source) throw new Error(`No existe la cadena ${a.fromChain}`);
  const debit = a.marginUsd + PERP_DEPOSIT_FEE_USD;
  if (source.cash + 1e-9 < debit) {
    throw new Error(`Efectivo insuficiente en ${source.chain.label}: tienes ${source.cash.toFixed(2)} ${source.chain.cash.symbol} y hacen falta ${debit.toFixed(2)} (margen + depósito)`);
  }
  if (a.side === "long" && a.stopLoss && a.stopLoss >= m.markPx) throw new Error("En un largo, el stop va por debajo del precio actual");
  if (a.side === "short" && a.stopLoss && a.stopLoss <= m.markPx) throw new Error("En un corto, el stop va por encima del precio actual");
  const size = notional / m.markPx;
  const fee = notional * PERP_TAKER_FEE;
  applyDeltas(a.missionId, source.chain.id, [{ asset: source.chain.cash.address, symbol: source.chain.cash.symbol, decimals: source.chain.cash.decimals, amount: -debit }]);
  const margin = a.marginUsd - fee;
  const label = `${m.coin}-PERP ${a.side === "long" ? "largo" : "corto"} ${a.leverage}x`;
  const positionId = Number(
    db
      .prepare(
        `INSERT INTO positions (mission_id, venue, asset, symbol, opened_at, qty_open, cost_open_usd, entry_features, research, thesis, lessons_applied, beliefs_applied)
         VALUES (?, 'hyperliquid', ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?)`,
      )
      .run(
        a.missionId,
        `${m.coin}-PERP-${a.side}`,
        label,
        now(),
        size,
        a.marginUsd + PERP_DEPOSIT_FEE_USD,
        JSON.stringify({ venue: "hyperliquid", strategy: "perp", coin: m.coin, side: a.side, leverage: a.leverage, fundingHourlyPct: m.fundingHourly * 100 }),
        a.meta?.thesis ?? null,
        a.meta?.lessonsApplied ?? null,
        a.meta?.beliefsApplied?.length ? JSON.stringify(a.meta.beliefsApplied) : null,
      ).lastInsertRowid,
  );
  const id = Number(
    db
      .prepare(
        `INSERT INTO perp_positions (mission_id, position_id, coin, side, leverage, margin_usd, size, entry_price, from_chain, take_profit, stop_loss, fees_usd, last_funding_at, opened_at, reasoning)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(a.missionId, positionId, m.coin, a.side, a.leverage, margin, size, m.markPx, source.chain.id, a.takeProfit ?? null, a.stopLoss ?? null, fee, now(), now(), a.reasoning)
      .lastInsertRowid,
  );
  const row = db.prepare("SELECT * FROM perp_positions WHERE id = ?").get(id) as unknown as PerpRow;
  const liq = liquidationPrice(row, m.maxLeverage);
  const result = {
    perpId: id,
    position: label,
    entryPrice: m.markPx,
    size: Number(size.toPrecision(6)),
    notionalUsd: Number(notional.toFixed(2)),
    marginUsd: Number(margin.toFixed(2)),
    liquidationPrice: Number(liq.toPrecision(6)),
    fundingHourlyPct: Number((m.fundingHourly * 100).toFixed(5)),
    costs: [`depósito: ${PERP_DEPOSIT_FEE_USD} $`, `comisión: ${fee.toFixed(4)} $`, `al cerrar: comisión similar + retirada ${PERP_WITHDRAW_FEE_USD} $`],
    ...(a.takeProfit ? { takeProfit: a.takeProfit } : {}),
    ...(a.stopLoss ? { stopLoss: a.stopLoss } : {}),
  };
  logJournal({
    missionId: a.missionId,
    sessionId: a.sessionId,
    kind: "perp",
    summary: `Abre ${label}: margen ${a.marginUsd} $ (nocional ${notional.toFixed(0)} $) a ${m.markPx}; liquidación ≈ ${liq.toPrecision(5)}`,
    reasoning: a.reasoning,
    details: { chain: "hyperliquid", ...result },
  });
  return result;
}

/** Cobra el funding desde la última vez (a prorrata por horas). */
function accrueFunding(p: PerpRow, mark: number, fundingHourly: number) {
  const hours = (Date.now() - new Date(p.last_funding_at).getTime()) / 3_600_000;
  if (hours <= 0) return p;
  const paid = dir(p) * p.size * mark * fundingHourly * hours;
  db.prepare("UPDATE perp_positions SET funding_usd = funding_usd + ?, last_funding_at = ? WHERE id = ?").run(paid, now(), p.id);
  return { ...p, funding_usd: p.funding_usd + paid, last_funding_at: now() };
}

function settle(p: PerpRow, mark: number, reason: string, liquidated: boolean, sessionId: number | null) {
  if (!db.prepare("UPDATE perp_positions SET status = 'closing' WHERE id = ? AND status = 'open'").run(p.id).changes) return null;
  const closeFee = liquidated ? 0 : p.size * mark * PERP_TAKER_FEE;
  const eq = liquidated ? 0 : Math.max(0, equity(p, mark) - closeFee);
  const returned = eq > PERP_WITHDRAW_FEE_USD ? eq - PERP_WITHDRAW_FEE_USD : 0;
  const chain = getChain(p.from_chain);
  if (returned > 0) applyDeltas(p.mission_id, chain.id, [{ asset: chain.cash.address, symbol: chain.cash.symbol, decimals: chain.cash.decimals, amount: returned }]);
  db.prepare("UPDATE perp_positions SET status = ?, closed_at = ?, exit_price = ?, returned_usd = ?, fees_usd = fees_usd + ? WHERE id = ?").run(
    liquidated ? "liquidated" : "closed",
    now(),
    mark,
    returned,
    closeFee,
    p.id,
  );
  if (p.position_id) {
    db.prepare(
      `UPDATE positions SET qty_open = 0, realized_cost_usd = realized_cost_usd + cost_open_usd, cost_open_usd = 0, realized_proceeds_usd = ?,
         status = 'closed', closed_at = ?, exit_reason = ? WHERE id = ?`,
    ).run(returned, now(), reason, p.position_id);
  }
  const label = `${p.coin}-PERP ${p.side === "long" ? "largo" : "corto"} ${p.leverage}x`;
  const pnl = returned - (p.margin_usd + p.fees_usd + PERP_DEPOSIT_FEE_USD);
  const summary = `${liquidated ? "LIQUIDADO" : "Cierra"} ${label} a ${mark}: vuelven ${returned.toFixed(2)} $ a ${chain.label} (${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} $, funding ${p.funding_usd.toFixed(4)} $)`;
  logJournal({ missionId: p.mission_id, sessionId, kind: "perp", summary, reasoning: reason, details: { chain: "hyperliquid", perpId: p.id, exitPrice: mark, returnedUsd: returned, liquidated } });
  return { perpId: p.id, position: label, exitPrice: mark, returnedUsd: Number(returned.toFixed(2)), pnlUsd: Number(pnl.toFixed(2)), fundingUsd: Number(p.funding_usd.toFixed(4)), liquidated };
}

export async function closePerp(a: { missionId: number; sessionId: number | null; perpId: number; reasoning: string }) {
  const p = db.prepare("SELECT * FROM perp_positions WHERE id = ? AND mission_id = ? AND status = 'open'").get(a.perpId, a.missionId) as unknown as PerpRow | undefined;
  if (!p) throw new Error(`El futuro #${a.perpId} no existe, no es de tu misión o ya está cerrado`);
  const m = await perpMarket(p.coin);
  const r = settle(accrueFunding(p, m.markPx, m.fundingHourly), m.markPx, a.reasoning, false, a.sessionId);
  if (!r) throw new Error(`El futuro #${a.perpId} ya se está cerrando`);
  return r;
}

/**
 * Pone, cambia o quita (0) la toma de beneficio y el stop de un futuro ya abierto. Hasta ahora solo se podían
 * fijar al abrir, cuando aún no se sabe el precio de entrada real (lo pidió el trader en la M9 de la v0.35.5).
 */
export async function setPerpExits(a: { missionId: number; sessionId: number | null; perpId: number; takeProfit?: number; stopLoss?: number; reasoning: string }) {
  const p = db.prepare("SELECT * FROM perp_positions WHERE id = ? AND mission_id = ? AND status = 'open'").get(a.perpId, a.missionId) as unknown as PerpRow | undefined;
  if (!p) throw new Error(`El futuro #${a.perpId} no existe, no es de tu misión o ya está cerrado`);
  if (a.takeProfit === undefined && a.stopLoss === undefined) throw new Error("Indica take_profit, stop_loss o los dos (0 para quitarlo)");
  const { markPx } = await perpMarket(p.coin);
  const long = p.side === "long";
  if (a.takeProfit && (long ? a.takeProfit <= markPx : a.takeProfit >= markPx)) {
    throw new Error(`En un ${long ? "largo" : "corto"}, la toma de beneficio va ${long ? "por encima" : "por debajo"} del precio actual (${markPx})`);
  }
  if (a.stopLoss && (long ? a.stopLoss >= markPx : a.stopLoss <= markPx)) {
    throw new Error(`En un ${long ? "largo" : "corto"}, el stop va ${long ? "por debajo" : "por encima"} del precio actual (${markPx})`);
  }
  const tp = a.takeProfit === undefined ? p.take_profit : a.takeProfit || null;
  const sl = a.stopLoss === undefined ? p.stop_loss : a.stopLoss || null;
  db.prepare("UPDATE perp_positions SET take_profit = ?, stop_loss = ? WHERE id = ?").run(tp, sl, p.id);
  const label = `${p.coin}-PERP ${long ? "largo" : "corto"} ${p.leverage}x`;
  const summary = `Salidas de ${label} (#${p.id}): take profit ${tp ?? "ninguno"}, stop ${sl ?? "ninguno"}`;
  logJournal({ missionId: a.missionId, sessionId: a.sessionId, kind: "perp", summary, reasoning: a.reasoning, details: { perpId: p.id, takeProfit: tp, stopLoss: sl, markPrice: markPx } });
  return { perpId: p.id, position: label, entryPrice: p.entry_price, markPrice: markPx, takeProfit: tp, stopLoss: sl };
}

/** Futuros abiertos de una misión con su situación actual (para la cartera y la valoración). */
export async function openPerps(missionId: number) {
  const rows = db.prepare("SELECT * FROM perp_positions WHERE mission_id = ? AND status = 'open' ORDER BY id").all(missionId) as unknown as PerpRow[];
  if (!rows.length) return [];
  const markets = await perpMarkets();
  return rows.map((p) => {
    const m = markets.get(p.coin);
    const mark = m?.markPx ?? p.entry_price;
    const eq = equity(p, mark);
    return {
      perpId: p.id,
      position: `${p.coin}-PERP ${p.side === "long" ? "largo" : "corto"} ${p.leverage}x`,
      entryPrice: p.entry_price,
      markPrice: mark,
      marginUsd: Number(p.margin_usd.toFixed(2)),
      equityUsd: Number(Math.max(0, eq).toFixed(2)),
      pnlPct: Number(((eq / p.margin_usd - 1) * 100).toFixed(1)),
      liquidationPrice: m ? Number(liquidationPrice(p, m.maxLeverage).toPrecision(6)) : null,
      fundingPaidUsd: Number(p.funding_usd.toFixed(4)),
      ...(p.take_profit ? { takeProfit: p.take_profit } : {}),
      ...(p.stop_loss ? { stopLoss: p.stop_loss } : {}),
      /** Lo que volvería a tu cadena si cierras ahora (tras la comisión y la retirada). */
      valueIfClosedUsd: Number(Math.max(0, eq - p.size * mark * PERP_TAKER_FEE - PERP_WITHDRAW_FEE_USD).toFixed(2)),
    };
  });
}

/** Vigilancia: funding, liquidaciones y take profit / stop loss. Devuelve líneas de log. */
export async function checkPerps(): Promise<string[]> {
  const rows = db
    .prepare("SELECT p.* FROM perp_positions p JOIN missions m ON m.id = p.mission_id WHERE p.status = 'open' AND m.status IN ('active', 'closing')")
    .all() as unknown as PerpRow[];
  if (!rows.length) return [];
  const markets = await perpMarkets();
  const log: string[] = [];
  for (const row of rows) {
    const m = markets.get(row.coin);
    if (!m) continue;
    const p = accrueFunding(row, m.markPx, m.fundingHourly);
    const mm = p.size * m.markPx * (1 / (2 * m.maxLeverage));
    if (equity(p, m.markPx) <= mm) {
      const r = settle(p, m.markPx, `Liquidación: el capital de la posición bajó del mantenimiento`, true, null);
      if (r) log.push(`Futuro #${p.id} liquidado a ${m.markPx}`);
      continue;
    }
    const hitTp = p.take_profit && (p.side === "long" ? m.markPx >= p.take_profit : m.markPx <= p.take_profit);
    const hitSl = p.stop_loss && (p.side === "long" ? m.markPx <= p.stop_loss : m.markPx >= p.stop_loss);
    if (hitTp || hitSl) {
      const r = settle(p, m.markPx, hitTp ? `Take profit a ${p.take_profit}` : `Stop loss a ${p.stop_loss}`, false, null);
      if (r) log.push(`Futuro #${p.id} cerrado por ${hitTp ? "take profit" : "stop loss"} a ${m.markPx}`);
    }
  }
  return log;
}

/** Cierra todos los futuros de una misión (al terminar o al pararla). Devuelve lo que no se pudo cerrar. */
export async function closeAllPerps(missionId: number, reason: string): Promise<string[]> {
  const rows = db.prepare("SELECT id, coin FROM perp_positions WHERE mission_id = ? AND status = 'open'").all(missionId) as Array<{ id: number; coin: string }>;
  const problems: string[] = [];
  for (const r of rows) await closePerp({ missionId, sessionId: null, perpId: r.id, reasoning: reason }).catch((e) => problems.push(`${r.coin}-PERP: ${(e as Error).message}`));
  return problems;
}

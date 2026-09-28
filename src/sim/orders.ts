// Órdenes condicionales (trigger orders): cuando el precio real cruza el disparador,
// se ejecuta la operación a mercado con los datos reales de ese instante, igual que
// una orden stop-market o las trigger orders de Jupiter. Las comprueba un vigilante
// periódico (watcher.ts y el servidor MCP mientras está activo).
import { db, logJournal, now } from "../db.js";
import * as binance from "../market/binance.js";
import { binanceMarketOrder, swap } from "./portfolio.js";
import type { ChainId, VenueId } from "./types.js";
import { settleTransfers } from "./transfers.js";
import { getVenue } from "./venues/index.js";

/** Swap en una cadena (el campo `venue` de la orden indica cuál). */
export interface SwapAction {
  input: string;
  output: string;
  /** Cantidad del token de entrada; se ignora con `sellAll`. */
  amount: number;
  /** Vender todo el saldo del token de entrada en el momento de dispararse. */
  sellAll?: boolean;
  slippageBps: number;
}
export interface BinanceAction {
  symbol: string;
  side: "BUY" | "SELL";
  amount: number;
}

interface OrderRow {
  id: number;
  mission_id: number;
  session_id: number | null;
  venue: VenueId;
  trigger_asset: string;
  trigger_label: string;
  condition: "above" | "below" | "time";
  trigger_price: number;
  action: string;
  reasoning: string | null;
  expires_at: string | null;
  status: string;
}

const currentPrice = (venue: VenueId, asset: string) => getVenue(venue).triggerPrice(asset);

const isTriggered = (condition: "above" | "below", price: number, trigger: number) =>
  condition === "above" ? price >= trigger : price <= trigger;

function describeAction(venue: VenueId, action: SwapAction | BinanceAction): string {
  const v = getVenue(venue);
  if (v.kind === "chain") {
    const a = action as SwapAction;
    return `swap en ${v.label} ${a.sellAll ? "todo el saldo de" : a.amount} ${a.input} → ${a.output}`;
  }
  const a = action as BinanceAction;
  return `Binance ${a.side} ${a.symbol} amount=${a.amount}`;
}

const hms = (ms: number) => new Date(ms).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/**
 * Deja una orden condicional. Por precio (above/below: cuando el precio cruza trigger_price) o por tiempo
 * (time: dentro de inMinutes, pase lo que pase con el precio; p. ej. "si no ha saltado la toma de
 * beneficio, vende todo a los 3 minutos"). En las de tiempo, trigger_price guarda la hora en milisegundos.
 */
export async function placeOrder(args: {
  missionId: number;
  sessionId: number | null;
  venue: VenueId;
  triggerAsset?: string;
  condition: "above" | "below" | "time";
  triggerPrice?: number;
  inMinutes?: number;
  action: SwapAction | BinanceAction;
  expiresHours?: number;
  reasoning: string;
}) {
  const venue = getVenue(args.venue);
  if (args.condition === "time") return placeTimeOrder({ ...args, venue });
  if (!args.triggerAsset || !(args.triggerPrice! > 0)) throw new Error("Una orden por precio necesita el activo que se vigila y el precio de disparo");
  const triggerPrice = args.triggerPrice!;
  let triggerAsset: string;
  let triggerLabel: string;
  if (venue.kind === "chain") {
    const trigger = await venue.resolveToken(args.triggerAsset!);
    triggerAsset = trigger.address;
    triggerLabel = `${trigger.symbol}/USD`;
    const a = args.action as SwapAction;
    // Valida que los tokens de la operación existen antes de aceptar la orden.
    await Promise.all([venue.resolveToken(a.input), venue.resolveToken(a.output)]);
  } else {
    triggerAsset = (await binance.getSymbolInfo(args.triggerAsset!)).symbol;
    triggerLabel = triggerAsset;
    await binance.getSymbolInfo((args.action as BinanceAction).symbol);
  }

  const price = await currentPrice(args.venue, triggerAsset);
  if (isTriggered(args.condition, price, triggerPrice)) {
    throw new Error(
      `La condición ya se cumple (precio actual de ${triggerLabel}: ${price}). Si quieres operar ahora, usa directamente la operación simulada.`,
    );
  }

  const expiresAt = args.expiresHours ? new Date(Date.now() + args.expiresHours * 3_600_000).toISOString() : null;
  const id = Number(
    db
      .prepare(
        `INSERT INTO orders (created_at, mission_id, session_id, venue, trigger_asset, trigger_label, condition, trigger_price, action, reasoning, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(now(), args.missionId, args.sessionId, args.venue, triggerAsset, triggerLabel, args.condition, triggerPrice, JSON.stringify(args.action), args.reasoning, expiresAt)
      .lastInsertRowid,
  );
  const summary = `Orden #${id}: si ${triggerLabel} ${args.condition === "above" ? "≥" : "≤"} ${triggerPrice} → ${describeAction(args.venue, args.action)}`;
  logJournal({ missionId: args.missionId, sessionId: args.sessionId, kind: "order_placed", summary, reasoning: args.reasoning, details: { id, expiresAt } });
  return { id, summary, currentPrice: price, expiresAt };
}

async function placeTimeOrder(args: {
  missionId: number;
  sessionId: number | null;
  venue: ReturnType<typeof getVenue>;
  inMinutes?: number;
  action: SwapAction | BinanceAction;
  reasoning: string;
}) {
  if (!(args.inMinutes! > 0)) throw new Error("Una orden por tiempo necesita in_minutes: dentro de cuántos minutos se ejecuta");
  // Valida la operación antes de aceptar la orden.
  if (args.venue.kind === "chain") {
    const a = args.action as SwapAction;
    await Promise.all([args.venue.resolveToken(a.input), args.venue.resolveToken(a.output)]);
  } else {
    await binance.getSymbolInfo((args.action as BinanceAction).symbol);
  }
  const at = Date.now() + args.inMinutes! * 60_000;
  const id = Number(
    db
      .prepare(
        `INSERT INTO orders (created_at, mission_id, session_id, venue, trigger_asset, trigger_label, condition, trigger_price, action, reasoning, expires_at)
         VALUES (?, ?, ?, ?, 'time', 'hora', 'time', ?, ?, ?, NULL)`,
      )
      .run(now(), args.missionId, args.sessionId, args.venue.id, at, JSON.stringify(args.action), args.reasoning).lastInsertRowid,
  );
  const summary = `Orden #${id}: a las ${hms(at)} → ${describeAction(args.venue.id, args.action)}`;
  logJournal({ missionId: args.missionId, sessionId: args.sessionId, kind: "order_placed", summary, reasoning: args.reasoning, details: { id, executesAt: new Date(at).toISOString() } });
  return { id, summary, executesAt: new Date(at).toISOString() };
}

export function cancelOrder(missionId: number, id: number, sessionId: number | null) {
  const changed = db
    .prepare("UPDATE orders SET status = 'cancelled', closed_at = ? WHERE id = ? AND mission_id = ? AND status = 'open'")
    .run(now(), id, missionId).changes;
  if (!changed) throw new Error(`La orden #${id} no existe, no es de tu misión o ya no está abierta`);
  logJournal({ missionId, sessionId, kind: "order_cancelled", summary: `Orden #${id} cancelada` });
  return `Orden #${id} cancelada.`;
}

export function listOrders(missionId: number, status: "open" | "closed" | "all", limit = 50) {
  const where = status === "open" ? "AND status = 'open'" : status === "closed" ? "AND status <> 'open'" : "";
  return db
    .prepare(
      `SELECT id, created_at, venue, trigger_label, condition, trigger_price, action, expires_at, status, closed_at, result
       FROM orders WHERE mission_id = ? ${where} ORDER BY id DESC LIMIT ?`,
    )
    .all(missionId, limit)
    .map((o: any) => ({
      ...o,
      ...(o.condition === "time" ? { trigger_label: undefined, trigger_price: undefined, executes_at: new Date(o.trigger_price).toISOString() } : {}),
      action: JSON.parse(o.action),
      result: o.result ? JSON.parse(o.result) : null,
    }));
}

function close(id: number, status: string, result: unknown) {
  db.prepare("UPDATE orders SET status = ?, closed_at = ?, result = ? WHERE id = ?").run(status, now(), JSON.stringify(result), id);
}

/** Revisa las órdenes abiertas y ejecuta las que se hayan disparado. Devuelve líneas de log. */
export async function checkOrders(): Promise<string[]> {
  // Primero, las transferencias que ya han llegado: una orden puede depender de ese saldo.
  const log: string[] = await settleTransfers().catch((err) => [`Error abonando transferencias: ${(err as Error).message}`]);

  const expired = db
    .prepare("SELECT id, mission_id FROM orders WHERE status = 'open' AND expires_at IS NOT NULL AND expires_at < ?")
    .all(now()) as Array<{ id: number; mission_id: number }>;
  for (const { id, mission_id } of expired) {
    if (db.prepare("UPDATE orders SET status = 'expired', closed_at = ? WHERE id = ? AND status = 'open'").run(now(), id).changes) {
      logJournal({ missionId: mission_id, sessionId: null, kind: "order_expired", summary: `Orden #${id} caducada sin ejecutarse` });
      log.push(`Orden #${id} caducada`);
    }
  }

  const open = db
    .prepare("SELECT o.* FROM orders o JOIN missions m ON m.id = o.mission_id WHERE o.status = 'open' AND m.status = 'active'")
    .all() as unknown as OrderRow[];
  const prices = new Map<string, number>();
  for (const order of open) {
    if (order.condition === "time") {
      if (Date.now() < order.trigger_price) continue;
      await execute(order, `Orden por tiempo #${order.id} ejecutada (hora alcanzada: ${hms(order.trigger_price)}). Motivo original: ${order.reasoning ?? "-"}`, null, log);
      continue;
    }
    const key = `${order.venue}:${order.trigger_asset}`;
    try {
      if (!prices.has(key)) prices.set(key, await currentPrice(order.venue, order.trigger_asset));
    } catch (err) {
      log.push(`Sin precio para ${order.trigger_label}: ${(err as Error).message}`);
      continue;
    }
    const price = prices.get(key)!;
    if (!isTriggered(order.condition, price, order.trigger_price)) continue;

    await execute(order, `Orden condicional #${order.id} disparada (${order.trigger_label} = ${price}, condición ${order.condition} ${order.trigger_price}). Motivo original: ${order.reasoning ?? "-"}`, price, log);
  }
  return log;
}

/** Ejecuta una orden disparada (por precio o por tiempo). El reclamo atómico evita ejecutarla dos veces. */
async function execute(order: OrderRow, reasoning: string, price: number | null, log: string[]) {
  if (!db.prepare("UPDATE orders SET status = 'executing' WHERE id = ? AND status = 'open'").run(order.id).changes) return;
  const seen = price === null ? { executedAt: now() } : { triggerPriceSeen: price };
  try {
    const action = JSON.parse(order.action);
    const base = {
      missionId: order.mission_id,
      sessionId: order.session_id,
      reasoning,
      meta: { exitReason: `orden condicional #${order.id}`, thesis: order.reasoning ?? undefined },
    };
    const result =
      getVenue(order.venue).kind === "chain"
        ? await swap({ ...base, chain: order.venue as ChainId, ...(action as SwapAction) })
        : await binanceMarketOrder({ ...base, ...(action as BinanceAction) });
    close(order.id, "filled", { ...seen, ...result });
    log.push(price === null ? `Orden #${order.id} ejecutada por tiempo` : `Orden #${order.id} ejecutada a ${order.trigger_label} = ${price}`);
  } catch (err) {
    const message = (err as Error).message;
    close(order.id, "failed", { ...seen, error: message });
    logJournal({ missionId: order.mission_id, sessionId: order.session_id, kind: "order_failed", summary: `Orden #${order.id} disparada pero falló: ${message}` });
    log.push(`Orden #${order.id} falló: ${message}`);
  }
}

// Órdenes condicionales (trigger orders): cuando el precio real cruza el disparador,
// se ejecuta la operación a mercado con los datos reales de ese instante, igual que
// una orden stop-market o las trigger orders de Jupiter. Las comprueba un vigilante
// periódico (watcher.ts y el servidor MCP mientras está activo).
import { db, logJournal, now } from "../db.js";
import * as binance from "../market/binance.js";
import { fetchJson } from "../market/http.js";
import { getTokenInfo, resolveMint } from "../market/jupiter.js";
import { binanceMarketOrder, swapSolana } from "./portfolio.js";
import type { VenueId } from "./types.js";

export interface SolanaAction {
  input: string;
  output: string;
  amount: number;
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
  condition: "above" | "below";
  trigger_price: number;
  action: string;
  reasoning: string | null;
  expires_at: string | null;
  status: string;
}

async function currentPrice(venue: VenueId, asset: string): Promise<number> {
  if (venue === "solana") {
    const data = await fetchJson<Record<string, { usdPrice?: number } | null>>(`https://lite-api.jup.ag/price/v3?ids=${asset}`);
    const price = data[asset]?.usdPrice;
    if (typeof price !== "number") throw new Error(`Jupiter no da precio para ${asset}`);
    return price;
  }
  const data = await fetchJson<{ price: string }>(`https://api.binance.com/api/v3/ticker/price?symbol=${asset}`);
  return Number(data.price);
}

const isTriggered = (condition: "above" | "below", price: number, trigger: number) =>
  condition === "above" ? price >= trigger : price <= trigger;

function describeAction(venue: VenueId, action: SolanaAction | BinanceAction): string {
  if (venue === "solana") {
    const a = action as SolanaAction;
    return `swap ${a.amount} ${a.input} → ${a.output}`;
  }
  const a = action as BinanceAction;
  return `Binance ${a.side} ${a.symbol} amount=${a.amount}`;
}

export async function placeOrder(args: {
  missionId: number;
  sessionId: number | null;
  venue: VenueId;
  triggerAsset: string;
  condition: "above" | "below";
  triggerPrice: number;
  action: SolanaAction | BinanceAction;
  expiresHours?: number;
  reasoning: string;
}) {
  let triggerAsset: string;
  let triggerLabel: string;
  if (args.venue === "solana") {
    triggerAsset = resolveMint(args.triggerAsset);
    triggerLabel = `${(await getTokenInfo(triggerAsset)).symbol}/USD`;
    const a = args.action as SolanaAction;
    // Valida que los tokens de la operación existen antes de aceptar la orden.
    await Promise.all([getTokenInfo(resolveMint(a.input)), getTokenInfo(resolveMint(a.output))]);
  } else {
    triggerAsset = (await binance.getSymbolInfo(args.triggerAsset)).symbol;
    triggerLabel = triggerAsset;
    await binance.getSymbolInfo((args.action as BinanceAction).symbol);
  }

  const price = await currentPrice(args.venue, triggerAsset);
  if (isTriggered(args.condition, price, args.triggerPrice)) {
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
      .run(now(), args.missionId, args.sessionId, args.venue, triggerAsset, triggerLabel, args.condition, args.triggerPrice, JSON.stringify(args.action), args.reasoning, expiresAt)
      .lastInsertRowid,
  );
  const summary = `Orden #${id}: si ${triggerLabel} ${args.condition === "above" ? "≥" : "≤"} ${args.triggerPrice} → ${describeAction(args.venue, args.action)}`;
  logJournal({ missionId: args.missionId, sessionId: args.sessionId, kind: "order_placed", summary, reasoning: args.reasoning, details: { id, expiresAt } });
  return { id, summary, currentPrice: price, expiresAt };
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
    .map((o: any) => ({ ...o, action: JSON.parse(o.action), result: o.result ? JSON.parse(o.result) : null }));
}

function close(id: number, status: string, result: unknown) {
  db.prepare("UPDATE orders SET status = ?, closed_at = ?, result = ? WHERE id = ?").run(status, now(), JSON.stringify(result), id);
}

/** Revisa las órdenes abiertas y ejecuta las que se hayan disparado. Devuelve líneas de log. */
export async function checkOrders(): Promise<string[]> {
  const log: string[] = [];

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
    const key = `${order.venue}:${order.trigger_asset}`;
    try {
      if (!prices.has(key)) prices.set(key, await currentPrice(order.venue, order.trigger_asset));
    } catch (err) {
      log.push(`Sin precio para ${order.trigger_label}: ${(err as Error).message}`);
      continue;
    }
    const price = prices.get(key)!;
    if (!isTriggered(order.condition, price, order.trigger_price)) continue;

    // Reclamo atómico: si otro proceso ya la está ejecutando, se salta.
    if (!db.prepare("UPDATE orders SET status = 'executing' WHERE id = ? AND status = 'open'").run(order.id).changes) continue;

    const reasoning = `Orden condicional #${order.id} disparada (${order.trigger_label} = ${price}, condición ${order.condition} ${order.trigger_price}). Motivo original: ${order.reasoning ?? "-"}`;
    try {
      const action = JSON.parse(order.action);
      const result =
        order.venue === "solana"
          ? await swapSolana({ missionId: order.mission_id, sessionId: order.session_id, ...(action as SolanaAction), reasoning, meta: { exitReason: `orden condicional #${order.id}`, thesis: order.reasoning ?? undefined } })
          : await binanceMarketOrder({ missionId: order.mission_id, sessionId: order.session_id, ...(action as BinanceAction), reasoning, meta: { exitReason: `orden condicional #${order.id}`, thesis: order.reasoning ?? undefined } });
      close(order.id, "filled", { triggerPriceSeen: price, ...result });
      log.push(`Orden #${order.id} ejecutada a ${order.trigger_label} = ${price}`);
    } catch (err) {
      const message = (err as Error).message;
      close(order.id, "failed", { triggerPriceSeen: price, error: message });
      logJournal({ missionId: order.mission_id, sessionId: order.session_id, kind: "order_failed", summary: `Orden #${order.id} disparada pero falló: ${message}` });
      log.push(`Orden #${order.id} falló: ${message}`);
    }
  }
  return log;
}

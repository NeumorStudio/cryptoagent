// Órdenes condicionales (trigger orders): cuando el precio real cruza el disparador,
// se ejecuta la operación a mercado con los datos reales de ese instante, igual que
// una orden stop-market o las trigger orders de Jupiter. Las comprueba un vigilante
// periódico (watcher.ts y el servidor MCP mientras está activo).
import { db, logJournal, now } from "../db.js";
import * as binance from "../market/binance.js";
import { assertSimulated, binanceMarketOrder, getHoldings, LimitNotReached, swap } from "./portfolio.js";
import type { ChainId, VenueId } from "./types.js";
import { settleTransfers } from "./transfers.js";
import { getVenue, type ChainAdapter } from "./venues/index.js";

/** Swap en una cadena (el campo `venue` de la orden indica cuál). */
export interface SwapAction {
  input: string;
  output: string;
  /** Cantidad del token de entrada; se ignora con `sellAll`. */
  amount: number;
  /** Vender todo el saldo del token de entrada en el momento de dispararse. */
  sellAll?: boolean;
  slippageBps: number;
  /** Config de una orden trailing (condition 'trailing_stop' | 'trailing_tp'). */
  trail?: {
    /** % de caída desde el máximo de la posición que dispara la venta. */
    pct: number;
    /** trailing_tp: se arma solo cuando el precio de venta sube este % sobre la referencia. */
    activateAtPct?: number;
  };
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
  condition: "above" | "below" | "time" | "trailing_stop" | "trailing_tp";
  trigger_price: number;
  action: string;
  reasoning: string | null;
  expires_at: string | null;
  status: string;
  /** Máximo de la posición desde que se armó la orden (solo trailing); NULL = aún no armada. */
  trail_peak: number | null;
}

const currentPrice = (venue: VenueId, asset: string) => getVenue(venue).triggerPrice(asset);

/**
 * Precio al que venderías de verdad ahora (USD por unidad): cotización de vender la cantidad de la orden (o
 * todo el saldo) a un estable. Es lo que usan las órdenes límite reales, y evita el desfase con el precio de
 * la API de precios, que en un memecoin que se mueve rápido va por detrás del fill: tras comprar en un pico
 * quedaba un 4-6 % por debajo, y un stop "-8 %" saltaba a los pocos minutos. null si la orden no vende el
 * activo vigilado (entonces se usa el precio de la API).
 */
async function sellPrice(venue: VenueId, missionId: number, triggerAsset: string, action: SwapAction): Promise<number | null> {
  const v = getVenue(venue);
  if (v.kind !== "chain") return null;
  const input = await v.resolveToken(action.input);
  if (input.address !== triggerAsset || v.isCash(input.address)) return null;
  const qty = action.sellAll ? (getHoldings(missionId).find((h) => h.venue === venue && h.asset === input.address)?.amount ?? 0) : action.amount;
  if (!(qty > 0)) return null;
  const q = await v.quote({ input, output: v.stables[0]!, amountIn: qty, slippageBps: action.slippageBps ?? 100 });
  return q.amountOut > 0 ? q.amountOut / qty : null;
}

/** El precio que vigila una orden: el de venta real si vende el activo vigilado; si no, el de la API. */
async function watchedPrice(venue: VenueId, missionId: number, triggerAsset: string, action: SwapAction | BinanceAction) {
  const sell = getVenue(venue).kind === "chain" ? await sellPrice(venue, missionId, triggerAsset, action as SwapAction).catch(() => null) : null;
  return sell ?? (await currentPrice(venue, triggerAsset));
}

const isTriggered = (condition: "above" | "below", price: number, trigger: number) =>
  condition === "above" ? price >= trigger : price <= trigger;

/**
 * Comprueba una orden trailing con el precio de venta actual. Actualiza el máximo en la orden y devuelve si
 * debe dispararse. `trailing_tp` no se arma hasta que el precio supera la referencia + activateAtPct.
 */
function advanceTrailing(order: OrderRow, price: number): { fire: boolean; reason: string } {
  const action = JSON.parse(order.action) as SwapAction;
  const trail = action.trail;
  if (!trail) return { fire: false, reason: "sin config trailing" };
  if (order.condition === "trailing_tp" && order.trail_peak === null) {
    // Aún sin armar: solo se arma si el precio alcanza la referencia + activateAtPct %.
    const activate = order.trigger_price * (1 + (trail.activateAtPct ?? 0) / 100);
    if (price >= activate) {
      db.prepare("UPDATE orders SET trail_peak = ? WHERE id = ?").run(price, order.id);
      order.trail_peak = price;
    }
    return { fire: false, reason: "trailing_tp aún sin armar" };
  }
  const peak = order.trail_peak ?? price;
  const nextPeak = Math.max(peak, price);
  if (nextPeak > peak) {
    db.prepare("UPDATE orders SET trail_peak = ? WHERE id = ?").run(nextPeak, order.id);
    order.trail_peak = nextPeak;
  }
  const threshold = nextPeak * (1 - trail.pct / 100);
  if (price <= threshold) {
    return { fire: true, reason: `${order.trigger_label} cayó un ${trail.pct} % desde el máximo ${nextPeak.toPrecision(6)} (ahora ${price.toPrecision(6)})` };
  }
  return { fire: false, reason: "" };
}

/**
 * Último precio visto de cada orden por precio. Las que están cerca de saltar (a menos de NEAR_TRIGGER de su precio)
 * se miran también en la revisión rápida (cada 5 s); las demás, solo en la completa (cada 15 s). Jupiter da una
 * petición por segundo para todo: así el presupuesto extra va solo a las órdenes que están a punto de saltar.
 */
const lastSeen = new Map<number, number>();
const NEAR_TRIGGER = 0.15;
const isNear = (order: { id: number; trigger_price: number }) => {
  const p = lastSeen.get(order.id);
  return p !== undefined && Math.abs(p / order.trigger_price - 1) <= NEAR_TRIGGER;
};

function describeAction(venue: VenueId, action: SwapAction | BinanceAction): string {
  const v = getVenue(venue);
  if (v.kind === "chain") {
    const a = action as SwapAction;
    const trail = a.trail ? ` (trailing ${a.trail.pct} %${a.trail.activateAtPct !== undefined ? `, se arma al +${a.trail.activateAtPct} %` : ""})` : "";
    return `swap en ${v.label} ${a.sellAll ? "todo el saldo de" : a.amount} ${a.input} → ${a.output}${trail}`;
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
  condition: "above" | "below" | "time" | "trailing_stop" | "trailing_tp";
  triggerPrice?: number;
  inMinutes?: number;
  action: SwapAction | BinanceAction;
  expiresHours?: number;
  reasoning: string;
}) {
  const venue = getVenue(args.venue);
  if (venue.kind === "cex") assertSimulated(args.missionId, "operar en Binance");
  if (args.condition === "time") return placeTimeOrder({ ...args, venue });
  if (args.condition === "trailing_stop" || args.condition === "trailing_tp") {
    if (venue.kind !== "chain") throw new Error("Las órdenes trailing solo existen en cadenas (Solana, Base, BNB Chain)");
    if (!args.triggerAsset) throw new Error("Una orden trailing necesita el activo que se vigila (el token que vendes)");
    return placeTrailingOrder({ ...args, venue, triggerAsset: args.triggerAsset, condition: args.condition, action: args.action as SwapAction });
  }
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

  const price = await watchedPrice(args.venue, args.missionId, triggerAsset, args.action);
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

/**
 * Deja una orden trailing. El precio de venta real se mira en cada comprobación: el máximo de la posición se
 * guarda en `trail_peak` y la venta salta cuando cae `trail.pct` % desde él. Una `trailing_tp` además no se
 * arma hasta que el precio sube `trail.activateAtPct` % sobre la referencia (`trigger_price` guarda esa
 * referencia: lo que daría vender en el momento de colocarla).
 */
async function placeTrailingOrder(args: {
  missionId: number;
  sessionId: number | null;
  venue: ChainAdapter;
  triggerAsset: string;
  condition: "trailing_stop" | "trailing_tp";
  action: SwapAction;
  expiresHours?: number;
  reasoning: string;
}) {
  const trail = args.action.trail;
  if (!trail || !(trail.pct > 0)) throw new Error("Una orden trailing necesita trail_pct (> 0): el % de caída desde el máximo");
  if (args.condition === "trailing_tp" && !(trail.activateAtPct !== undefined && trail.activateAtPct > 0)) {
    throw new Error("Una toma de beneficio trailing necesita activate_at_pct (> 0): el % de subida a partir del que empieza a seguir");
  }

  const a = args.action;
  const trigger = await args.venue.resolveToken(args.triggerAsset);
  await Promise.all([args.venue.resolveToken(a.input), args.venue.resolveToken(a.output)]);
  if (a.input !== trigger.address) throw new Error("En una orden trailing, el activo que se vigila debe ser el que se vende (input)");

  // Referencia: lo que daría vender ahora (quote de venta real), no el precio de pantalla.
  const reference = await watchedPrice(args.venue.id, args.missionId, trigger.address, a);
  const expiresAt = args.expiresHours ? new Date(Date.now() + args.expiresHours * 3_600_000).toISOString() : null;
  // trailing_stop se arma ya, con el máximo en la referencia; trailing_tp espera (trail_peak = NULL).
  const trailPeak = args.condition === "trailing_stop" ? reference : null;
  const id = Number(
    db
      .prepare(
        `INSERT INTO orders (created_at, mission_id, session_id, venue, trigger_asset, trigger_label, condition, trigger_price, action, reasoning, expires_at, trail_peak)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        now(), args.missionId, args.sessionId, args.venue.id, trigger.address, `${trigger.symbol}/USD`,
        args.condition, reference, JSON.stringify(args.action), args.reasoning, expiresAt, trailPeak,
      ).lastInsertRowid,
  );
  const label = args.condition === "trailing_stop" ? "trailing stop" : "toma de beneficio trailing";
  const summary = `Orden #${id}: ${label} (${trail.pct} %${trail.activateAtPct !== undefined ? `, se arma al +${trail.activateAtPct} %` : ""}) → ${describeAction(args.venue.id, args.action)}`;
  logJournal({ missionId: args.missionId, sessionId: args.sessionId, kind: "order_placed", summary, reasoning: args.reasoning, details: { id, expiresAt } });
  return { id, summary, referencePrice: reference, expiresAt };
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
      `SELECT id, created_at, venue, trigger_label, condition, trigger_price, action, expires_at, status, closed_at, result, trail_peak
       FROM orders WHERE mission_id = ? ${where} ORDER BY id DESC LIMIT ?`,
    )
    .all(missionId, limit)
    .map((o: any) => {
      const trailing = o.condition === "trailing_stop" || o.condition === "trailing_tp";
      const trail = trailing && o.action ? (JSON.parse(o.action) as SwapAction).trail : undefined;
      return {
        ...o,
        ...(o.condition === "time" ? { trigger_label: undefined, trigger_price: undefined, executes_at: new Date(o.trigger_price).toISOString() } : {}),
        ...(trailing
          ? {
              trail_pct: trail?.pct,
              ...(trail?.activateAtPct !== undefined ? { activate_at_pct: trail.activateAtPct } : {}),
              ...(o.trail_peak !== null && o.trail_peak !== undefined ? { peak: o.trail_peak } : {}),
            }
          : { trail_peak: undefined }),
        action: JSON.parse(o.action),
        result: o.result ? JSON.parse(o.result) : null,
      };
    });
}

function close(id: number, status: string, result: unknown) {
  db.prepare("UPDATE orders SET status = ?, closed_at = ?, result = ? WHERE id = ?").run(status, now(), JSON.stringify(result), id);
}

/** Revisa las órdenes abiertas y ejecuta las que se hayan disparado. Devuelve líneas de log. */
/**
 * Revisa las órdenes abiertas. Con `nearOnly` (la revisión rápida), solo las de tiempo y las de precio que estaban
 * cerca de saltar en la última lectura; sin él, todas, y antes las transferencias y los futuros.
 */
export async function checkOrders(opts: { nearOnly?: boolean; skipTrailing?: boolean } = {}): Promise<string[]> {
  const log: string[] = [];
  if (!opts.nearOnly) {
    // Primero, las transferencias que ya han llegado: una orden puede depender de ese saldo.
    log.push(...(await settleTransfers().catch((err) => [`Error abonando transferencias: ${(err as Error).message}`])));
    // Futuros: funding, liquidaciones y take profit / stop loss.
    const { checkPerps } = await import("./perps.js");
    log.push(...(await checkPerps().catch((err) => [`Error revisando futuros: ${(err as Error).message}`])));
  }

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
    // Con el carril rápido activo, las trailing las mira ese carril (más a menudo); aquí se saltan para no
    // cotizar lo mismo dos veces. El chequeo de cada 60 s sí las sigue mirando como red de seguridad.
    if (opts.skipTrailing && (order.condition === "trailing_stop" || order.condition === "trailing_tp")) continue;
    if (opts.nearOnly && order.condition !== "trailing_stop" && order.condition !== "trailing_tp" && !isNear(order)) continue;
    // El precio de venta depende de la cantidad: las órdenes que venden lo mismo (la toma de beneficio y el stop que
    // venden todo el saldo) comparten cotización. El de la API, uno por activo.
    const action = JSON.parse(order.action) as SwapAction | BinanceAction;
    const sells = getVenue(order.venue).kind === "chain" && (action as SwapAction).input !== undefined;
    const sa = action as SwapAction;
    const key = sells
      ? `venta:${order.mission_id}:${order.venue}:${sa.input}:${sa.output}:${sa.sellAll ? "todo" : sa.amount}:${order.trigger_asset}`
      : `${order.venue}:${order.trigger_asset}`;
    // Una orden que vende todo un token del que ya no queda nada (se vendió a mano o saltó la otra orden)
    // sobra: se cancela sola en vez de dispararse y fallar.
    if (sells && (action as SwapAction).sellAll && (action as SwapAction).input === order.trigger_asset) {
      const left = getHoldings(order.mission_id).find((h) => h.venue === order.venue && h.asset === order.trigger_asset)?.amount ?? 0;
      if (left <= 0 && db.prepare("UPDATE orders SET status = 'cancelled', closed_at = ? WHERE id = ? AND status = 'open'").run(now(), order.id).changes) {
        logJournal({ missionId: order.mission_id, sessionId: null, kind: "order_cancelled", summary: `Orden #${order.id} cancelada: ya no te queda ${order.trigger_label.replace("/USD", "")}` });
        log.push(`Orden #${order.id} cancelada: ya no queda saldo`);
        continue;
      }
    }
    try {
      if (!prices.has(key)) prices.set(key, await watchedPrice(order.venue, order.mission_id, order.trigger_asset, action));
    } catch (err) {
      log.push(`Sin precio para ${order.trigger_label}: ${(err as Error).message}`);
      continue;
    }
    const price = prices.get(key)!;
    lastSeen.set(order.id, price);
    if (order.condition === "trailing_stop" || order.condition === "trailing_tp") {
      const { fire, reason } = advanceTrailing(order, price);
      if (!fire) continue;
      lastSeen.delete(order.id);
      await execute(order, `Orden trailing #${order.id} disparada (${reason}). Motivo original: ${order.reasoning ?? "-"}`, price, log);
      continue;
    }
    if (!isTriggered(order.condition, price, order.trigger_price)) continue;
    lastSeen.delete(order.id);

    await execute(order, `Orden condicional #${order.id} disparada (${order.trigger_label} = ${price}, condición ${order.condition} ${order.trigger_price}). Motivo original: ${order.reasoning ?? "-"}`, price, log);
  }
  return log;
}

/**
 * Carril rápido del monitor (Fase 2): solo las órdenes trailing abiertas de misiones activas, para reaccionar
 * al segundo sin depender del agente. Cotiza una vez por token distinto (las órdenes que venden lo mismo
 * comparten precio) con un tope de cotizaciones por tick, para no comerse el presupuesto de Jupiter. Se
 * llama desde el tick rápido del MCP cuando el carril está activado.
 */
export async function checkHotOrders(opts: { maxQuotes?: number } = {}): Promise<string[]> {
  const maxQuotes = opts.maxQuotes ?? 1;
  const open = db
    .prepare(
      `SELECT o.* FROM orders o JOIN missions m ON m.id = o.mission_id
       WHERE o.status = 'open' AND m.status = 'active' AND o.condition IN ('trailing_stop', 'trailing_tp')
       ORDER BY o.id`,
    )
    .all() as unknown as OrderRow[];
  if (!open.length) return [];
  const log: string[] = [];
  const quoted = new Map<string, number>(); // token vigilado → precio de venta de este tick
  for (const order of open) {
    if (quoted.size >= maxQuotes && !quoted.has(order.trigger_asset)) continue;
    const action = JSON.parse(order.action) as SwapAction;
    // Una orden que vende todo un token del que ya no queda nada se cancela sola.
    if (action.sellAll && action.input === order.trigger_asset) {
      const left = getHoldings(order.mission_id).find((h) => h.venue === order.venue && h.asset === order.trigger_asset)?.amount ?? 0;
      if (left <= 0 && db.prepare("UPDATE orders SET status = 'cancelled', closed_at = ? WHERE id = ? AND status = 'open'").run(now(), order.id).changes) {
        logJournal({ missionId: order.mission_id, sessionId: null, kind: "order_cancelled", summary: `Orden #${order.id} cancelada: ya no te queda ${order.trigger_label.replace("/USD", "")}` });
        log.push(`Orden #${order.id} cancelada: ya no queda saldo`);
        continue;
      }
    }
    let price = quoted.get(order.trigger_asset);
    if (price === undefined) {
      try {
        price = await watchedPrice(order.venue, order.mission_id, order.trigger_asset, action);
        quoted.set(order.trigger_asset, price);
      } catch (err) {
        // Sin precio ahora: se reintenta en el siguiente tick.
        continue;
      }
    }
    const { fire, reason } = advanceTrailing(order, price);
    if (fire) {
      lastSeen.delete(order.id);
      await execute(order, `Orden trailing #${order.id} disparada (${reason}). Motivo original: ${order.reasoning ?? "-"}`, price, log);
    }
  }
  return log;
}

/**
 * Una toma de beneficio (vender el token vigilado cuando sube por encima de un precio, a un estable) se
 * ejecuta como una orden límite: nunca por debajo del precio fijado, y tampoco por encima (limitFill). Los stops
 * (below) venden a mercado.
 */
function takeProfitMinOut(order: OrderRow, action: SwapAction): number | undefined {
  if (order.condition !== "above" || action.input !== order.trigger_asset) return undefined;
  const v = getVenue(order.venue);
  if (v.kind !== "chain") return undefined;
  const out = v.stables.find((s) => s.address === action.output || s.symbol === action.output);
  if (!out) return undefined;
  const qty = action.sellAll ? (getHoldings(order.mission_id).find((h) => h.venue === order.venue && h.asset === order.trigger_asset)?.amount ?? 0) : action.amount;
  return qty > 0 ? qty * order.trigger_price : undefined;
}

/** Toma de beneficio: se llena exactamente al precio límite, como una orden límite real (el exceso del pico no es tuyo). */
function limitFill(order: OrderRow, action: SwapAction) {
  const minOut = takeProfitMinOut(order, action);
  return minOut === undefined ? {} : { minOut, fillAtLimit: true };
}

/** Ejecuta una orden disparada (por precio o por tiempo). El reclamo atómico evita ejecutarla dos veces. */
async function execute(order: OrderRow, reasoning: string, price: number | null, log: string[]) {
  if (!db.prepare("UPDATE orders SET status = 'executing' WHERE id = ? AND status = 'open'").run(order.id).changes) return;
  const trailing = order.condition === "trailing_stop" || order.condition === "trailing_tp";
  // El precio del mercado cuando saltó no es el de la venta: una toma de beneficio se llena a su límite. El revisor
  // leía "triggerPriceSeen" como precio de venta y concluyó que las tomas de beneficio se llenan por encima (M18 de
  // la v0.37.3: 0,0000399 visto, 0,000033 vendido).
  const seen = price === null ? { executedAt: now() } : { marketPriceWhenTriggered: price };
  try {
    const action = JSON.parse(order.action);
    const limit = getVenue(order.venue).kind === "chain" ? limitFill(order, action as SwapAction) : {};
    const base = {
      missionId: order.mission_id,
      sessionId: order.session_id,
      reasoning,
      meta: { exitReason: `${trailing ? "orden trailing" : "orden condicional"} #${order.id}`, thesis: order.reasoning ?? undefined },
    };
    const result =
      getVenue(order.venue).kind === "chain"
        ? await swap({ ...base, chain: order.venue as ChainId, ...(action as SwapAction), ...limit, fromOrder: true })
        : await binanceMarketOrder({ ...base, ...(action as BinanceAction) });
    const atLimit = "fillAtLimit" in limit ? { filledAtLimitPrice: order.trigger_price } : {};
    close(order.id, "filled", { ...seen, ...atLimit, ...result });
    log.push(
      price === null
        ? `Orden #${order.id} ejecutada por tiempo`
        : "fillAtLimit" in limit
          ? `Orden #${order.id} ejecutada: se llenó a tu límite (${order.trigger_label} = ${order.trigger_price}); el mercado estaba a ${price}`
          : trailing
            ? `Orden trailing #${order.id} disparada a mercado: ${order.trigger_label} = ${price}`
            : `Orden #${order.id} ejecutada a mercado: saltó con ${order.trigger_label} = ${price}`,
    );
  } catch (err) {
    // Toma de beneficio que ya no llega al precio (se movió entre la comprobación y la venta): como una orden
    // límite real, no se llena y sigue esperando.
    if (err instanceof LimitNotReached) {
      db.prepare("UPDATE orders SET status = 'open' WHERE id = ? AND status = 'executing'").run(order.id);
      log.push(`Orden #${order.id}: el precio ya no llega al límite; sigue abierta`);
      return;
    }
    const message = (err as Error).message;
    close(order.id, "failed", { ...seen, error: message });
    logJournal({ missionId: order.mission_id, sessionId: order.session_id, kind: "order_failed", summary: `Orden #${order.id} disparada pero falló: ${message}` });
    log.push(`Orden #${order.id} falló: ${message}`);
  }
}

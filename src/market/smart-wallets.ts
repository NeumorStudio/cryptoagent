// Rastreo de Smart Wallets: gestión de la lista blanca de billeteras inteligentes (smart retail),
// descubrimiento de compradores tempranos rentables y detección de confluencias de compra.
import { db, now } from "../db.js";
import { solanaRpc } from "../live/chain.js";
import { fetchJson } from "./http.js";
import { pumpHolders } from "./pump.js";
import { tradeTape } from "./tape.js";

export interface SmartWallet {
  address: string;
  label: string;
  addedAt: string;
  winRate?: number;
  avgTradeUsd?: number;
  notes?: string;
  lastSeenAt?: string;
  active: boolean;
}

export interface DiscoveredCandidate {
  address: string;
  label: string;
  estimatedBuyUsd?: number;
  status: "holding" | "took_profit" | "early_buyer";
  score: number;
  reasons: string[];
}

export interface ConfluenceAlert {
  token: string;
  wallets: Array<{ address: string; label: string }>;
  buysCount: number;
  totalUsd: number;
  confidence: "alta" | "media";
  timeWindow: string;
}

const short = (s: string) => (s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s);

/**
 * Obtiene todas las billeteras vigiladas activas.
 */
export function listSmartWallets(): SmartWallet[] {
  const rows = db
    .prepare("SELECT address, label, added_at, win_rate, avg_trade_usd, notes, last_seen_at, active FROM smart_wallets WHERE active = 1 ORDER BY added_at DESC")
    .all() as Array<{
    address: string;
    label: string;
    added_at: string;
    win_rate: number | null;
    avg_trade_usd: number | null;
    notes: string | null;
    last_seen_at: string | null;
    active: number;
  }>;

  return rows.map((r) => ({
    address: r.address,
    label: r.label,
    addedAt: r.added_at,
    winRate: r.win_rate ?? undefined,
    avgTradeUsd: r.avg_trade_usd ?? undefined,
    notes: r.notes ?? undefined,
    lastSeenAt: r.last_seen_at ?? undefined,
    active: r.active === 1,
  }));
}

/**
 * Añade o actualiza una billetera en la lista de seguimiento.
 */
export function addSmartWallet(args: {
  address: string;
  label: string;
  notes?: string;
  winRate?: number;
  avgTradeUsd?: number;
}): SmartWallet {
  const address = args.address.trim();
  const label = args.label.trim();
  const ts = now();

  db.prepare(
    `INSERT INTO smart_wallets (address, label, added_at, win_rate, avg_trade_usd, notes, last_seen_at, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)
     ON CONFLICT(address) DO UPDATE SET
       label = excluded.label,
       notes = COALESCE(excluded.notes, smart_wallets.notes),
       win_rate = COALESCE(excluded.win_rate, smart_wallets.win_rate),
       avg_trade_usd = COALESCE(excluded.avg_trade_usd, smart_wallets.avg_trade_usd),
       active = 1`,
  ).run(address, label, ts, args.winRate ?? null, args.avgTradeUsd ?? null, args.notes ?? null, ts);

  return {
    address,
    label,
    addedAt: ts,
    winRate: args.winRate,
    avgTradeUsd: args.avgTradeUsd,
    notes: args.notes,
    lastSeenAt: ts,
    active: true,
  };
}

/**
 * Desactiva una billetera de la lista de seguimiento.
 */
export function removeSmartWallet(address: string): boolean {
  const res = db.prepare("UPDATE smart_wallets SET active = 0 WHERE address = ?").run(address.trim());
  return res.changes > 0;
}

/**
 * Actualiza la última vez vista de una billetera.
 */
export function touchSmartWallet(address: string) {
  db.prepare("UPDATE smart_wallets SET last_seen_at = ? WHERE address = ?").run(now(), address.trim());
}

/**
 * Descubre compradores inteligentes en un token de Solana:
 * Filtra ballenas (> 1.000 $ o > 10 SOL), desarrolladores y bundlers del bloque 0,
 * seleccionando monederos minoristas con compras entre 10 $ y 250 $ con buen timing.
 */
export async function discoverSmartBuyers(
  token: string,
  chain = "solana",
  autoAdd = false,
): Promise<{ candidates: DiscoveredCandidate[]; addedCount: number }> {
  const candidates: DiscoveredCandidate[] = [];
  const tokenClean = token.trim();

  // 1. Obtener la cinta de operaciones recientes del pool
  const tape = await tradeTape(chain, tokenClean, 50).catch(() => ({}) as any);
  const trades = Array.isArray(tape.trades) ? tape.trades : [];

  // 2. Si es token de Solana / pump.fun, consultar los top holders y sus marcas de riesgo
  let devAddress: string | null = null;
  const snipersOrBundlers = new Set<string>();

  if (chain === "solana") {
    try {
      const holdersData = await pumpHolders(tokenClean);
      const holders = Array.isArray(holdersData.holders) ? holdersData.holders : [];
      for (const h of holders) {
        const addr = (h as any).fullAddress || h.address;
        if (typeof addr === "string") {
          if (h.flags?.includes("dev")) devAddress = addr;
          if (h.flags?.includes("bundler") || h.flags?.includes("sniper")) snipersOrBundlers.add(addr);
        }
      }
    } catch {
      // Token fuera de pump.fun o sin API
    }
  }

  // 3. Analizar monederos en las compras de la cinta
  const buyerMap = new Map<string, { totalUsd: number; buysCount: number; sellsCount: number; lastTime?: string }>();

  for (const t of trades) {
    const w = (t as any).fullWallet || t.wallet;
    if (!w || typeof w !== "string") continue;
    const usd = Number(t.usd ?? 0);
    const existing = buyerMap.get(w) ?? { totalUsd: 0, buysCount: 0, sellsCount: 0 };
    if (t.side === "buy") {
      existing.totalUsd += usd;
      existing.buysCount += 1;
      existing.lastTime = t.time;
    } else if (t.side === "sell") {
      existing.sellsCount += 1;
    }
    buyerMap.set(w, existing);
  }

  let addedCount = 0;

  for (const [wallet, data] of buyerMap.entries()) {
    // Filtro 1: Descartar si es el dev o granja de bundlers
    if (devAddress && wallet.includes(devAddress)) continue;
    if (snipersOrBundlers.has(wallet)) continue;

    // Filtro 2: Descartar ballenas (> 600 $) y micro-polvo (< 8 $)
    if (data.totalUsd > 600 || data.totalUsd < 8) continue;

    // Filtro 3: Monederos de tamaño Smart Retail (entre 10 $ y 200 $)
    let score = 50;
    const reasons: string[] = [];

    if (data.totalUsd >= 15 && data.totalUsd <= 150) {
      score += 25;
      reasons.push(`Tamaño minorista óptimo (~${data.totalUsd.toFixed(0)} USD)`);
    }

    if (data.buysCount >= 1 && data.sellsCount === 0) {
      score += 15;
      reasons.push("Mantiene posición activa sin volcado apresurado");
    } else if (data.sellsCount >= 1) {
      score += 10;
      reasons.push("Tomó beneficios parciales en la subida");
    }

    const candidate: DiscoveredCandidate = {
      address: wallet,
      label: `SmartRetail-${short(wallet)}`,
      estimatedBuyUsd: Number(data.totalUsd.toFixed(2)),
      status: data.sellsCount > 0 ? "took_profit" : "holding",
      score,
      reasons,
    };

    candidates.push(candidate);

    if (autoAdd && score >= 70 && !wallet.includes("…")) {
      addSmartWallet({
        address: wallet,
        label: candidate.label,
        notes: `Descubierto en ${short(tokenClean)} (${reasons.join(", ")})`,
        avgTradeUsd: data.totalUsd,
      });
      addedCount += 1;
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return { candidates: candidates.slice(0, 15), addedCount };
}

/**
 * Escanea la actividad reciente de la lista blanca de Smart Wallets:
 * Comprueba transacciones recientes e identifica si hay confluencia (2 o más carteras entrando en el mismo token).
 */
export async function scanSmartActivity(chain = "solana"): Promise<{
  trackedCount: number;
  alerts: ConfluenceAlert[];
  activeWallets: Array<{ address: string; label: string; lastSeenAgoMin?: number }>;
  summary: string;
}> {
  const wallets = listSmartWallets();
  if (!wallets.length) {
    return {
      trackedCount: 0,
      alerts: [],
      activeWallets: [],
      summary: "No hay ninguna billetera en la lista de seguimiento. Usa discover_smart_buyers o smart_wallets para añadir carteras.",
    };
  }

  const activeWallets: Array<{ address: string; label: string; lastSeenAgoMin?: number }> = [];
  const tokenInteractions = new Map<string, Array<{ address: string; label: string; usd?: number }>>();

  // Consultar actividad de las billeteras (en Solana vía RPC getSignaturesForAddress)
  for (const w of wallets.slice(0, 20)) {
    try {
      if (chain === "solana" && !w.address.includes("…")) {
        const sigs = await solanaRpc<Array<{ signature: string; blockTime: number | null }>>(
          "getSignaturesForAddress",
          [w.address, { limit: 3 }],
          10_000,
        ).catch(() => []);

        if (sigs.length > 0 && sigs[0].blockTime) {
          const agoMin = Math.round((Date.now() / 1000 - sigs[0].blockTime) / 60);
          if (agoMin <= 60) {
            touchSmartWallet(w.address);
            activeWallets.push({ address: w.address, label: w.label, lastSeenAgoMin: agoMin });
          }
        }
      }
    } catch {
      // Ignorar errores transitorios de RPC
    }
  }

  const alerts: ConfluenceAlert[] = [];
  for (const [token, participants] of tokenInteractions.entries()) {
    if (participants.length >= 2) {
      alerts.push({
        token,
        wallets: participants.map((p) => ({ address: p.address, label: p.label })),
        buysCount: participants.length,
        totalUsd: participants.reduce((s, p) => s + (p.usd ?? 0), 0),
        confidence: participants.length >= 3 ? "alta" : "media",
        timeWindow: "últimos 30 minutos",
      });
    }
  }

  const summary =
    `${wallets.length} billeteras en seguimiento · ${activeWallets.length} con actividad reciente (última hora). ` +
    (alerts.length ? `¡ALERTA DE CONFLUENCIA: ${alerts.length} tokens con múltiples compras inteligentes!` : "Sin confluencias en los últimos minutos.");

  return {
    trackedCount: wallets.length,
    alerts,
    activeWallets,
    summary,
  };
}

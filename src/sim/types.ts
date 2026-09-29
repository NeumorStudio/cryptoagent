// Tipos compartidos del simulador.

/** Cadenas con monedero propio (swaps en DEX). */
export type ChainId = "solana" | "base" | "bsc";
/** Exchanges centralizados (órdenes contra el libro). */
export type CexId = "binance";
/** Dónde está un saldo: una cadena (monedero propio) o un exchange. */
export type VenueId = ChainId | CexId;

export const CHAINS: readonly ChainId[] = ["solana", "base", "bsc"];

/** Reparto del capital inicial por cadena o exchange, en porcentaje (suma 100). */
export type Allocation = Partial<Record<VenueId, number>>;

export const DEFAULT_ALLOCATION: Allocation = { solana: 30, base: 25, bsc: 25, binance: 20 };
export const VENUES: readonly VenueId[] = [...CHAINS, "binance"];

export interface Holding {
  venue: VenueId;
  /** En una cadena: dirección del token. En un exchange: ticker (p. ej. 'USDT'). */
  asset: string;
  symbol: string;
  decimals: number;
  amount: number;
}

/** Datos de una operación que se guardan en su posición. */
export interface TradeMeta {
  /** Motivo de cierre cuando no lo decide el agente (orden condicional, fin de misión…). */
  exitReason?: string;
  thesis?: string;
  /** Cómo aplica el agente su memoria en esta operación (texto libre). */
  lessonsApplied?: string;
  /** Ids de las creencias que aplica: el simulador mide con ellos cómo le va a cada creencia. */
  beliefsApplied?: number[];
}

/**
 * Datos de un token al abrir una posición, con los mismos nombres en todas las cadenas.
 * Lo que una fuente no da queda sin definir: es "desconocido", no falso ni cero.
 */
export interface Features {
  venue?: VenueId;
  ageMinutes?: number;
  /** Tokens del mismo creador que ha operado el agente y el peor resultado. */
  creatorTradesWithYou?: number;
  creatorWorstPnlWithYouPct?: number;
  /** Edad del pool en el que se opera (en un token graduado de pump.fun, desde la graduación). */
  pairAgeMinutes?: number;
  liquidityUsd?: number;
  mcapUsd?: number;
  priceChange5mPct?: number;
  priceChange1hPct?: number;
  /** Subida del par principal (DexScreener), sin la curva anterior a la graduación. */
  pairPriceChange5mPct?: number;
  pairPriceChange1hPct?: number;
  /** Volumen de 1 h según Jupiter dividido entre el de todos los pares de DexScreener. */
  volume1hJupiterVsDexRatio?: number;
  priceChange24hPct?: number;
  /** Volumen de compras y de ventas en USD en los últimos 5 min, y su cociente (compras / ventas). */
  buyVolume5mUsd?: number;
  sellVolume5mUsd?: number;
  buySellRatio5m?: number;
  holders?: number;
  topHoldersPct?: number;
  netBuyers5m?: number;
  organicScore?: number;
  launchpad?: string;
  rugcheckDangerRisks?: number;
  rugcheckWarnRisks?: number;
  buyTaxPct?: number;
  sellTaxPct?: number;
  honeypot?: boolean;
  mintable?: boolean;
  /** Quién creó el token (dirección): con él se calcula tu historial con ese creador. */
  creator?: string;
  /** Cuántos tokens ha lanzado el creador y cuántos llegaron a graduarse (Solana, Jupiter). */
  creatorTokens?: number;
  creatorGraduated?: number;
  /** % de éxito del creador: graduados / lanzados. */
  creatorGraduationPct?: number;
  /** % del supply que conserva el creador. */
  devHoldingPct?: number;
  /** Otros contratos del mismo creador marcados como honeypot (EVM, GoPlus). */
  creatorHoneypots?: boolean;
  /** Redes de insiders detectadas (Solana, RugCheck). */
  insidersDetected?: number;
  /** % de la liquidez bloqueada o quemada. */
  lpLockedPct?: number;
}

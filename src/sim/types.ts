// Tipos compartidos del simulador.

/** Cadenas con monedero propio (swaps en DEX). */
export type ChainId = "solana";
/** Exchanges centralizados (órdenes contra el libro). */
export type CexId = "binance";
/** Dónde está un saldo: una cadena (monedero propio) o un exchange. */
export type VenueId = ChainId | CexId;

export const CHAINS: readonly ChainId[] = ["solana"];
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
  lessonsApplied?: string;
}

/**
 * Datos de un token al abrir una posición, con los mismos nombres en todas las cadenas.
 * Lo que una fuente no da queda sin definir: es "desconocido", no falso ni cero.
 */
export interface Features {
  venue?: VenueId;
  ageMinutes?: number;
  liquidityUsd?: number;
  mcapUsd?: number;
  priceChange5mPct?: number;
  priceChange1hPct?: number;
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
}

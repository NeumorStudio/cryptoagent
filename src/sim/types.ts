// Tipos compartidos del simulador.

/** Dónde está un saldo: una cadena (monedero propio) o un exchange. */
export type VenueId = "solana" | "binance";

export const VENUES: readonly VenueId[] = ["solana", "binance"];

export interface Holding {
  venue: VenueId;
  /** Solana: dirección mint. Binance: ticker (p. ej. 'USDT'). */
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

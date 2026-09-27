// Registro de cadenas y exchanges disponibles en el simulador.
import { CHAINS, type ChainId, type VenueId } from "../types.js";
import { binance } from "./binance.js";
import { solana } from "./solana.js";
import type { ChainAdapter, Venue } from "./types.js";

const chains: Record<ChainId, ChainAdapter> = { solana };
const venues: Record<VenueId, Venue> = { ...chains, binance };

export function getVenue(id: string): Venue {
  const v = venues[id as VenueId];
  if (!v) throw new Error(`No existe el sitio "${id}". Disponibles: ${Object.keys(venues).join(", ")}`);
  return v;
}

export function getChain(id: string): ChainAdapter {
  const c = chains[id as ChainId];
  if (!c) throw new Error(`No existe la cadena "${id}". Disponibles: ${CHAINS.join(", ")}`);
  return c;
}

export const allChains = (): ChainAdapter[] => CHAINS.map((id) => chains[id]);

export { binance, solana };
export type * from "./types.js";

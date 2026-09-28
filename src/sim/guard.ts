// Freno de memoria en las compras: si el token cumple una creencia negativa con evidencia fuerte,
// la compra se rechaza explicando por qué, salvo que el agente la ignore de forma explícita.
import type { ChainId } from "./types.js";
import { getChain } from "./venues/index.js";
import { blockingBeliefs } from "./memory.js";

export interface BeliefOverride {
  id: number;
  reason: string;
}

/** Comprueba una compra (lo que se recibe no es efectivo ni el nativo). Lanza un error si la memoria la desaconseja. */
export async function checkBuyAgainstMemory(a: { chain: ChainId; output: string; overrides?: BeliefOverride[] }): Promise<BeliefOverride[]> {
  const chain = getChain(a.chain);
  const out = await chain.resolveToken(a.output);
  if (chain.isCash(out.address) || out.address === chain.native.address) return [];
  const features = await chain.entryFeatures(out.address).catch(() => null);
  if (!features) return [];
  const blocking = blockingBeliefs(chain.id, features as unknown as Record<string, unknown>);
  const overridden = new Map((a.overrides ?? []).map((o) => [o.id, o]));
  const missing = blocking.filter((b) => !overridden.has(b.id));
  if (missing.length) {
    throw new Error(
      `Tu memoria desaconseja esta compra de ${out.symbol}:\n` +
        missing.map((b) => `- #${b.id}: ${b.statement} (evidencia: ${b.verdict})`).join("\n") +
        `\nSi aun así quieres comprarlo, repite la operación con thesis.overrides = [${missing.map((b) => `{ id: ${b.id}, reason: "por qué esta vez es distinto" }`).join(", ")}].`,
    );
  }
  return blocking.map((b) => overridden.get(b.id)!);
}

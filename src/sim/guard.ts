// Freno en las compras. Rechaza, explicando por qué:
// - un honeypot (no se puede vender): siempre;
// - un token de un creador de la lista negra (sus tokens ya le costaron al agente un 80 % o más);
// - un token que cumple una creencia negativa con evidencia fuerte.
// Estos dos últimos se pueden saltar a sabiendas con thesis.overrides (id 0 = lista negra de creadores).
import type { ChainId } from "./types.js";
import { getChain } from "./venues/index.js";
import { blockingBeliefs, creatorRugs } from "./memory.js";

export interface BeliefOverride {
  id: number;
  reason: string;
}

/** Id reservado en thesis.overrides para comprar a pesar de la lista negra de creadores. */
export const CREATOR_BLACKLIST_ID = 0;

/** Comprueba una compra (lo que se recibe no es efectivo ni el nativo). Lanza un error si hay que frenarla. */
export async function checkBuyAgainstMemory(a: { chain: ChainId; output: string; overrides?: BeliefOverride[] }): Promise<BeliefOverride[]> {
  const chain = getChain(a.chain);
  const out = await chain.resolveToken(a.output);
  if (chain.isCash(out.address) || out.address === chain.native.address) return [];
  const features = await chain.entryFeatures(out.address).catch(() => null);
  if (!features) return [];
  if (features.honeypot === true) {
    throw new Error(`${out.symbol} es un honeypot según GoPlus: se puede comprar pero no vender. No se compra.`);
  }
  const overridden = new Map((a.overrides ?? []).map((o) => [o.id, o]));
  const reasons: string[] = [];
  const rugs = creatorRugs(features.creator);
  if (rugs.length && !overridden.has(CREATOR_BLACKLIST_ID)) {
    reasons.push(
      `- Lista negra: su creador (${features.creator}) ya lanzó ${rugs.map((r) => `${r.symbol} (${r.pnlPct} %${r.missionId ? `, misión ${r.missionId}` : ""})`).join(", ")}. [id ${CREATOR_BLACKLIST_ID}]`,
    );
  }
  const blocking = blockingBeliefs(chain.id, features as unknown as Record<string, unknown>, out.address);
  for (const b of blocking.filter((x) => !overridden.has(x.id))) reasons.push(`- #${b.id}: ${b.statement} (evidencia: ${b.verdict})`);
  if (reasons.length) {
    const ids = [...(rugs.length && !overridden.has(CREATOR_BLACKLIST_ID) ? [CREATOR_BLACKLIST_ID] : []), ...blocking.filter((x) => !overridden.has(x.id)).map((b) => b.id)];
    throw new Error(
      `Tu memoria desaconseja esta compra de ${out.symbol}:\n${reasons.join("\n")}\n` +
        `Si aun así quieres comprarlo, repite la operación con thesis.overrides = [${ids.map((id) => `{ id: ${id}, reason: "por qué esta vez es distinto" }`).join(", ")}].`,
    );
  }
  return [...overridden.values()];
}

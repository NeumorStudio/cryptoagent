// Freno en las compras: solo el que ha aprendido el agente. Rechaza un token que cumple una creencia negativa
// con evidencia fuerte (la escribe el revisor y la mide el simulador), y se puede saltar a sabiendas con
// thesis.overrides. No hay reglas fijas: un honeypot o un creador que ya le costó dinero son datos (el
// simulador hace que un honeypot no se pueda vender), y aprender de ellos es cosa de su memoria.
import type { ChainId } from "./types.js";
import { getChain } from "./venues/index.js";
import { blockingBeliefs } from "./memory.js";
import { creatorHistory, decisionContext } from "./positions.js";

export interface BeliefOverride {
  id: number;
  reason: string;
}

/** Comprueba una compra (lo que se recibe no es efectivo ni el nativo). Lanza un error si hay que frenarla. */
export async function checkBuyAgainstMemory(a: {
  chain: ChainId;
  output: string;
  overrides?: BeliefOverride[];
  risksChecked?: string;
  /** Para las creencias sobre cómo decide (tamaño, reentrada, tiempo): la misión y lo que se paga. */
  missionId?: number;
  input?: string;
  amount?: number;
}): Promise<BeliefOverride[]> {
  const chain = getChain(a.chain);
  const out = await chain.resolveToken(a.output);
  if (chain.isCash(out.address) || out.address === chain.native.address) return [];
  // Checklist previo: antes de comprar, pensar en lo que puede salir mal (no solo en por qué entrar).
  if (!a.risksChecked || a.risksChecked.trim().length < 15) {
    throw new Error(
      `Antes de comprar ${out.symbol}, rellena thesis.risks_checked: qué creencias negativas de tu memoria podrían aplicar y qué dicen ` +
        "los datos de riskCheck en token_report, y por qué no descartan la compra.",
    );
  }
  const features = await chain.entryFeatures(out.address).catch(() => null);
  if (!features) return [];
  const overridden = new Map((a.overrides ?? []).map((o) => [o.id, o]));
  const reasons: string[] = [];
  // Lo que se paga en USD, si se paga con un estable (lo normal al comprar un memecoin).
  let amountUsd = 0;
  if (a.input && a.amount) {
    const input = await chain.resolveToken(a.input).catch(() => null);
    if (input && chain.isCash(input.address)) amountUsd = a.amount;
  }
  const decision = a.missionId !== undefined ? decisionContext(a.missionId, chain.id, out.address, amountUsd, false) : {};
  const entry = { ...features, ...creatorHistory(features.creator) } as unknown as Record<string, unknown>;
  const blocking = blockingBeliefs(chain.id, entry, out.address, decision);
  for (const b of blocking.filter((x) => !overridden.has(x.id))) {
    reasons.push(`- #${b.id}: ${b.statement} (evidencia: ${b.verdict})${b.whenOverridden ? `. Cuando la ignoraste: ${b.whenOverridden}` : ""}`);
  }
  if (reasons.length) {
    const ids = blocking.filter((x) => !overridden.has(x.id)).map((b) => b.id);
    throw new Error(
      `Tu memoria desaconseja esta compra de ${out.symbol}:\n${reasons.join("\n")}\n` +
        `Si aun así quieres comprarlo, repite la operación con thesis.overrides = [${ids.map((id) => `{ id: ${id}, reason: "por qué esta vez es distinto" }`).join(", ")}].`,
    );
  }
  return [...overridden.values()];
}

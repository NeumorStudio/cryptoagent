// Utilidades de texto para la memoria: detectar entradas casi iguales y leer referencias a lecciones.

const STOPWORDS = new Set(
  (
    "de la el en y a los las del que un una por con para se al lo como mas pero sus le ya o este esta si porque " +
    "muy sin sobre tambien me hasta hay donde quien desde todo nos durante todos uno les ni contra otros ese eso " +
    "ante ellos e esto mi antes algunos que unos yo otro otras otra el tanto esa estos mucho quienes nada muchos cual " +
    "poco ella estar estas algunas algo nosotros es son fue ser han hace hacer cuando no su sus mas menos entre tras"
  ).split(" "),
);

/** Palabras significativas de un texto, sin tildes ni palabras vacías, ordenadas. */
export function fingerprint(text: string): string {
  const words = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  return [...new Set(words)].sort().join(" ");
}

/** Parecido entre dos huellas (Jaccard): 0 = nada en común, 1 = mismas palabras. */
export function similarity(a: string, b: string): number {
  const x = new Set(a.split(" ").filter(Boolean));
  const y = new Set(b.split(" ").filter(Boolean));
  if (!x.size || !y.size) return 0;
  let common = 0;
  for (const w of x) if (y.has(w)) common++;
  return common / (x.size + y.size - common);
}

/** Umbral a partir del cual dos entradas de memoria se consideran la misma. */
export const DUPLICATE_THRESHOLD = 0.6;

/** Números de lección citados en un texto: "Lección 5", "Lecciones 5 y 6", "Lección 4/estadísticas"… */
export function lessonRefs(text: string): number[] {
  const ids = new Set<number>();
  for (const m of text.matchAll(/lecci[oó]n(?:es)?\s*#?\s*(\d+(?:\s*(?:,|y|e|\/)\s*#?\d+)*)/gi)) {
    for (const n of m[1]!.matchAll(/\d+/g)) ids.add(Number(n[0]));
  }
  return [...ids];
}

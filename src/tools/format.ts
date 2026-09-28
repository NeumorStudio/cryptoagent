// Cómo se entregan los datos al agente. Cada token de una respuesta se paga en cada turno siguiente,
// así que se evita el relleno: JSON compacto, sin campos vacíos, con los dólares y porcentajes redondeados
// y, en las listas de objetos iguales (candidatos, posiciones, entradas del diario), una tabla con la
// cabecera una sola vez. En esas listas ahorra hasta un 60 %.
// Solo se redondean los campos que acaban en Usd, Pct o Price: las cantidades de tokens se dejan
// exactas, porque el agente las usa para vender.

/**
 * Redondeo según el nombre del campo: dólares a céntimos (enteros por encima de 1000; tres cifras
 * significativas por debajo de 1, para los precios de memecoins), porcentajes a un decimal (dos si es
 * menor que 10) y precios a cinco cifras significativas.
 */
export function roundFor(key: string, v: number): number {
  if (!Number.isFinite(v) || Number.isInteger(v)) return v;
  const abs = Math.abs(v);
  if (/pct$/i.test(key)) return Number(v.toFixed(abs >= 10 ? 1 : 2));
  if (/usd$/i.test(key)) return abs >= 1000 ? Math.round(v) : abs >= 1 ? Number(v.toFixed(2)) : Number(v.toPrecision(3));
  if (/price$/i.test(key)) return Number(v.toPrecision(5));
  return v;
}

/** Reemplazo para JSON.stringify: quita null y undefined, y redondea por nombre de campo. */
function compactReplacer(this: unknown, key: string, value: unknown) {
  if (value === null && !Array.isArray(this)) return undefined;
  return typeof value === "number" ? roundFor(key, value) : value;
}

/** JSON compacto (sin sangría, sin nulls, dólares y porcentajes redondeados). */
export const json = (value: unknown) => JSON.stringify(value, compactReplacer);

const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const isEmpty = (v: unknown) => v === undefined || v === null;

function cell(key: string, v: unknown): string {
  if (isEmpty(v)) return "";
  const s = typeof v === "object" ? json(v) : typeof v === "number" ? String(roundFor(key, v)) : String(v);
  // El separador de columnas no puede aparecer dentro de una celda.
  return s.replace(/\|/g, "¦").replace(/\r?\n/g, " ");
}

/** Tabla: "[n] campo1|campo2…" y una fila por objeto. Las columnas vacías en todas las filas no salen. */
export function table(rows: Array<Record<string, unknown>>, indent = ""): string {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((k) => rows.some((r) => !isEmpty(r[k]) && r[k] !== ""));
  return [`${indent}[${rows.length}] ${keys.join("|")}`, ...rows.map((r) => indent + keys.map((k) => cell(k, r[k])).join("|"))].join("\n");
}

/**
 * Texto compacto para el agente: los objetos, como "clave: valor" por línea; las listas de dos o más
 * objetos, como tabla; lo demás, en JSON compacto. Los campos vacíos (null o undefined) no salen.
 */
export function toText(value: unknown, indent = ""): string {
  if (Array.isArray(value) && value.length > 1 && value.every(isRecord)) return table(value, indent);
  if (isRecord(value)) {
    return Object.entries(value)
      .filter(([, v]) => !isEmpty(v))
      .map(([k, v]) => {
        if (Array.isArray(v) && v.length > 1 && v.every(isRecord)) return `${indent}${k}:\n${table(v, indent + "  ")}`;
        if (isRecord(v) && Object.keys(v).length > 0) return `${indent}${k}:\n${toText(v, indent + "  ")}`;
        return `${indent}${k}: ${typeof v === "string" ? v : typeof v === "number" ? roundFor(k, v) : json(v)}`;
      })
      .join("\n");
  }
  return indent + json(value);
}

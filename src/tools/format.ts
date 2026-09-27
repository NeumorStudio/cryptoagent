// Cómo se entregan los datos al agente. Cada token de una respuesta se paga en cada turno siguiente,
// así que se evita el relleno: JSON compacto y, en las listas de objetos iguales (candidatos, posiciones,
// entradas del diario), una tabla con la cabecera una sola vez. En esas listas ahorra hasta un 60 %.

/** JSON compacto (sin sangría). */
export const json = (value: unknown) => JSON.stringify(value);

const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);

function cell(v: unknown): string {
  if (v === undefined || v === null) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  // El separador de columnas no puede aparecer dentro de una celda.
  return s.replace(/\|/g, "¦").replace(/\r?\n/g, " ");
}

/** Tabla: "[n] campo1|campo2…" y una fila por objeto. */
export function table(rows: Array<Record<string, unknown>>, indent = ""): string {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return [`${indent}[${rows.length}] ${keys.join("|")}`, ...rows.map((r) => indent + keys.map((k) => cell(r[k])).join("|"))].join("\n");
}

/**
 * Texto compacto para el agente: los objetos, como "clave: valor" por línea; las listas de dos o más
 * objetos, como tabla; lo demás, en JSON compacto.
 */
export function toText(value: unknown, indent = ""): string {
  if (Array.isArray(value) && value.length > 1 && value.every(isRecord)) return table(value, indent);
  if (isRecord(value)) {
    return Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => {
        if (Array.isArray(v) && v.length > 1 && v.every(isRecord)) return `${indent}${k}:\n${table(v, indent + "  ")}`;
        if (isRecord(v) && Object.keys(v).length > 0) return `${indent}${k}:\n${toText(v, indent + "  ")}`;
        return `${indent}${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`;
      })
      .join("\n");
  }
  return indent + JSON.stringify(value);
}

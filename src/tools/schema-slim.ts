// La lista de herramientas (tools/list) la lee el modelo entera: en OpenCode, en cada petición. El SDK
// la genera desde zod con relleno que no le dice nada al modelo: "$schema" en cada herramienta, los
// límites de entero seguro (±9007199254740991) de cada .int(), minLength: 1 y "execution" con el valor
// por defecto. Se quitan al enviarla; la validación sigue siendo la de zod en el servidor.

const SAFE = Number.MAX_SAFE_INTEGER;

export function slimSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(slimSchema);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === "$schema") continue;
    if ((k === "minimum" && v === -SAFE) || (k === "maximum" && v === SAFE)) continue;
    if (k === "minLength" && v === 1) continue;
    // Dentro de "properties" las claves son nombres de parámetro, pero su valor es un objeto: nunca coincide con lo de arriba.
    out[k] = slimSchema(v);
  }
  return out;
}

/** Aplica slimSchema a una respuesta de tools/list (cualquier otro mensaje pasa igual). */
export function slimToolList<T>(message: T): T {
  const tools = (message as { result?: { tools?: unknown } })?.result?.tools;
  if (!Array.isArray(tools)) return message;
  const slim = tools.map((t: Record<string, unknown>) => {
    const { execution, inputSchema, outputSchema, ...rest } = t;
    const isDefault = execution && typeof execution === "object" && (execution as { taskSupport?: string }).taskSupport === "forbidden" && Object.keys(execution).length === 1;
    return {
      ...rest,
      ...(inputSchema ? { inputSchema: slimSchema(inputSchema) } : {}),
      ...(outputSchema ? { outputSchema: slimSchema(outputSchema) } : {}),
      ...(execution && !isDefault ? { execution } : {}),
    };
  });
  const m = message as unknown as { result: Record<string, unknown> };
  return { ...m, result: { ...m.result, tools: slim } } as T;
}

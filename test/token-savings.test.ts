// Respuestas compactas: redondeo por nombre de campo, sin vacíos, guía por secciones, escaneo y ficha sin
// repeticiones, y la lista de herramientas sin el relleno de la conversión desde zod.
import assert from "node:assert/strict";
import { test } from "node:test";
import { json, roundFor, toText } from "../src/tools/format.js";
import { slimSchema, slimToolList } from "../src/tools/schema-slim.js";
import { compactReport, compactScan, fieldGuide } from "../src/tools/index.js";

test("redondeo: dólares, porcentajes y precios; las cantidades de tokens quedan exactas", () => {
  assert.equal(roundFor("totalUsd", 22.294644933778535), 22.29);
  assert.equal(roundFor("mcapUsd", 75271523.4), 75271523);
  assert.equal(roundFor("priceUsd", 0.0000012345678), 0.00000123);
  assert.equal(roundFor("pnlPct", -55.41071013244293), -55.4);
  assert.equal(roundFor("priceChange5mPct", 2.12345), 2.12);
  assert.equal(roundFor("entryPrice", 150.123456), 150.12);
  assert.equal(roundFor("amount", 31021.772225054305), 31021.772225054305);
  assert.equal(json({ amount: 0.012517726, totalUsd: 1.23456, x: null, list: [1, null] }), '{"amount":0.012517726,"totalUsd":1.23,"list":[1,null]}');
});

test("toText: sin campos vacíos y sin columnas vacías en las tablas", () => {
  assert.equal(toText({ a: 1, b: null, c: undefined, d: "x" }), "a: 1\nd: x");
  const t = toText([{ id: 1, warning: null, pnlPct: 1.234 }, { id: 2, warning: undefined, pnlPct: -3 }]);
  assert.equal(t, "[2] id|pnlPct\n1|1.23\n2|-3");
});

test("field_guide: sin secciones da el índice; con secciones, solo esas", () => {
  const guide = "# Guía\n\nIntro.\n\n## 1. Uno\n\nTexto del uno.\n\n## 2. Dos\n\nTexto del dos.\n";
  const index = fieldGuide(guide);
  assert.match(index, /Intro\./);
  assert.match(index, /1\. Uno: Texto del uno\./);
  assert.doesNotMatch(index, /## 2/);
  assert.equal(fieldGuide(guide, [2]), "## 2. Dos\n\nTexto del dos.");
  assert.match(fieldGuide(guide, [9]), /no existe/);
});

test("scan_market: fuentes abreviadas y nombre solo si no repite el símbolo", () => {
  const out = compactScan({
    note: "n",
    sourcesStatus: ["jupiter_trending_5m: 50"],
    candidates: [
      { mint: "M1", sources: ["jupiter_trending_5m", "geckoterminal_trending"], symbol: "CALI", name: "cali", mcapUsd: 1 },
      { mint: "M2", sources: ["pumpfun_live"], symbol: "TOAD", name: "The Toad Pepe", mcapUsd: 2 },
    ],
  }) as { candidates: Array<Record<string, unknown>>; sourcesStatus?: unknown };
  assert.equal(out.sourcesStatus, undefined);
  assert.deepEqual(Object.keys(out.candidates[0]!), ["mint", "symbol", "sources", "mcapUsd"]);
  assert.equal(out.candidates[0]!.sources, "jup5m,gecko");
  assert.equal(out.candidates[1]!.name, "The Toad Pepe");
});

test("token_report: sin la dirección pedida ni el detalle del veredicto de pump.fun", () => {
  const r = compactReport({ mint: "X", token: { address: "0xabc", symbol: "T" }, pumpfun: { replies: 3, url: "u", securityVerdict: { verdict: "allow", provider: "none" } } });
  assert.deepEqual(r, { token: { symbol: "T" }, pumpfun: { replies: 3, securityVerdict: "allow" } });
});

test("tools/list sin $schema, límites de entero seguro, minLength 1 ni execution por defecto", () => {
  const msg = {
    jsonrpc: "2.0",
    id: 1,
    result: {
      tools: [
        {
          name: "t",
          execution: { taskSupport: "forbidden" },
          inputSchema: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: { n: { type: "integer", minimum: -Number.MAX_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER }, s: { type: "string", minLength: 1 }, k: { type: "integer", minimum: 5 } },
          },
        },
      ],
    },
  };
  assert.deepEqual(slimToolList(msg).result.tools[0], {
    name: "t",
    inputSchema: { type: "object", properties: { n: { type: "integer" }, s: { type: "string" }, k: { type: "integer", minimum: 5 } } },
  });
  const other = { jsonrpc: "2.0", id: 2, result: { content: [] } };
  assert.equal(slimToolList(other), other);
  assert.deepEqual(slimSchema([{ minLength: 2 }]), [{ minLength: 2 }]);
});

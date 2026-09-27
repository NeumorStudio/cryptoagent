import { z } from "zod";
import * as browser from "./browser.js";
import { json, tool } from "./define.js";

// Navegador propio (Playwright): solo lo usa el runner por API. En Claude Code
// el agente usa el navegador integrado de la app.
export const BROWSER_TOOLS = [
  // ─── Navegador ────────────────────────────────────────────────────────────
  tool({
    name: "browser_open",
    kind: "research",
    description:
      "Abre una URL en un navegador Chromium real y devuelve el texto visible y los enlaces de la página. " +
      "El navegador no tiene ninguna sesión iniciada ni monedero instalado.",
    schema: z.object({ url: z.string() }),
    run: async ({ url }) => json(await browser.open(url)),
  }),
  tool({
    name: "browser_read",
    kind: "research",
    description: "Vuelve a leer la página actual. Usa offset para leer páginas largas por partes.",
    schema: z.object({ offset: z.number().int().min(0).default(0) }),
    run: async ({ offset }) => json(await browser.read(offset)),
  }),
  tool({
    name: "browser_click",
    kind: "research",
    description: "Hace clic en un elemento de la página actual, por texto visible o por selector CSS.",
    schema: z.object({ text: z.string().optional(), selector: z.string().optional() }),
    run: async (input) => {
      if (!input.text && !input.selector) throw new Error("Indica text o selector");
      return json(await browser.click(input));
    },
  }),
  tool({
    name: "browser_type",
    kind: "research",
    description: "Escribe texto en un campo (selector CSS) de la página actual; opcionalmente pulsa Enter.",
    schema: z.object({ selector: z.string(), text: z.string(), press_enter: z.boolean().default(false) }),
    run: async ({ selector, text, press_enter }) => json(await browser.type(selector, text, press_enter)),
  }),
  tool({
    name: "browser_scroll",
    kind: "research",
    description: "Hace scroll en la página actual (útil en webs que cargan contenido al bajar).",
    schema: z.object({ direction: z.enum(["down", "up"]).default("down") }),
    run: async ({ direction }) => json(await browser.scroll(direction)),
  }),
  tool({
    name: "browser_back",
    kind: "research",
    description: "Vuelve a la página anterior.",
    schema: z.object({}),
    run: async () => json(await browser.back()),
  }),
  tool({
    name: "browser_screenshot",
    kind: "research",
    description: "Devuelve una captura de pantalla de la página actual (para gráficos o contenido visual).",
    schema: z.object({}),
    run: async () => [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: await browser.screenshot() } }],
  }),
];

export const closeBrowser = browser.close;

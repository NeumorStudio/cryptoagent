// Mercado falso para tests: responde como Jupiter y Binance con precios fijados por el test.
import { SOL_MINT, USDC_MINT } from "../src/market/jupiter.js";
import { setFetchImpl } from "../src/market/http.js";

export const MEME = "MeMe1111111111111111111111111111111111111pump";

interface Token {
  symbol: string;
  decimals: number;
  price: number;
}

export const tokens: Record<string, Token> = {
  [SOL_MINT]: { symbol: "SOL", decimals: 9, price: 150 },
  [USDC_MINT]: { symbol: "USDC", decimals: 6, price: 1 },
  [MEME]: { symbol: "MEME", decimals: 6, price: 0.01 },
};

/** Comisión de la ruta falsa de Jupiter (0,3 %). */
export const POOL_FEE = 0.003;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function handle(url: URL): Response {
  if (url.host === "lite-api.jup.ag") {
    if (url.pathname === "/tokens/v2/search") {
      const t = tokens[url.searchParams.get("query")!];
      return json(t ? [{ id: url.searchParams.get("query"), symbol: t.symbol, name: t.symbol, decimals: t.decimals, usdPrice: t.price }] : []);
    }
    if (url.pathname === "/price/v3") {
      const ids = url.searchParams.get("ids")!.split(",");
      return json(Object.fromEntries(ids.map((id) => [id, tokens[id] ? { usdPrice: tokens[id]!.price } : null])));
    }
    if (url.pathname === "/swap/v1/quote") {
      const a = tokens[url.searchParams.get("inputMint")!];
      const b = tokens[url.searchParams.get("outputMint")!];
      if (!a || !b) return json({ error: "no route" }, 400);
      const amountIn = Number(url.searchParams.get("amount")) / 10 ** a.decimals;
      const out = ((amountIn * a.price) / b.price) * (1 - POOL_FEE);
      return json({
        inAmount: url.searchParams.get("amount"),
        outAmount: String(Math.floor(out * 10 ** b.decimals)),
        priceImpactPct: "0",
        slippageBps: Number(url.searchParams.get("slippageBps")),
        routePlan: [{ percent: 100, swapInfo: { label: "Fake AMM", ammKey: "fake" } }],
        contextSlot: 1,
      });
    }
  }
  if (url.host === "api.binance.com") {
    const symbol = url.searchParams.get("symbol") ?? "";
    const base = symbol.replace(/(USDT|USDC)$/, "");
    const price = base === "SOL" ? tokens[SOL_MINT]!.price : undefined;
    if (price === undefined) return json({ code: -1121, msg: "Invalid symbol." }, 400);
    if (url.pathname === "/api/v3/exchangeInfo") {
      return json({
        symbols: [
          {
            symbol,
            status: "TRADING",
            baseAsset: base,
            quoteAsset: symbol.slice(base.length),
            filters: [
              { filterType: "LOT_SIZE", stepSize: "0.001" },
              { filterType: "NOTIONAL", minNotional: "5" },
            ],
          },
        ],
      });
    }
    if (url.pathname === "/api/v3/depth") {
      // Libro profundo con un tick de diferencia entre compra y venta.
      return json({ bids: [[String(price - 0.01), "10000"]], asks: [[String(price + 0.01), "10000"]] });
    }
    if (url.pathname === "/api/v3/ticker/price") return json({ symbol, price: String(price) });
  }
  // RugCheck y demás fuentes de datos de entrada: sin datos.
  return json({ error: "not found" }, 404);
}

/** Instala el mercado falso (y vacía la caché HTTP, para que se vean los precios nuevos). */
export function installFakeMarket() {
  setFetchImpl((async (input: string | URL | Request) => handle(new URL(String(input)))) as typeof fetch);
}

export function setPrice(mint: string, price: number) {
  tokens[mint]!.price = price;
  installFakeMarket();
}

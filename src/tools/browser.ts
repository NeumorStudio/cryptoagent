// Navegador del agente: Chromium con un perfil propio y vacío (sin sesiones,
// sin extensiones de monedero). Sirve para investigar, no para operar.
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";
import { config } from "../config.js";

const PAGE_CHUNK = 12000;
const MAX_LINKS = 120;

let context: BrowserContext | null = null;
let page: Page | null = null;

async function getPage(): Promise<Page> {
  if (page && !page.isClosed()) return page;
  if (!context) {
    context = await chromium.launchPersistentContext(path.join(config.dataDir, "browser-profile"), {
      headless: !config.browserHeadful,
      acceptDownloads: false,
      viewport: { width: 1366, height: 900 },
      locale: "en-US",
    });
    // Si una web abre pestañas nuevas, el agente pasa a trabajar en la más reciente.
    context.on("page", (p) => {
      page = p;
    });
  }
  page = context.pages().find((p) => !p.isClosed()) ?? (await context.newPage());
  return page;
}

async function settle(p: Page) {
  await p.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(1500);
}

async function describe(p: Page, offset = 0) {
  const text = (await p.innerText("body").catch(() => "")).replace(/\n{3,}/g, "\n\n");
  const links = await p
    .$$eval("a[href]", (as) =>
      as
        .map((a) => ({ text: (a as HTMLAnchorElement).innerText.trim().replace(/\s+/g, " ").slice(0, 80), href: (a as HTMLAnchorElement).href }))
        .filter((l) => l.href.startsWith("http")),
    )
    .catch(() => [] as { text: string; href: string }[]);
  const seen = new Set<string>();
  const uniqueLinks = links.filter((l) => !seen.has(l.href) && seen.add(l.href)).slice(0, MAX_LINKS);
  const chunk = text.slice(offset, offset + PAGE_CHUNK);
  return {
    url: p.url(),
    title: await p.title().catch(() => ""),
    text: chunk,
    textRange: `${offset}-${offset + chunk.length} de ${text.length} caracteres${offset + chunk.length < text.length ? " (usa browser_read con offset para seguir leyendo)" : ""}`,
    links: offset === 0 ? uniqueLinks.map((l) => `${l.text || "(sin texto)"} → ${l.href}`) : undefined,
  };
}

export async function open(url: string) {
  if (!/^https?:\/\//i.test(url)) throw new Error("Solo se permiten URLs http(s)");
  const p = await getPage();
  try {
    await p.goto(url, { timeout: 30000, waitUntil: "domcontentloaded" });
  } catch (err) {
    // Una navegación fallida deja la pestaña en un estado que interfiere con las
    // siguientes: se descarta y la próxima llamada usa una pestaña nueva.
    page = null;
    await p.close().catch(() => {});
    throw err;
  }
  await settle(p);
  return describe(p);
}

export async function read(offset = 0) {
  return describe(await getPage(), offset);
}

export async function click(target: { text?: string; selector?: string }) {
  const p = await getPage();
  const locator = target.selector ? p.locator(target.selector).first() : p.getByText(target.text ?? "", { exact: false }).first();
  await locator.click({ timeout: 10000 });
  await settle(page ?? p);
  return describe(page ?? p);
}

export async function type(selector: string, text: string, pressEnter: boolean) {
  const p = await getPage();
  const field = p.locator(selector).first();
  if ((await field.getAttribute("type").catch(() => null)) === "password") {
    throw new Error("El agente no introduce contraseñas");
  }
  await field.fill(text, { timeout: 10000 });
  if (pressEnter) await field.press("Enter");
  await settle(p);
  return describe(p);
}

export async function scroll(direction: "down" | "up") {
  const p = await getPage();
  await p.mouse.wheel(0, direction === "down" ? 900 : -900);
  await p.waitForTimeout(1200);
  return describe(p);
}

export async function back() {
  const p = await getPage();
  await p.goBack({ timeout: 15000 }).catch(() => {});
  await settle(p);
  return describe(p);
}

export async function screenshot(): Promise<string> {
  const p = await getPage();
  const buf = await p.screenshot({ type: "jpeg", quality: 60 });
  return buf.toString("base64");
}

export async function close() {
  await context?.close().catch(() => {});
  context = null;
  page = null;
}

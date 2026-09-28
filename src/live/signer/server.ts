// El firmante: el único proceso que descifra la clave de la cartera real. Lo arranca `start_wallet`
// (o `npm run signer`) y escucha solo en 127.0.0.1.
//
// - La página /wallet es para el usuario: crear la cartera (ve la frase una sola vez), desbloquearla con
//   su contraseña, ver saldos y parar todo. Sus acciones exigen la cookie de sesión que da la contraseña
//   y un Origin de la propia página: ni el modelo ni su navegador pueden aprobar nada sin la contraseña.
// - La API /api/* es para el servidor MCP, con un token aleatorio que se guarda en signer.json.
// La frase y las claves privadas no salen nunca de este proceso (salvo la frase, una vez, a la página).
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createWallet, readWalletPublic, unlockWallet, walletExists, type Accounts } from "../keystore.js";
import { walletBalances } from "../chain.js";
import { liveDir, signerInfoFile, type SignerInfo } from "../paths.js";
import { WALLET_PAGE } from "./page.js";

export interface SignerState {
  accounts: Accounts | null;
  /** "Parar todo": no se firma nada hasta volver a desbloquear. */
  stopped: boolean;
  sessions: Set<string>;
  failedUnlocks: number;
  lockedUntil: number;
}

const MAX_BODY = 16 * 1024;

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("Petición demasiado grande"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? (JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>) : {});
      } catch {
        reject(new Error("JSON no válido"));
      }
    });
  });
}

const sameSecret = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

function cookieSid(req: IncomingMessage): string | null {
  const m = /(?:^|;\s*)sid=([a-f0-9]{64})/.exec(req.headers.cookie ?? "");
  return m ? m[1]! : null;
}

export function createSignerServer(opts: { dir: string; token: string }) {
  const state: SignerState = { accounts: null, stopped: false, sessions: new Set(), failedUnlocks: 0, lockedUntil: 0 };
  let origin = "";

  const send = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers });
    res.end(JSON.stringify(body));
  };

  const newSession = () => {
    const sid = randomBytes(32).toString("hex");
    state.sessions.add(sid);
    return { "set-cookie": `sid=${sid}; HttpOnly; SameSite=Strict; Path=/` };
  };

  const publicState = (authed: boolean) => ({
    exists: walletExists(opts.dir),
    unlocked: state.accounts !== null,
    stopped: state.stopped,
    authed,
    wallet: readWalletPublic(opts.dir),
  });

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      // Contra DNS rebinding: solo se atiende a 127.0.0.1 con el puerto propio.
      if (req.headers.host !== new URL(origin).host) return send(res, 403, { error: "Host no permitido" });

      // ── API del servidor MCP ──
      if (url.pathname.startsWith("/api/")) {
        const auth = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
        if (!sameSecret(auth, opts.token)) return send(res, 401, { error: "Token no válido" });
        if (url.pathname === "/api/status" && req.method === "GET") return send(res, 200, { ...publicState(false), pid: process.pid });
        return send(res, 404, { error: "No existe" });
      }

      // ── Página de la cartera (para el usuario) ──
      if (url.pathname === "/" || url.pathname === "/wallet") {
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "content-security-policy": "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'unsafe-inline'; frame-ancestors 'none'",
          "x-frame-options": "DENY",
        });
        return res.end(WALLET_PAGE);
      }
      const sid = cookieSid(req);
      const authed = sid !== null && state.sessions.has(sid);
      if (url.pathname === "/wallet/state" && req.method === "GET") return send(res, 200, publicState(authed));
      if (url.pathname === "/wallet/balances" && req.method === "GET") {
        const pub = readWalletPublic(opts.dir);
        return pub ? send(res, 200, await walletBalances(pub)) : send(res, 404, { error: "No hay cartera" });
      }

      if (req.method !== "POST") return send(res, 404, { error: "No existe" });
      // Las acciones solo desde la propia página.
      if (req.headers.origin !== origin) return send(res, 403, { error: "Origen no permitido" });
      const body = await readBody(req);

      if (url.pathname === "/wallet/create") {
        const { mnemonic, pub } = createWallet(opts.dir, String(body.password ?? ""));
        state.accounts = unlockWallet(opts.dir, String(body.password));
        state.stopped = false;
        return send(res, 200, { mnemonic, wallet: pub }, newSession());
      }
      if (url.pathname === "/wallet/unlock") {
        if (Date.now() < state.lockedUntil) return send(res, 429, { error: "Demasiados intentos. Espera un poco." });
        try {
          state.accounts = unlockWallet(opts.dir, String(body.password ?? ""));
        } catch (err) {
          if (++state.failedUnlocks >= 5) {
            state.lockedUntil = Date.now() + 60_000;
            state.failedUnlocks = 0;
          }
          return send(res, 400, { error: (err as Error).message });
        }
        state.failedUnlocks = 0;
        state.stopped = false;
        return send(res, 200, publicState(true), newSession());
      }
      if (!authed) return send(res, 401, { error: "Desbloquea la cartera con tu contraseña" });
      if (url.pathname === "/wallet/lock" || url.pathname === "/wallet/stop") {
        state.accounts = null;
        state.stopped = url.pathname === "/wallet/stop";
        state.sessions.clear();
        return send(res, 200, publicState(false));
      }
      return send(res, 404, { error: "No existe" });
    } catch (err) {
      return send(res, 400, { error: (err as Error).message });
    }
  });

  return {
    state,
    server,
    listen: (port = 0) =>
      new Promise<number>((resolve) =>
        server.listen(port, "127.0.0.1", () => {
          const p = (server.address() as { port: number }).port;
          origin = `http://127.0.0.1:${p}`;
          resolve(p);
        }),
      ),
  };
}

/** Arranque del proceso: puerto aleatorio y signer.json para que el servidor MCP lo encuentre. */
export async function runSigner() {
  const dir = liveDir();
  mkdirSync(dir, { recursive: true });
  const token = randomBytes(32).toString("hex");
  const signer = createSignerServer({ dir, token });
  const port = await signer.listen();
  const info: SignerInfo = { port, token, pid: process.pid, startedAt: new Date().toISOString() };
  writeFileSync(signerInfoFile(), JSON.stringify(info), { mode: 0o600 });
  const cleanup = () => {
    rmSync(signerInfoFile(), { force: true });
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  console.error(`Firmante de cryptoagent en http://127.0.0.1:${port}/wallet`);
}

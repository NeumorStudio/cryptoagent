// Instala cryptoagent en OpenCode (escritorio o terminal):   npm run install:opencode
// - Copia el simulador empaquetado a ~/.cryptoagent/opencode (una copia estable, no depende de este repositorio).
// - Añade el servidor MCP `cryptosim` al opencode.json global, sin tocar el resto de la configuración.
// - Genera los agentes `trader` y `reviewer` a partir de los mismos prompts del plugin de Claude Code, y los
//   comandos /cryptoagent-*. No fija ningún modelo: usan el que tengas seleccionado en OpenCode.
// Usa su propia base de datos (~/.cryptoagent/opencode-data) y su propio panel (puerto 4322), separados de Claude Code.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Importar las herramientas abre la base de datos: que sea una temporal, no la de desarrollo ni la real.
process.env.DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "cryptoagent-install-"));
const { buildPrompt, REVIEWER_PROMPT_PATH, TRADER_PROMPT_PATH } = await import("../src/prompt.js");
const { SIM_TOOLS } = await import("../src/tools/index.js");

const root = path.resolve(import.meta.dirname, "..");
const home = os.homedir();
const serverDir = path.join(home, ".cryptoagent", "opencode");
const configDir = path.join(home, ".config", "opencode");
const MCP = "cryptosim";

// ── 1. Simulador ────────────────────────────────────────────────────────────
const dist = path.join(root, "plugin", "dist");
if (!existsSync(path.join(dist, "cryptosim.mjs"))) throw new Error("Falta plugin/dist: ejecuta antes npm run build:plugin");
mkdirSync(serverDir, { recursive: true });
for (const f of ["cryptosim.mjs", "index.html", "guia-del-terreno.md"]) copyFileSync(path.join(dist, f), path.join(serverDir, f));
const serverFile = path.join(serverDir, "cryptosim.mjs");

// ── 2. opencode.json ────────────────────────────────────────────────────────
mkdirSync(configDir, { recursive: true });
if (existsSync(path.join(configDir, "opencode.jsonc"))) {
  throw new Error(`Tienes ${path.join(configDir, "opencode.jsonc")}: añade a mano el servidor MCP "${MCP}" (ver README) para no perder sus comentarios`);
}
const configFile = path.join(configDir, "opencode.json");
const config = existsSync(configFile) ? (JSON.parse(readFileSync(configFile, "utf8")) as Record<string, any>) : { $schema: "https://opencode.ai/config.json" };
// Base de datos y panel propios: las misiones y la memoria de OpenCode no se mezclan con las de Claude Code
// (así se puede comparar cómo aprende con cada modelo), y el panel no choca con el de Claude Code (4321).
const dataDir = path.join(home, ".cryptoagent", "opencode-data");
const DASHBOARD_PORT = "4322";
const server = { type: "local", command: [process.execPath, serverFile], environment: { DATA_DIR: dataDir, DASHBOARD_PORT } };
// OpenCode 2 entiende los dos formatos: el clásico (mcp.<nombre> con enabled) y el nuevo (mcp.servers.<nombre> con
// disabled). Se respeta el que ya tenga el archivo.
if (config.mcp?.servers) config.mcp.servers = { ...config.mcp.servers, [MCP]: { ...server, disabled: false } };
else config.mcp = { ...(config.mcp ?? {}), [MCP]: { ...server, enabled: true } };
writeFileSync(configFile, JSON.stringify(config, null, 2) + "\n");

// ── 3. Agentes ──────────────────────────────────────────────────────────────
// Herramientas definidas en mcp.ts (fuera de SIM_TOOLS) y de quién son.
const MCP_ONLY: Record<string, "trader" | "user"> = {
  start_session: "trader",
  end_session: "trader",
  create_mission: "user",
  stop_mission: "user",
  status_report: "user",
  start_dashboard: "user",
};
const roles = new Map<string, string>([...SIM_TOOLS.map((t) => [t.name, t.role ?? "trader"] as [string, string]), ...Object.entries(MCP_ONLY)]);
const deniedFor = (agent: "trader" | "reviewer") =>
  [...roles].filter(([, role]) => role !== agent && role !== "both").map(([name]) => `${MCP}_${name}`);

const ENV = (agent: "trader" | "reviewer") =>
  [
    "Estás en OpenCode. Tus herramientas del simulador vienen del servidor MCP `cryptosim` y llevan ese prefijo: cuando este texto nombra una",
    "herramienta (por ejemplo `mission_status`), úsala como `cryptosim_mission_status`. No escribas archivos ni ejecutes comandos: trabajas solo con esas herramientas.",
    agent === "trader"
      ? "Empieza llamando a `cryptosim_start_session`. Trabaja en bucle hasta que `cryptosim_mission_status` diga que la misión ya no está activa: investiga, opera, anota, y usa `cryptosim_wait` solo cuando no te quede nada útil por hacer. No termines antes. Al acabar la misión, llama a `cryptosim_end_session` y responde con un resumen breve."
      : "Haz exactamente lo que te pida el mensaje (\"Prepara la misión.\" o \"Vigila la misión.\") y termina con un resumen breve.",
    "",
  ].join("\n");

function agentFile(agent: "trader" | "reviewer", description: string, source: string) {
  const body = buildPrompt(readFileSync(source, "utf8"), "api");
  const permission = ["  edit: deny", "  bash: deny", "  task: deny", ...deniedFor(agent).map((t) => `  ${t}: deny`)].join("\n");
  // Entre comillas: un ":" en la descripción rompería el YAML de la cabecera.
  return `---\ndescription: ${JSON.stringify(description)}\nmode: subagent\npermission:\n${permission}\n---\n\n${ENV(agent)}\n${body}\n`;
}

const agentsDir = path.join(configDir, "agents");
mkdirSync(agentsDir, { recursive: true });
writeFileSync(
  path.join(agentsDir, "trader.md"),
  agentFile("trader", "Agente de cryptoagent que intenta cumplir una misión de trading simulado (capital, objetivo y plazo). Lo lanza /cryptoagent-trading.", TRADER_PROMPT_PATH),
);
writeFileSync(
  path.join(agentsDir, "reviewer.md"),
  agentFile("reviewer", "Revisor de cryptoagent: analiza lo que hace el trader, escribe su memoria y le prepara cada misión. Lo lanza /cryptoagent-trading.", REVIEWER_PROMPT_PATH),
);

// ── 4. Comandos ─────────────────────────────────────────────────────────────
const ASK =
  "Para preguntar al usuario, usa la herramienta de preguntas si la tienes (con opciones); si no, pregunta en el chat y espera su respuesta.";

const commands: Record<string, string> = {
  "cryptoagent-trading": `---
description: Lanza una misión de cryptoagent (trading simulado con precios reales) con su agente y su revisor
---
Vas a lanzar una misión de cryptoagent. Habla en español. Tú no operas ni escribes memoria: preparas la misión y lanzas a los agentes. ${ASK}

Argumentos del usuario: $ARGUMENTS
(Formato orientativo: capital, objetivo y minutos, p. ej. "20 40 5" = 20 $ de capital, llegar a 40 $, en 5 minutos. Un objetivo en % se aplica sobre el capital.)

1. Llama a \`cryptosim_mission_status\`. Si hay una misión activa, pregunta si continuarla (salta al paso 5 sin crearla), reemplazarla (crea la nueva con \`replace: true\`) o detenerla (\`cryptosim_stop_mission\`, preguntando si cerrar posiciones, y termina).
2. Completa lo que falte en los argumentos preguntando al usuario: capital (por defecto 1000 $), objetivo (por defecto +5 %), minutos (por defecto 60), instrucciones (por defecto ninguna: modo libre) y reparto:
   - con menos de 100 $ de capital, por defecto todo en Solana: {"solana":100};
   - si no, repartido: {"solana":30,"base":25,"bsc":25,"binance":20}.
3. Crea la misión con \`cryptosim_create_mission\` (capital_usd, target_usd en valor absoluto, duration_minutes, allocation e instructions si las hay).
4. Pregunta si quiere el panel en directo; si sí, \`cryptosim_start_dashboard\` con open_in_system_browser: true.
5. Lanza el subagente \`reviewer\` con el mensaje exacto "Prepara la misión." y espera a que termine (si falla, sigue: el trader puede trabajar sin briefing).
6. Lanza el subagente \`trader\` con el mensaje exacto "Trabaja en tu misión." y espera a que termine. Si después \`cryptosim_mission_status\` dice que la misión sigue activa, vuelve a lanzarlo con el mismo mensaje.
7. Cuando la misión haya terminado, lanza el subagente \`reviewer\` con el mensaje exacto "Vigila la misión." (hará la retrospectiva) y espera.
8. Llama a \`cryptosim_status_report\` y resume el resultado en pocas líneas.

No añadas nada a los mensajes de los subagentes: todo lo que necesitan está en su configuración y en el simulador.
`,
  "cryptoagent-estado": `---
description: Cómo va la misión de cryptoagent
---
Llama a \`cryptosim_status_report\` y muestra su contenido tal cual, en español, sin tablas ni análisis propio.
`,
  "cryptoagent-parar": `---
description: Detiene la misión activa de cryptoagent
---
Habla en español. ${ASK}
1. Llama a \`cryptosim_mission_status\`. Si no hay misión activa, dilo y termina.
2. Pregunta qué hacer con la cartera: cerrar posiciones (vender todo a mercado), dejarla como está o no detenerla.
3. Llama a \`cryptosim_stop_mission\` con close_positions según la respuesta y resume el valor final en una línea.
`,
  "cryptoagent-peticiones": `---
description: Lo que el agente de cryptoagent ha pedido y no tiene (cuentas, herramientas, mercados)
---
Habla en español. ${ASK}
1. Llama a \`cryptosim_capability_requests\`. Si no hay ninguna abierta, dilo y termina.
2. Muéstralas de la más pedida a la menos: qué pide, cuántas veces, por qué y qué haría con ello.
3. Pregunta si quiere responder a alguna (aceptada, rechazada o hecha, con una nota) y regístralo con \`cryptosim_resolve_capability_request\`.
`,
  "cryptoagent-panel": `---
description: Abre el panel en directo de cryptoagent
---
Llama a \`cryptosim_start_dashboard\` con open_in_system_browser: true y di en una línea dónde está el panel.
`,
};
const commandsDir = path.join(configDir, "commands");
mkdirSync(commandsDir, { recursive: true });
for (const [name, content] of Object.entries(commands)) writeFileSync(path.join(commandsDir, `${name}.md`), content);

console.log(`Simulador:   ${serverFile}`);
console.log(`Servidor MCP "${MCP}" en ${configFile}`);
console.log(`Datos:       ${dataDir} (separados de Claude Code) · panel en http://localhost:${DASHBOARD_PORT}`);
console.log(`Agentes:     ${path.join(agentsDir, "trader.md")}, reviewer.md`);
console.log(`Comandos:    /${Object.keys(commands).join(", /")}`);
console.log("Abre (o reinicia) OpenCode y escribe /cryptoagent-trading.");

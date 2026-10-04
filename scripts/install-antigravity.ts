// Instala cryptoagent en Antigravity:   npm run install:antigravity
// - Copia el simulador empaquetado a ~/.cryptoagent/antigravity (copia estable e independiente).
// - Añade el servidor MCP `cryptosim` a ~/.gemini/config/mcp_config.json, sin tocar otros servidores.
// - Genera las skills de Antigravity en .agents/skills/ y en ~/.gemini/config/skills/.
// - Genera AGENTS.md con las instrucciones de orquestación y las definiciones de los subagentes trader y reviewer.
// Usa su propia base de datos (~/.cryptoagent/antigravity-data) y su propio panel (puerto 4323), separados de Claude Code y OpenCode.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Importar las herramientas abre la base de datos: que sea una temporal, no la de desarrollo ni la real.
process.env.DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "cryptoagent-install-"));
const { buildPrompt, REVIEWER_PROMPT_PATH, TRADER_PROMPT_PATH } = await import("../src/prompt.js");

const root = path.resolve(import.meta.dirname, "..");
const home = os.homedir();
const serverDir = path.join(home, ".cryptoagent", "antigravity");
const geminiConfigDir = path.join(home, ".gemini", "config");
const MCP = "cryptosim";

// ── 1. Simulador ────────────────────────────────────────────────────────────
const dist = path.join(root, "plugin", "dist");
if (!existsSync(path.join(dist, "cryptosim.mjs"))) {
  throw new Error("Falta plugin/dist: ejecuta antes npm run build:plugin");
}
mkdirSync(serverDir, { recursive: true });
for (const f of ["cryptosim.mjs", "signer.mjs", "index.html", "guia-del-terreno.md"]) {
  copyFileSync(path.join(dist, f), path.join(serverDir, f));
}
const serverFile = path.join(serverDir, "cryptosim.mjs").replaceAll("\\", "/");

// ── 2. mcp_config.json ──────────────────────────────────────────────────────
mkdirSync(geminiConfigDir, { recursive: true });
const mcpConfigFile = path.join(geminiConfigDir, "mcp_config.json");
let mcpConfig: Record<string, any> = { mcpServers: {} };
if (existsSync(mcpConfigFile)) {
  try {
    const raw = readFileSync(mcpConfigFile, "utf8").trim();
    if (raw) mcpConfig = JSON.parse(raw);
  } catch {
    mcpConfig = { mcpServers: {} };
  }
}
if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};

const dataDir = path.join(home, ".cryptoagent", "antigravity-data").replaceAll("\\", "/");
const DASHBOARD_PORT = "4323";

mcpConfig.mcpServers[MCP] = {
  command: process.execPath.replaceAll("\\", "/"),
  args: [serverFile],
  env: {
    DATA_DIR: dataDir,
    DASHBOARD_PORT,
    CRYPTOAGENT_HOST: "antigravity",
  },
};

writeFileSync(mcpConfigFile, JSON.stringify(mcpConfig, null, 2) + "\n");

// ── 3. Prompts de Agentes ───────────────────────────────────────────────────
const ENV = (agent: "trader" | "reviewer") =>
  [
    "Estás en Antigravity. Tus herramientas del simulador vienen del servidor MCP `cryptosim`: cuando este texto nombra una herramienta (por ejemplo",
    "`mission_status`), es la de ese servidor (`cryptosim_mission_status` o `mission_status`).",
    "No escribas archivos ni ejecutes comandos del sistema: trabajas solo con esas herramientas.",
    agent === "trader"
      ? "Empieza llamando a `cryptosim_start_session`. Trabaja en bucle hasta que `cryptosim_mission_status` diga que la misión ya no está activa: investiga, opera, anota, y usa `cryptosim_wait` solo cuando no te quede nada útil por hacer. No termines antes. Al acabar la misión, llama a `cryptosim_end_session` y responde con un resumen breve."
      : "Haz exactamente lo que te pida el mensaje (\"Prepara la misión.\" o \"Vigila la misión.\") y termina con un resumen breve.",
    "",
  ].join("\n");

const traderPrompt = `${ENV("trader")}\n${buildPrompt(readFileSync(TRADER_PROMPT_PATH, "utf8"), "api")}`;
const reviewerPrompt = `${ENV("reviewer")}\n${buildPrompt(readFileSync(REVIEWER_PROMPT_PATH, "utf8"), "api")}`;

const promptsDir = path.join(root, ".agents", "prompts");
mkdirSync(promptsDir, { recursive: true });
writeFileSync(path.join(promptsDir, "trader.md"), traderPrompt);
writeFileSync(path.join(promptsDir, "reviewer.md"), reviewerPrompt);

// ── 4. Skills para Antigravity ──────────────────────────────────────────────
const skills: Record<string, { description: string; content: string }> = {
  "cryptoagent-trading": {
    description: "Configura y lanza una misión del agente trader de cryptoagent (simulado o dinero real) con su revisor.",
    content: `---
name: cryptoagent-trading
description: Configura y lanza una misión del agente trader de cryptoagent (simulado o dinero real) con su revisor.
---

# Cryptoagent Trading

Vas a preparar y lanzar una misión de cryptoagent. Habla en español. Tú no operas ni escribes memoria: preparas la misión y lanzas a los subagentes.
Para preguntar al usuario, usa la herramienta ask_question siempre que haya opciones predefinidas.

## 1. Comprobar el simulador
Llama a \`cryptosim_mission_status\`. Si la herramienta no está disponible, verifica que el servidor MCP \`cryptosim\` esté activo en \`~/.gemini/config/mcp_config.json\`.

## 2. Misión activa
Si hay una misión activa, pregunta con ask_question si continuarla (salta al paso 5 sin crearla), empezar una nueva (la actual se cancela, crea la nueva con \`replace: true\`) o detenerla (\`cryptosim_stop_mission\`, preguntando si cerrar posiciones).

## 3. Configurar la misión nueva
Pregunta primero el modo con ask_question:
- Simulado (Recommended): dinero ficticio con precios reales. Sigue en 3A.
- Real: dinero de verdad de la cartera de la IA. Sigue en 3B.

### 3A. Misión simulada
Pregunta:
1. **Capital inicial**: 100 $, 1.000 $ (Recommended), 10.000 $.
2. **Objetivo**: +5 % (Recommended), +10 %, +25 %, o Sin objetivo (open_target: true).
3. **Tiempo**: Modo continuo (continuous: true, Recommended), 1 hora, 6 horas, 24 horas, 3 días.
4. **Panel en directo**: Sí, abrir el panel (Recommended) / No.
5. **Enfoque**: Modo libre (Recommended), Memecoins de pump.fun, o personalizadas.
6. **Reparto**: Repartido ({"solana":30,"base":25,"bsc":25,"binance":20}), Todo en Solana (si < 100 $), etc.
7. **Al objetivo**: Seguir hasta el final (close_on_target: false, Recommended) o Terminar (close_on_target: true).

Crea la misión con \`cryptosim_create_mission\` (\`capital_usd\`, \`target_usd\` en valor absoluto, \`duration_minutes\` (o \`continuous: true\` para modo continuo sin plazo), \`allocation\`, \`close_on_target\` e \`instructions\` si las hay; sin objetivo, \`open_target: true\` en lugar de \`target_usd\` y \`close_on_target\`).

### 3B. Misión real
1. Llama a \`cryptosim_wallet_status\`. Si no hay cartera o no está desbloqueada, llama a \`cryptosim_start_wallet\` y pide al usuario que la cree o desbloquee en la página del navegador. **Nunca pidas ni aceptes en el chat la frase de recuperación ni la contraseña.**
2. Enseña el saldo real y pregunta objetivo en %, tiempo, aprobación (manual o autónoma con límites), límites y enfoque.
3. Crea la misión con \`cryptosim_create_mission\` (\`mode: "live"\`, \`target_pct\`, \`duration_minutes\`, \`approval\`, \`max_trade_usd\`, \`max_loss_pct\`, \`instructions\`).

## 4. Panel
Si el usuario eligió abrir el panel, llama a \`cryptosim_start_dashboard\` con \`open_in_system_browser: true\`.

## 5. Lanzar los agentes
Asegúrate de que los subagentes \`reviewer\` y \`trader\` estén definidos (con \`define_subagent\` si no existen todavía en la sesión, con \`enable_mcp_tools: true\` y \`enable_write_tools: false\`).

1. Lanza el subagente \`reviewer\` con el mensaje exacto \`Prepara la misión.\` y espera a que termine. (Si falla, sigue: el trader puede trabajar sin briefing).
2. Lanza el subagente \`trader\` con el mensaje exacto \`Trabaja en tu misión.\` y espera a que termine.
3. Si la misión sigue activa tras una sesión del trader, vuelve a lanzarlo con el mismo mensaje.
4. Cuando la misión haya terminado, lanza el subagente \`reviewer\` con el mensaje exacto \`Vigila la misión.\` (hará la retrospectiva) y espera.
5. Llama a \`cryptosim_status_report\` y resume el resultado en pocas líneas.
`,
  },
  "cryptoagent-estado": {
    description: "Muestra cómo va la misión actual de cryptoagent (progreso, posiciones, últimos movimientos y última nota).",
    content: `---
name: cryptoagent-estado
description: Muestra cómo va la misión actual de cryptoagent (progreso, posiciones, últimos movimientos y última nota).
---

# Cryptoagent Estado

Llama a \`cryptosim_status_report\` y muestra su contenido tal cual, en español, sin tablas ni adornos innecesarios.
Si la misión está en curso, recuerda que puede volver a consultar el estado cuando lo desee.
`,
  },
  "cryptoagent-parar": {
    description: "Detiene la misión activa de cryptoagent antes de que termine el plazo.",
    content: `---
name: cryptoagent-parar
description: Detiene la misión activa de cryptoagent antes de que termine el plazo.
---

# Cryptoagent Parar

1. Llama a \`cryptosim_mission_status\`. Si no hay ninguna misión activa, infórmalo y termina.
2. Pregunta con ask_question qué hacer con la cartera:
   - "Cerrar posiciones (Recommended)": vende todo a mercado.
   - "Dejar la cartera como está": solo detiene la misión y cancela órdenes pendientes.
   - "No detenerla": cancelar esta acción.
3. Llama a \`cryptosim_stop_mission\` con \`close_positions\` según la respuesta.
4. Cierra el panel web con \`cryptosim_stop_dashboard\`.
5. Si la misión operó, lanza el subagente \`reviewer\` con \`Vigila la misión.\` para que registre la retrospectiva.
6. Resume en una línea el valor final y que la misión se ha detenido.
`,
  },
  "cryptoagent-peticiones": {
    description: "Muestra lo que el agente trader ha pedido y no tiene (cuentas, herramientas, mercados) y permite resolverlas.",
    content: `---
name: cryptoagent-peticiones
description: Muestra lo que el agente trader ha pedido y no tiene (cuentas, herramientas, mercados) y permite resolverlas.
---

# Cryptoagent Peticiones

1. Llama a \`cryptosim_capability_requests\`. Si no hay ninguna abierta, infórmalo y termina.
2. Muestra las peticiones de la más solicitada a la menos: qué pide, cuántas veces, por qué y qué haría con ello.
3. Pregunta con ask_question si el usuario desea responder a alguna (Aceptada, Rechazada o Hecha).
4. Registra cada resolución llamando a \`cryptosim_resolve_capability_request\`.
`,
  },
  "cryptoagent-panel": {
    description: "Abre o consulta el panel en directo de cryptoagent en el navegador.",
    content: `---
name: cryptoagent-panel
description: Abre o consulta el panel en directo de cryptoagent en el navegador.
---

# Cryptoagent Panel

1. Llama a \`cryptosim_start_dashboard\` con \`open_in_system_browser: true\`.
2. Indica en una línea al usuario que el panel está disponible en la URL retornada (por defecto http://localhost:4323).
`,
  },
  "cryptoagent-cartera": {
    description: "Abre la cartera real de la IA de cryptoagent (crear, desbloquear, ver saldos o pararla).",
    content: `---
name: cryptoagent-cartera
description: Abre la cartera real de la IA de cryptoagent (crear, desbloquear, ver saldos o pararla).
---

# Cryptoagent Cartera

1. Llama a \`cryptosim_start_wallet\`: arranca el firmante y abre la página en el navegador.
2. Según el estado devuelto:
   - Sin cartera: debe crearla en la página. Verá la frase una sola vez y debe anotarla en papel.
   - Bloqueada: debe introducir su contraseña en la página.
   - Desbloqueada: llama a \`cryptosim_wallet_status\` y muestra saldos y direcciones.
3. **NUNCA pidas ni admitas en el chat la frase de recuperación ni la contraseña.**
`,
  },
  "cryptoagent-impuestos": {
    description: "Exporta a CSV las operaciones con dinero real de cryptoagent como apoyo para la declaración.",
    content: `---
name: cryptoagent-impuestos
description: Exporta a CSV las operaciones con dinero real de cryptoagent como apoyo para la declaración.
---

# Cryptoagent Impuestos

1. Si el usuario especificó un año, pásalo como parámetro \`year\` a \`cryptosim_export_taxes\`. Si no, llama sin parámetros para exportar todo.
2. Muestra el número de operaciones y posiciones, el PnL realizado en USD y EUR y las rutas de los archivos generados.
3. Recuerda que es un registro de apoyo y no asesoramiento fiscal formal.
`,
  },
};

// Guardar skills tanto en workspace (.agents/skills) como en global (~/.gemini/config/skills)
const workspaceSkillsDir = path.join(root, ".agents", "skills");
const globalSkillsDir = path.join(geminiConfigDir, "skills");

for (const [name, skill] of Object.entries(skills)) {
  const wsDir = path.join(workspaceSkillsDir, name);
  const glDir = path.join(globalSkillsDir, name);
  mkdirSync(wsDir, { recursive: true });
  mkdirSync(glDir, { recursive: true });
  writeFileSync(path.join(wsDir, "SKILL.md"), skill.content);
  writeFileSync(path.join(glDir, "SKILL.md"), skill.content);
}

// ── 5. AGENTS.md (Reglas del espacio de trabajo) ────────────────────────────
const agentsMdContent = `# Reglas de Cryptoagent para Antigravity

Este repositorio contiene **cryptoagent**, un agente autónomo de trading cripto en simulación (y real) con datos de mercado en directo.

## Servidor MCP y Herramientas
El simulador expone sus herramientas a través del servidor MCP \`cryptosim\` configurado en \`~/.gemini/config/mcp_config.json\`.
Las herramientas principales incluyen:
- Gestión de misiones: \`cryptosim_mission_status\`, \`cryptosim_create_mission\`, \`cryptosim_stop_mission\`, \`cryptosim_status_report\`
- Panel web: \`cryptosim_start_dashboard\`, \`cryptosim_stop_dashboard\`
- Cartera real y fiscalidad: \`cryptosim_start_wallet\`, \`cryptosim_wallet_status\`, \`cryptosim_export_taxes\`
- Peticiones: \`cryptosim_capability_requests\`, \`cryptosim_resolve_capability_request\`

## Subagentes Autónomos
Cuando se ejecuta una misión de trading, se orquestan dos subagentes especializados utilizando \`define_subagent\` (con \`enable_mcp_tools: true\`) e \`invoke_subagent\`:
1. **\`reviewer\`**:
   - Prompt: \`.agents/prompts/reviewer.md\`
   - Tareas: "Prepara la misión." (briefing inicial y memoria previa) y "Vigila la misión." (retrospectiva y actualización de howtos/creencias).
2. **\`trader\`**:
   - Prompt: \`.agents/prompts/trader.md\`
   - Tarea: "Trabaja en tu misión." (opera en bucle on-chain / dex / binance hasta que la misión concluya).

## Flujo de Trabajo
Para iniciar misiones o consultar el estado, utiliza las skills disponibles en \`.agents/skills/\`:
- \`cryptoagent-trading\`
- \`cryptoagent-estado\`
- \`cryptoagent-parar\`
- \`cryptoagent-panel\`
- \`cryptoagent-cartera\`
- \`cryptoagent-impuestos\`
- \`cryptoagent-peticiones\`
`;

writeFileSync(path.join(root, "AGENTS.md"), agentsMdContent);

console.log("-----------------------------------------------------------------");
console.log(" Instalación de cryptoagent para Antigravity completada con éxito ");
console.log("-----------------------------------------------------------------");
console.log(`Simulador:   ${serverFile}`);
console.log(`Servidor MCP "${MCP}" en ${mcpConfigFile}`);
console.log(`Datos:       ${dataDir} · panel en http://localhost:${DASHBOARD_PORT}`);
console.log(`Skills:      .agents/skills/ y ~/.gemini/config/skills/`);
console.log(`Prompts:     .agents/prompts/trader.md, reviewer.md`);
console.log(`Reglas:      AGENTS.md`);
console.log("-----------------------------------------------------------------");

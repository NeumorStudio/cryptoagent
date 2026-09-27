// Empaqueta el servidor MCP en un único archivo para el plugin (plugin/dist/cryptosim.mjs),
// con todas sus dependencias dentro: el usuario no necesita ejecutar npm install.
//   npm run build:plugin
import { build } from "esbuild";
import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";

const out = "plugin/dist";
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: ["src/mcp.ts"],
  outfile: `${out}/cryptosim.mjs`,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  // Hace que paths.ts sepa que está empaquetado (datos en la carpeta persistente del plugin).
  define: { "process.env.CRYPTOAGENT_BUNDLED": '"1"' },
  // Algunas dependencias son CommonJS y usan require(): se lo proporcionamos en ESM.
  banner: { js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' },
  legalComments: "none",
  logLevel: "warning",
});

// Archivos que el servidor lee en tiempo de ejecución.
copyFileSync("src/dashboard/index.html", `${out}/index.html`);
copyFileSync("knowledge/guia-del-terreno.md", `${out}/guia-del-terreno.md`);

// La versión del plugin también va en el marketplace: algunas apps la usan para detectar actualizaciones.
const version = JSON.parse(readFileSync("plugin/.claude-plugin/plugin.json", "utf8")).version;
const marketplacePath = ".claude-plugin/marketplace.json";
const marketplace = JSON.parse(readFileSync(marketplacePath, "utf8"));
for (const p of marketplace.plugins) if (p.name === "cryptoagent") p.version = version;
writeFileSync(marketplacePath, JSON.stringify(marketplace, null, 2) + "\n");

const kb = (f) => (statSync(f).size / 1024).toFixed(0);
console.log(`Plugin empaquetado: ${out}/cryptosim.mjs (${kb(`${out}/cryptosim.mjs`)} KB), index.html, guia-del-terreno.md`);

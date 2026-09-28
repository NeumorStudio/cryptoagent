// Página de la cartera real, servida por el firmante en 127.0.0.1. Es del usuario, no del agente.
export const WALLET_PAGE = /* html */ `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cartera de la IA</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Anybody:wdth,wght@75..150,400..800&display=swap" rel="stylesheet">
<style>
  :root { --bg:#141518; --surface:#1c1d21; --surface-2:#26282d; --ink:#ece8e1; --muted:#9a968f; --rule:#2e3036;
          --accent:#f4c430; --down:#ef6f63; --up:#52c98b; --ease:cubic-bezier(0.16,1,0.3,1); }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.55 "Anybody", system-ui, sans-serif; font-stretch:100%; }
  main { max-width: 760px; margin: 0 auto; padding: 40px 16px 80px; }
  h1 { font-size: clamp(34px, 7vw, 56px); line-height: 1; font-stretch: 140%; font-weight: 800; margin: 0 0 8px; }
  h2 { font-size: 15px; font-stretch: 125%; letter-spacing: .02em; color: var(--muted); margin: 36px 0 12px; font-weight: 700; }
  p { max-width: 62ch; }
  .lead { color: var(--muted); margin: 0 0 28px; }
  .band { background: var(--accent); color: #141518; font-weight: 700; padding: 10px 14px; border-radius: 4px; margin-bottom: 24px; }
  .warn { border-left: 3px solid var(--down); padding: 4px 0 4px 14px; color: var(--ink); }
  form { display: grid; gap: 12px; max-width: 420px; }
  label { font-size: 14px; color: var(--muted); display: grid; gap: 6px; }
  input[type=password] { background: var(--surface); color: var(--ink); border: 1px solid var(--rule); border-radius: 4px; padding: 12px; font: inherit; }
  input:focus-visible, button:focus-visible, a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  button { font: inherit; font-weight: 700; font-stretch: 115%; border: 0; border-radius: 4px; padding: 12px 18px; cursor: pointer; min-height: 44px;
           background: var(--accent); color: #141518; transition: transform 150ms var(--ease); }
  button:active { transform: translateY(1px); }
  button.ghost { background: transparent; color: var(--ink); border: 1px solid var(--rule); }
  button.stop { background: var(--down); color: #141518; }
  button:disabled { opacity: .5; cursor: default; }
  .error { color: var(--down); min-height: 1.5em; margin: 0; }
  .words { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; margin: 16px 0; padding: 0; list-style: none; counter-reset: w; }
  .words li { background: var(--surface); border: 1px solid var(--rule); border-radius: 4px; padding: 10px 12px; font-weight: 600; counter-increment: w; }
  .words li::before { content: counter(w); color: var(--muted); font-weight: 400; margin-right: 10px; font-size: 13px; }
  .addr { display: grid; gap: 2px; padding: 14px 0; border-bottom: 1px solid var(--rule); }
  .addr b { font-stretch: 120%; }
  .addr code { font-size: 14px; word-break: break-all; color: var(--ink); }
  .addr a { color: var(--muted); font-size: 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 15px; }
  td { padding: 8px 0; border-bottom: 1px solid var(--rule); }
  td.n { text-align: right; font-variant-numeric: tabular-nums; }
  .total { font-size: 40px; font-stretch: 140%; font-weight: 800; margin: 0; }
  .row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 20px; }
  .pill { display:inline-block; padding: 2px 10px; border-radius: 999px; font-size: 13px; font-weight: 700; background: var(--surface-2); }
  .pill.on { background: var(--up); color: #141518; } .pill.off { background: var(--down); color: #141518; }
  [hidden] { display: none !important; }
  .approvals { list-style: none; padding: 0; margin: 0 0 28px; display: grid; gap: 10px; }
  .approvals li { background: var(--surface); border: 1px solid var(--accent); border-radius: 6px; padding: 14px 16px; display: grid; gap: 10px; }
  .approvals .what { font-size: 17px; font-weight: 600; }
  .approvals .meta { font-size: 13px; color: var(--muted); }
  .approvals .row { margin-top: 0; }
</style>
</head>
<body>
<main>
  <div class="band">Dinero real. Esta página es solo para ti: no la compartas y no se la enseñes al agente.</div>
  <h1>Cartera de la IA</h1>
  <p class="lead" id="lead">Cargando…</p>

  <section id="create" hidden>
    <p>Vas a crear una cartera <b>nueva</b>, solo para la IA. No uses una frase que ya tengas: la IA operará con lo que haya en esta cartera y debería ser dinero que puedas perder entero.</p>
    <form id="createForm">
      <label>Contraseña para cifrar la cartera en este ordenador (mínimo 10 caracteres)
        <input type="password" name="password" autocomplete="new-password" minlength="10" required></label>
      <label>Repite la contraseña
        <input type="password" name="again" autocomplete="new-password" minlength="10" required></label>
      <button type="submit">Crear la cartera</button>
      <p class="error" id="createError" role="alert"></p>
    </form>
  </section>

  <section id="phrase" hidden>
    <h2>Tu frase de recuperación</h2>
    <p class="warn">Apúntala en papel ahora. Solo se muestra esta vez. Con ella puedes importar la cartera en MetaMask (Base y BNB Chain) y en Phantom (Solana) para verla. Quien la tenga controla el dinero: no la pegues en ningún chat, tampoco en el del agente.</p>
    <ol class="words" id="words"></ol>
    <label><span><input type="checkbox" id="saved"> La he apuntado</span></label>
    <div class="row"><button id="phraseDone" disabled>Continuar</button></div>
  </section>

  <section id="unlock" hidden>
    <p id="unlockText">La cartera está bloqueada. Escribe tu contraseña para que el agente pueda usarla.</p>
    <form id="unlockForm">
      <label>Contraseña <input type="password" name="password" autocomplete="current-password" required></label>
      <button type="submit">Desbloquear</button>
      <p class="error" id="unlockError" role="alert"></p>
    </form>
  </section>

  <section id="wallet" hidden>
    <div id="approvals" hidden>
      <h2>Esperan tu aprobación</h2>
      <ul class="approvals" id="approvalList"></ul>
    </div>
    <p class="total" id="total">…</p>
    <p class="lead" id="totalSub"></p>
    <table><tbody id="balances"></tbody></table>
    <h2>Direcciones</h2>
    <div class="addr"><b>Solana</b><code id="solAddr"></code><a id="solLink" target="_blank" rel="noopener">Ver en Solscan</a></div>
    <div class="addr"><b>Base y BNB Chain</b> <span class="lead">(la misma dirección en las dos)</span><code id="evmAddr"></code>
      <span><a id="baseLink" target="_blank" rel="noopener">Ver en Basescan</a> · <a id="bscLink" target="_blank" rel="noopener">Ver en BscScan</a></span></div>
    <p class="lead">Para darle fondos, envía USDC o USDT (y un poco de SOL, ETH o BNB para el gas) a estas direcciones, por la red correcta.</p>
    <div class="row" id="controls">
      <button class="ghost" id="refresh">Actualizar saldos</button>
      <button class="ghost" id="lock">Bloquear</button>
      <button class="stop" id="stop">Parar todo</button>
    </div>
  </section>
</main>
<script>
const $ = (id) => document.getElementById(id);
const post = async (path, body = {}) => {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Error");
  return j;
};
const usd = (n) => n.toLocaleString("es-ES", { style: "currency", currency: "USD" });
const show = (id) => ["create", "phrase", "unlock", "wallet"].forEach((s) => ($(s).hidden = s !== id));

async function load() {
  const s = await (await fetch("/wallet/state")).json();
  if (!s.exists) { $("lead").textContent = "Todavía no hay cartera."; return show("create"); }
  fillAddresses(s.wallet);
  const status = s.stopped ? '<span class="pill off">parada</span>' : s.unlocked ? '<span class="pill on">desbloqueada</span>' : '<span class="pill">bloqueada</span>';
  $("lead").innerHTML = "Estado: " + status;
  if (!s.unlocked || !s.authed) {
    $("unlockText").textContent = s.unlocked && s.pendingApprovals
      ? "Hay " + s.pendingApprovals + " operación(es) esperando tu aprobación. Escribe tu contraseña para verlas."
      : s.unlocked
      ? "La cartera está desbloqueada para el agente. Para ver los saldos o pararla desde este navegador, escribe tu contraseña."
      : s.stopped
        ? "Está parada: el agente no puede operar. Escribe tu contraseña para reanudar."
        : "La cartera está bloqueada. Escribe tu contraseña para que el agente pueda usarla.";
    return show("unlock");
  }
  show("wallet");
  loadBalances();
}
function fillAddresses(w) {
  if (!w) return;
  $("solAddr").textContent = w.solana; $("evmAddr").textContent = w.evm;
  $("solLink").href = "https://solscan.io/account/" + w.solana;
  $("baseLink").href = "https://basescan.org/address/" + w.evm;
  $("bscLink").href = "https://bscscan.com/address/" + w.evm;
}
async function loadBalances() {
  $("total").textContent = "…";
  const b = await (await fetch("/wallet/balances")).json();
  if (b.error) { $("totalSub").textContent = b.error; return; }
  $("total").textContent = usd(b.totalUsd);
  const names = { solana: "Solana", base: "Base", bsc: "BNB Chain" };
  $("totalSub").textContent = Object.entries(b.byChain).map(([c, v]) => names[c] + " " + usd(v)).join(" · ") +
    (Object.keys(b.errors).length ? " · sin leer: " + Object.keys(b.errors).map((c) => names[c]).join(", ") : "");
  $("balances").replaceChildren(...b.balances.map((x) => {
    const tr = document.createElement("tr");
    tr.innerHTML = "<td></td><td class='n'></td><td class='n'></td>";
    tr.children[0].textContent = x.symbol + " · " + names[x.venue];
    tr.children[1].textContent = Number(x.amount.toPrecision(6)).toLocaleString("es-ES");
    tr.children[2].textContent = usd(x.usd);
    return tr;
  }));
}
$("createForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  if (f.get("password") !== f.get("again")) return ($("createError").textContent = "Las contraseñas no coinciden");
  try {
    const r = await post("/wallet/create", { password: f.get("password") });
    e.target.reset();
    fillAddresses(r.wallet);
    $("words").replaceChildren(...r.mnemonic.split(" ").map((w) => Object.assign(document.createElement("li"), { textContent: w })));
    $("lead").textContent = "Cartera creada.";
    show("phrase");
  } catch (err) { $("createError").textContent = err.message; }
});
$("saved").addEventListener("change", (e) => ($("phraseDone").disabled = !e.target.checked));
$("phraseDone").addEventListener("click", () => { $("words").replaceChildren(); load(); });
$("unlockForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try { await post("/wallet/unlock", { password: new FormData(e.target).get("password") }); e.target.reset(); $("unlockError").textContent = ""; load(); }
  catch (err) { $("unlockError").textContent = err.message; }
});
// Aprobaciones: se consultan cada 2 s mientras la página está abierta y desbloqueada.
let shownIds = "";
async function loadApprovals() {
  if ($("wallet").hidden) return;
  const r = await fetch("/wallet/pending");
  if (!r.ok) return;
  const list = await r.json();
  const ids = list.map((p) => p.id).join(",");
  $("approvals").hidden = !list.length;
  if (ids === shownIds) return;
  shownIds = ids;
  const names = { solana: "Solana", base: "Base", bsc: "BNB Chain" };
  $("approvalList").replaceChildren(...list.map((p) => {
    const li = document.createElement("li");
    const what = Object.assign(document.createElement("div"), { className: "what", textContent: p.summary });
    const meta = Object.assign(document.createElement("div"), { className: "meta",
      textContent: names[p.chain] + " · " + usd(p.usd) + " · misión #" + p.missionId + " · caduca a las " + new Date(p.expiresAt).toLocaleTimeString("es-ES") });
    const row = Object.assign(document.createElement("div"), { className: "row" });
    const ok = Object.assign(document.createElement("button"), { textContent: "Aprobar" });
    const no = Object.assign(document.createElement("button"), { className: "ghost", textContent: "Rechazar" });
    const decide = async (approve) => { ok.disabled = no.disabled = true; try { await post("/wallet/decide", { id: p.id, approve }); } catch (e) {} shownIds = ""; loadApprovals(); };
    ok.onclick = () => decide(true);
    no.onclick = () => decide(false);
    row.append(ok, no);
    li.append(what, meta, row);
    return li;
  }));
  if (list.length && document.hidden) document.title = "(" + list.length + ") Cartera de la IA";
  else document.title = "Cartera de la IA";
}
setInterval(loadApprovals, 2000);
// En la pantalla de desbloqueo, refresca el aviso de operaciones pendientes (nunca mientras se ve la frase).
setInterval(() => { if (!$("unlock").hidden) load(); }, 5000);

$("refresh").addEventListener("click", loadBalances);
$("lock").addEventListener("click", async () => { await post("/wallet/lock"); load(); });
$("stop").addEventListener("click", async () => {
  if (!confirm("¿Parar todo? El agente no podrá operar hasta que vuelvas a desbloquear la cartera.")) return;
  await post("/wallet/stop"); load();
});
load();
</script>
</body>
</html>`;

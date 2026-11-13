const MINTS = [
  "So11111111111111111111111111111111111111112",
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
  "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",
  "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3",
  "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL",
];
const MAJORS = new Set(["SOL", "JUP", "RAY", "ORCA", "PYTH", "BONK", "WIF", "JTO"]);
const KEY = "grokbot-pages-v1";
const REPOS = [
  { slug: "TauricResearch/TradingAgents", state: "référence", sync: "Apache-2.0 · code non exécuté ici" },
  { slug: "sendaifun/solana-agent-kit", state: "référence", sync: "Apache-2.0 · code non exécuté ici" },
  { slug: "Jackhuang166/ai-memecoin-trading-bot", state: "inactif", sync: "dépôt introuvable (404) le 13 nov. 2026" },
];

const root = document.getElementById("app");
let view = "boot";
let sheet = null;
let sol = null;
let liveAddress = null;
let connectError = "";
let ticking = false;
let state = load();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (raw && typeof raw.cash === "number") return raw;
  } catch { /* fresh book */ }
  return fresh();
}
function fresh() {
  return {
    cash: 10000,
    initial: 10000,
    positions: [],
    trades: [],
    decisions: [],
    snaps: [{ t: Date.now(), equity: 10000 }],
    emergency: false,
    agents: {},
    markets: [],
    marketError: "",
    lastTick: 0,
    reposChecked: null,
    risk: { maxPosition: 500, riskBps: 100, dailyLoss: 300, maxExposure: 4000, maxOpen: 4, stopBps: 600, takeBps: 800, slipBps: 30, feeBps: 30 },
  };
}
function save() { localStorage.setItem(KEY, JSON.stringify(state)); }

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => {
    if (c === "&") return "\u0026amp;";
    if (c === "<") return "\u0026lt;";
    if (c === ">") return "\u0026gt;";
    if (c === '"') return "\u0026quot;";
    return "\u0026#39;";
  });
}
function usd(n, d = 2) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d }).format(Number.isFinite(n) ? n : 0);
}
function hero(n) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0);
}
function pct(n) {
  const sign = n > 0 ? "+" : "";
  return sign + new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0) + " %";
}
function hm(t) {
  if (!t) return "—";
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(t));
}
function when(t) {
  if (!t) return "—";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(t));
}
function tone(n) { return n > 0 ? "up" : n < 0 ? "down" : "muted"; }

function assess(m) {
  const reasons = [];
  let blocked = false;
  if (m.liquidityUsd < 25000) { blocked = true; reasons.push("liquidité sous 25 000 USD"); }
  if (m.volumeH24 < 5000) { blocked = true; reasons.push("volume 24 h sous 5 000 USD"); }
  if (Math.abs(m.changeH24) > 80 && m.liquidityUsd < 100000) { blocked = true; reasons.push("variation extrême"); }
  if (!reasons.length) reasons.push("liquidité et volume au-dessus des seuils");
  return { blocked, reasons };
}
function analyze(m) {
  let score = 50;
  score += Math.max(-20, Math.min(20, m.changeH1 * 4));
  score += Math.max(-15, Math.min(15, m.changeH24 * 0.35));
  if (m.volumeH24 > 1_000_000) score += 8;
  if (m.liquidityUsd > 500_000) score += 6;
  if (m.liquidityUsd < 50_000) score -= 8;
  score = Math.round(Math.max(0, Math.min(100, score)));
  const bias = score >= 62 ? "haussier" : score <= 40 ? "baissier" : "neutre";
  return { score, bias, reason: `Score ${score}/100, biais ${bias}. 1 h ${m.changeH1.toFixed(2)} %, 24 h ${m.changeH24.toFixed(2)} %.` };
}
function book() {
  const exposure = state.positions.reduce((s, p) => s + p.qty * (p.mark || p.avg), 0);
  const equity = state.cash + exposure;
  const pnl = equity - state.initial;
  return { exposure, equity, pnl, pct: state.initial ? (pnl / state.initial) * 100 : 0 };
}
function sizeFor(equity) {
  const r = state.risk;
  if (state.emergency) return { ok: false, usd: 0, reason: "arrêt : aucun nouvel achat" };
  const day = dayPnl();
  if (day <= -Math.abs(r.dailyLoss)) return { ok: false, usd: 0, reason: "limite de perte du jour atteinte" };
  if (state.positions.length >= r.maxOpen) return { ok: false, usd: 0, reason: "nombre maximal de positions atteint" };
  const exposure = book().exposure;
  const room = r.maxExposure - exposure;
  if (room < 15) return { ok: false, usd: 0, reason: "exposition maximale atteinte" };
  const stop = Math.max(r.stopBps, 50) / 10000;
  let usd = (Math.max(equity, 0) * (r.riskBps / 10000)) / stop;
  usd = Math.min(usd, r.maxPosition, room, Math.max(0, state.cash) * 0.98);
  usd = Math.round(usd * 100) / 100;
  if (usd < 15) return { ok: false, usd: 0, reason: "taille sous 15 USD simulés" };
  return { ok: true, usd, reason: "taille validée par le moteur de risque" };
}
function dayPnl() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return state.trades.filter((t) => t.side === "sell" && t.at >= start.getTime()).reduce((s, t) => s + (t.pnl || 0), 0);
}
function decide(agent, action, symbol, size, result, reason) {
  state.decisions.unshift({ id: Date.now() + Math.random(), at: Date.now(), agent, action, symbol, size, result, reason });
  state.decisions = state.decisions.slice(0, 40);
  state.agents[agent] = { status: "ok", summary: reason, symbol: symbol || null, at: Date.now() };
}
function fillBuy(mark, usd) {
  const slip = state.risk.slipBps / 10000;
  const price = mark * (1 + slip);
  const qty = price > 0 ? usd / price : 0;
  const fee = usd * (state.risk.feeBps / 10000);
  return { price, qty, fee, notional: usd };
}
function fillSell(pos, mark) {
  const slip = state.risk.slipBps / 10000;
  const price = mark * (1 - slip);
  const notional = pos.qty * price;
  const fee = notional * (state.risk.feeBps / 10000);
  const pnl = notional - fee - pos.qty * pos.avg;
  return { price, notional, fee, pnl };
}

async function fetchMarkets() {
  const boosts = await fetch("https://api.dexscreener.com/token-boosts/latest/v1").then((r) => r.ok ? r.json() : []).catch(() => []);
  const set = new Set(MINTS);
  for (const row of Array.isArray(boosts) ? boosts : []) {
    if (row.chainId === "solana" && row.tokenAddress) set.add(row.tokenAddress);
    if (set.size >= MINTS.length + 6) break;
  }
  const res = await fetch("https://api.dexscreener.com/tokens/v1/solana/" + [...set].join(","));
  if (!res.ok) throw new Error("DexScreener indisponible (" + res.status + ")");
  const pairs = await res.json();
  const best = new Map();
  for (const pair of Array.isArray(pairs) ? pairs : []) {
    if (pair.chainId !== "solana") continue;
    const address = pair.baseToken?.address;
    const symbol = pair.baseToken?.symbol;
    const priceUsd = Number(pair.priceUsd);
    if (!address || !symbol || !(priceUsd > 0)) continue;
    const row = {
      address, symbol,
      priceUsd,
      volumeH24: Number(pair.volume?.h24) || 0,
      liquidityUsd: Number(pair.liquidity?.usd) || 0,
      changeH1: Number(pair.priceChange?.h1) || 0,
      changeH24: Number(pair.priceChange?.h24) || 0,
    };
    const prev = best.get(address);
    if (!prev || row.liquidityUsd > prev.liquidityUsd) best.set(address, row);
  }
  return [...best.values()].sort((a, b) => b.volumeH24 - a.volumeH24);
}

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const markets = await fetchMarkets();
    state.markets = markets;
    state.marketError = markets.length ? "" : "Aucun prix exploitable";
    const by = new Map(markets.map((m) => [m.address, m]));
    for (const p of state.positions) {
      const m = by.get(p.address);
      if (m) p.mark = m.priceUsd;
    }
    for (const p of [...state.positions]) {
      const m = by.get(p.address);
      if (!m) continue;
      const ch = (m.priceUsd - p.avg) / p.avg;
      if (ch <= -state.risk.stopBps / 10000) sell(p, m, "stop");
      else if (ch >= state.risk.takeBps / 10000) sell(p, m, "objectif");
    }
    const blocked = markets.filter((m) => assess(m).blocked);
    decide("scanner", "HOLD", markets[0]?.symbol || null, null, "lecture", markets.length + " tokens cotés via DexScreener");
    decide("safety", blocked.length ? "BLOCK" : "HOLD", blocked[0]?.symbol || null, null, blocked.length ? "bloqué" : "ok", blocked.length ? blocked.slice(0, 4).map((m) => m.symbol).join(", ") + " filtrés" : "seuils de liquidité respectés");
    const top = markets.find((m) => MAJORS.has(m.symbol)) || markets[0];
    if (top) {
      const a = analyze(top);
      decide("analyst", a.score >= 62 ? "HOLD" : "HOLD", top.symbol, null, "score " + a.score, a.reason);
    }
    const equity = book().equity;
    const sized = sizeFor(equity);
    decide("risk", "HOLD", null, sized.usd || null, sized.ok ? "ok" : "limite", sized.reason + ". Perte du jour " + usd(dayPnl()) + ".");
    if (!state.emergency && sized.ok) {
      const pick = markets.find((m) => {
        if (!MAJORS.has(m.symbol)) return false;
        if (state.positions.some((p) => p.address === m.address)) return false;
        if (assess(m).blocked) return false;
        const a = analyze(m);
        return m.changeH1 >= 1.2 && a.score >= 62;
      });
      if (pick) buy(pick, sized.usd, "Momentum majeur. " + analyze(pick).reason);
      else decide("executor", "HOLD", null, null, "rien à faire", "Aucune entrée majeure ne passe Safety et Analyst. Simulation. Aucune transaction blockchain.");
    } else {
      decide("executor", "HOLD", null, null, "en attente", sized.reason + " Simulation. Aucune transaction blockchain.");
    }
    const eq = book().equity;
    state.snaps.push({ t: Date.now(), equity: Math.round(eq * 100) / 100 });
    state.snaps = state.snaps.slice(-180);
    state.lastTick = Date.now();
    save();
  } catch (err) {
    state.marketError = err instanceof Error ? err.message : "Marché indisponible";
    save();
  } finally {
    ticking = false;
    if (view === "desk" || view === "bureau") paint();
  }
}

function buy(m, usdAmt, why) {
  const fill = fillBuy(m.priceUsd, usdAmt);
  if (state.cash < usdAmt + fill.fee) {
    decide("executor", "HOLD", m.symbol, usdAmt, "refusé", "cash simulé insuffisant");
    return;
  }
  state.cash -= usdAmt + fill.fee;
  state.positions.push({ address: m.address, symbol: m.symbol, qty: fill.qty, avg: fill.price, mark: m.priceUsd, at: Date.now() });
  state.trades.push({ at: Date.now(), side: "buy", symbol: m.symbol, usd: usdAmt, fee: fill.fee, pnl: null, price: fill.price, simulated: true });
  decide("executor", "BUY", m.symbol, usdAmt, "simulé", why + " Simulation. Aucune transaction blockchain.");
}
function sell(pos, m, why) {
  const fill = fillSell(pos, m.priceUsd);
  state.cash += fill.notional - fill.fee;
  state.positions = state.positions.filter((p) => p !== pos);
  state.trades.push({ at: Date.now(), side: "sell", symbol: pos.symbol, usd: fill.notional, fee: fill.fee, pnl: fill.pnl, price: fill.price, simulated: true });
  decide("executor", "SELL", pos.symbol, fill.notional, "simulé", why + ". PnL " + usd(fill.pnl) + ". Simulation. Aucune transaction blockchain.");
}

function phantom() {
  const w = window;
  return w.phantom?.solana?.isPhantom ? w.phantom.solana : w.solana?.isPhantom ? w.solana : null;
}

async function connectPhantom() {
  const p = phantom();
  connectError = "";
  if (!p) {
    connectError = "Phantom n’est pas injecté dans Safari. Le bouton CONNECTED reste masqué. Ouvrez la page dans le navigateur Phantom si vous voulez la lecture du wallet.";
    paint();
    return;
  }
  try {
    const res = await p.connect();
    liveAddress = res.publicKey.toString();
    state.wallet = liveAddress;
    save();
    sheet = null;
    view = "desk";
    paint();
    readSol(liveAddress);
  } catch (err) {
    liveAddress = null;
    connectError = err instanceof Error ? err.message : "Connexion refusée";
    paint();
  }
}
async function readSol(address) {
  try {
    const res = await fetch("https://api.mainnet-beta.solana.com", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [address] }),
    });
    const body = await res.json();
    if (body.result?.value == null) throw new Error(body.error?.message || "RPC");
    sol = body.result.value / 1e9;
  } catch {
    sol = null;
  }
  paint();
}

function multLabel(m) {
  const digits = Math.abs(m - 1) < 0.01 ? 4 : 2;
  return "×" + m.toFixed(digits);
}
function chart(snaps) {
  const pts = snaps.length === 1 ? [snaps[0], { ...snaps[0], t: snaps[0].t + 1 }] : snaps.slice(-80);
  if (pts.length < 2) return "";
  const min = Math.min(...pts.map((p) => p.equity));
  const max = Math.max(...pts.map((p) => p.equity));
  const pad = Math.max(Math.abs(max) * 0.004, 1);
  const lo = min - pad;
  const hi = max + pad;
  const w = 360;
  const h = 120;
  const xy = pts.map((p, i) => {
    const x = (i / (pts.length - 1)) * w;
    const y = h - ((p.equity - lo) / (hi - lo)) * (h - 8) - 4;
    return [x, y];
  });
  const line = xy.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  const area = `0,${h} ` + line + ` ${w},${h}`;
  const last = xy[xy.length - 1];
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="Courbe de la valeur simulée">
    <polygon points="${area}" fill="#0b7a52" opacity="0.14"></polygon>
    <polyline points="${line}" fill="none" stroke="#0b7a52" stroke-width="2" vector-effect="non-scaling-stroke"></polyline>
    <circle cx="${last[0]}" cy="${last[1]}" r="3.5" fill="#0b7a52"></circle>
  </svg>`;
}

function paint() {
  const y = document.scrollingElement ? document.scrollingElement.scrollTop : 0;
  root.innerHTML = render();
  if (document.scrollingElement) document.scrollingElement.scrollTop = y;
  bind();
}

function render() {
  if (view === "boot") return boot();
  if (view === "phantom") return phantomScreen();
  if (view === "legal") return legal();
  return desk();
}

function boot() {
  return `<div class="center">
    ${logo(64)}
    <h1>Grok Bot</h1>
    <p class="muted">terminal / meme mode</p>
    <div class="spin"></div>
    <ul style="text-align:left;width:100%;max-width:280px;font-size:14px;padding:0;list-style:none">
      <li>01 Initialisation des repositories <span class="up" style="float:right">ok</span></li>
      <li style="margin-top:8px">02 Initialisation des agents</li>
    </ul>
  </div>`;
}
function logo(n) {
  return `<svg class="mark" width="${n}" height="${n}" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#0b7a52"/><path d="M9 16.5h8.2a4.2 4.2 0 1 0 0-8.4H11.2V23" fill="none" stroke="#f4fff8" stroke-width="2.2" stroke-linecap="round"/></svg>`;
}
function phantomScreen() {
  const connected = Boolean(liveAddress);
  return `<div class="pad center" style="justify-content:flex-start;padding-top:48px">
    <div class="row" style="justify-content:center;gap:16px">${logo(48)}
      <svg width="48" height="48" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#ab9ff2"/><path d="M9 14.5c.2-3.4 2.6-6 7-6s6.8 2.6 7 6V22h-2.4l-1.3-2.2h-.2L17.8 22h-3.6l-1.3-2.2h-.2L11.4 22H9z" fill="#fff"/></svg>
    </div>
    <h1>Connect Phantom</h1>
    <p class="muted">Solana</p>
    <div class="card" style="width:100%;text-align:left;margin-top:18px">
      <div class="muted" style="font-size:12px">Wallet</div>
      <div style="font-weight:650;margin-top:4px">${connected ? "Phantom" : "Aucun wallet connecté"}</div>
      <div class="num" style="font-size:12px;margin-top:8px;word-break:break-all">${esc(liveAddress || "—")}</div>
      <div class="muted" style="font-size:12px;margin-top:8px">Solde réel : ${sol == null ? "indisponible sans connexion" : esc(sol.toLocaleString("fr-FR", { maximumFractionDigits: 4 })) + " SOL"}</div>
    </div>
    <ul class="plain" style="text-align:left;width:100%">
      <li>View balance and activity.</li>
      <li>Request approval for transactions.</li>
      <li>Can’t move funds without your approval.</li>
    </ul>
    ${connectError ? `<p class="down" style="font-size:14px">${esc(connectError)}</p>` : ""}
    ${phantom() ? "" : `<p class="muted" style="font-size:14px">Phantom n’est pas disponible dans ce navigateur. CONNECTED n’est pas affiché.</p>`}
    ${connected
      ? `<button class="btn btn-green" id="go" style="margin-top:18px">CONNECTED</button>`
      : `<button class="btn btn-ink" id="connect" style="margin-top:18px" ${phantom() ? "" : "disabled"}>Connecter Phantom</button>`}
    <button class="ghost" id="skip">Continuer en simulation, sans wallet</button>
  </div>`;
}

function desk() {
  const b = book();
  const mult = state.initial > 0 ? b.equity / state.initial : null;
  const live = state.marketError ? "HORS LIGNE" : state.lastTick && Date.now() - state.lastTick < 120000 ? "LIVE" : "HORS LIGNE";
  const ticker = state.markets.filter((m) => /^[A-Za-z0-9$]{2,10}$/.test(m.symbol) && (m.liquidityUsd >= 80000 || MAJORS.has(m.symbol))).slice(0, 10);
  const doubled = ticker.concat(ticker);
  const agents = [
    ["scanner", "SCANNER", "var(--scanner)", "recherche de tokens"],
    ["safety", "SAFETY", "var(--safety)", "analyse des risques"],
    ["analyst", "ANALYST", "var(--analyst)", "analyse des marchés"],
    ["risk", "RISK", "var(--risk)", "limites de risque"],
    ["executor", "EXECUTOR", "var(--executor)", "prépare l’exécution"],
  ];
  return `<div class="pad">
    <header class="row" style="align-items:flex-start">
      <div class="row" style="justify-content:flex-start;gap:8px">${logo(32)}
        <div><div style="font-weight:700;font-size:14px">Grok Bot</div><div class="muted" style="font-size:12px">meme mode</div></div>
      </div>
      <div style="text-align:right">
        <div class="live"><span class="dot" style="background:${live === "LIVE" ? "var(--up)" : "var(--down)"}"></span> ${live}</div>
        <button type="button" id="wallet" class="muted" style="font-size:12px;margin-top:4px;text-align:right">${liveAddress ? "Phantom " + esc(liveAddress.slice(0, 4) + "…" + liveAddress.slice(-4)) : "Ajouter un wallet"}</button>
        ${liveAddress && sol != null ? `<div class="num" style="font-size:12px">${esc(sol.toLocaleString("fr-FR", { maximumFractionDigits: 4 }))} SOL</div>` : ""}
      </div>
    </header>
    <div class="ticker">${state.marketError
      ? `<p class="down" style="font-size:12px;padding:8px 0">${esc(state.marketError)}. Aucun cours inventé.</p>`
      : `<div class="ticker-track">${doubled.map((m) => `<span class="chip"><b>${esc(m.symbol)}</b><span class="num">${esc(usd(m.priceUsd, m.priceUsd >= 1 ? 2 : 4))}</span><span class="num ${tone(m.changeH24)}">${esc(pct(m.changeH24))}</span><span class="dot" style="background:${m.changeH24 < 0 ? "var(--down)" : "var(--up)"}"></span></span>`).join("")}</div>`}
    </div>
    <p class="hero num">${esc(hero(b.equity))}</p>
    <p class="muted" style="margin:4px 0 0;font-size:14px">valeur actuelle du portefeuille simulé</p>
    <p class="num ${tone(b.pnl)}" style="margin:4px 0 0;font-weight:650">${b.pnl > 0 ? "+" : ""}${esc(usd(b.pnl))}</p>
    <dl class="stats">
      <div><dt class="muted">Capital initial</dt><dd class="num"><b>${esc(hero(state.initial))}</b></dd></div>
      <div><dt class="muted">Trades</dt><dd class="num"><b>${state.trades.length}</b></dd></div>
      <div><dt class="muted">Multiplicateur</dt><dd class="num ${mult > 1 ? "up" : mult < 1 ? "down" : ""}"><b>${mult == null ? "—" : esc(multLabel(mult))}</b></dd></div>
    </dl>
    ${chart(state.snaps)}
    ${state.emergency ? `<p class="down" style="font-size:12px">Arrêt des nouveaux achats. Les sorties de stop restent possibles.</p>` : ""}
    <h2 class="muted">Repositories</h2>
    ${REPOS.map((r) => `<article class="repo"><div class="row"><b>${esc(r.slug)}</b><span>${esc(r.state)}</span></div><div class="muted" style="margin-top:4px">${esc(r.sync)}</div><div class="muted">${state.reposChecked ? "contrôlé " + esc(when(state.reposChecked)) : "contrôle au chargement"}</div></article>`).join("")}
    <h2>AGENTS · WORKING ON REPOS</h2>
    ${agents.map(([id, label, color, job]) => {
      const row = state.agents[id];
      return `<div class="agent"><span style="color:${color}">●</span><div><div class="row"><b style="color:${color}">${label}</b><span class="num">${esc(row?.symbol || "—")}</span></div><div class="muted">${esc(row?.summary || job)}</div></div><div style="text-align:right"><div>${esc(row?.status || "idle")}</div><div class="num muted">${esc(hm(row?.at))}</div></div></div>`;
    }).join("")}
    <div class="row"><h2 style="margin:0">GROK CORE · DECISIONS</h2><span class="muted" style="font-size:12px">${live === "LIVE" ? "sync" : "en attente"}</span></div>
    ${state.decisions.slice(0, 8).map((d) => `<div class="dec"><div class="row"><span><span class="num muted">${esc(hm(d.at))}</span> <b class="${d.action === "BUY" ? "up" : d.action === "SELL" ? "down" : ""}">${esc(d.action)}</b> ${esc(d.symbol || "—")} <span class="num muted">${d.size == null ? "" : esc(usd(d.size))}</span></span><span class="muted">${esc(d.agent)}</span></div><div class="muted">${esc(d.result)} · ${esc(d.reason)}</div></div>`).join("") || `<p class="muted" style="font-size:12px">Aucune décision. Le premier passage lit DexScreener.</p>`}
    <button class="btn btn-line" id="recap" style="margin-top:16px">Night recap</button>
    <button class="btn btn-line" id="bureau" style="margin-top:8px">Bureau · offres et réglages</button>
    <p class="note">Ouvert depuis GitHub Pages, dans Safari. Pas de serveur : le moteur tourne dans cet onglet, les chiffres restent sur cet appareil. Les trades sont simulés. Aucune signature Solana n’est envoyée.</p>
    ${sheet === "recap" ? recap(b, mult) : ""}
    ${sheet === "wallet" ? walletSheet() : ""}
    ${sheet === "bureau" ? bureau() : ""}
  </div>`;
}

function recap(b, mult) {
  const sells = state.trades.filter((t) => t.side === "sell" && t.pnl != null);
  const best = sells.reduce((a, t) => (a == null || t.pnl > a.pnl ? t : a), null);
  const worst = sells.reduce((a, t) => (a == null || t.pnl < a.pnl ? t : a), null);
  const rows = [
    ["Capital initial", hero(state.initial)],
    ["Valeur finale", hero(b.equity)],
    ["Multiplicateur", mult == null ? "—" : multLabel(mult)],
    ["Trades", String(state.trades.length)],
    ["Tokens", String(new Set(state.trades.map((t) => t.symbol)).size)],
    ["Positions", String(state.positions.length)],
    ["Agents", "5"],
    ["Meilleure", best ? best.symbol + " " + usd(best.pnl) : "aucune clôture"],
    ["Pire", worst ? worst.symbol + " " + usd(worst.pnl) : "aucune clôture"],
  ];
  return `<div class="sheet"><div><h2 style="font-size:18px;letter-spacing:-0.02em">Night recap</h2>
    <p class="muted">Session enregistrée sur cet appareil. Pas une performance de la vidéo.</p>
    ${rows.map(([k, v]) => `<div class="kvs"><span class="muted">${esc(k)}</span><b class="num">${esc(v)}</b></div>`).join("")}
    <button class="btn btn-green" id="close" style="margin-top:12px">Fermer</button></div></div>`;
}

function walletSheet() {
  const connected = Boolean(liveAddress);
  return `<div class="sheet"><div>
    <h2 style="font-size:18px">Wallet</h2>
    <p class="muted">Optionnel. La lecture se fait ici, dans l’espace. Rien n’est demandé à l’ouverture.</p>
    <div class="card" style="margin-top:12px">
      <div class="muted" style="font-size:12px">Adresse publique</div>
      <div class="num" style="font-size:12px;margin-top:6px;word-break:break-all">${esc(liveAddress || "aucune")}</div>
      <div class="muted" style="font-size:12px;margin-top:8px">Solde réel : ${sol == null ? "pas lu" : esc(sol.toLocaleString("fr-FR", { maximumFractionDigits: 4 })) + " SOL"}</div>
    </div>
    ${connectError ? `<p class="down" style="font-size:14px">${esc(connectError)}</p>` : ""}
    ${phantom() ? "" : `<p class="muted">Phantom n’est pas injecté dans ce navigateur. Aucune adresse inventée.</p>`}
    ${connected
      ? `<button class="btn btn-line" id="forget" style="margin-top:12px">Retirer le wallet de cet espace</button>`
      : `<button class="btn btn-ink" id="connect" style="margin-top:12px" ${phantom() ? "" : "disabled"}>Connecter Phantom</button>`}
    <button class="ghost" id="close">Fermer</button>
  </div></div>`;
}

function forgetWallet() {
  liveAddress = null;
  sol = null;
  state.wallet = null;
  connectError = "";
  const p = phantom();
  if (p && typeof p.disconnect === "function") p.disconnect().catch(() => undefined);
  save();
  paint();
}

function bureau() {
  const r = state.risk;
  return `<div class="sheet"><div>
    <h2 style="font-size:18px">Bureau</h2>
    <p class="muted">Logiciel de simulation. Ce n’est pas un service d’investissement. Stripe n’encaisse rien sur GitHub Pages : les tarifs ne sont pas publiés (0 € n’est pas un prix).</p>
    <div class="card"><b>GROKBOT_STARTER</b><div class="muted">Tableau, scanner, simulation, historique.</div></div>
    <div class="card" style="margin-top:8px"><b>GROKBOT_PRO</b><div class="muted">Stratégies, agents, alertes, wallet en lecture.</div></div>
    <div class="card" style="margin-top:8px"><b>GROKBOT_PREMIUM</b><div class="muted">Limites, rapport, préparation d’automatisation.</div></div>
    <div class="card" style="margin-top:8px"><b>GROKBOT_LIFETIME</b><div class="muted">Accès unique, périmètre fixé hors de cette page.</div></div>
    <p class="muted">Le compte OWNER gratuit est appliqué sur le serveur du produit, pas dans cette page statique. Ici, la simulation est ouverte dans votre navigateur.</p>
    <h2 style="margin-top:16px">Limites de risque</h2>
    ${field("maxPosition", "Taille max (USD)", r.maxPosition)}
    ${field("dailyLoss", "Perte max du jour (USD)", r.dailyLoss)}
    ${field("maxOpen", "Positions max", r.maxOpen)}
    <button class="btn ${state.emergency ? "btn-green" : "btn-ink"}" id="stop" style="margin-top:14px">${state.emergency ? "Reprendre les achats" : "STOP achats"}</button>
    <button class="btn btn-line" id="export" style="margin-top:8px">Exporter le journal</button>
    <button class="btn btn-line" id="wipe" style="margin-top:8px">Effacer ce navigateur</button>
    <a class="btn btn-line" id="legal" href="#risques" style="margin-top:8px">Risques et mentions</a>
    <button class="ghost" id="close">Fermer</button>
  </div></div>`;
}
function field(id, label, value) {
  return `<label for="${id}">${esc(label)}</label><input id="${id}" type="number" min="0" step="1" value="${esc(value)}" />`;
}
function legal() {
  return `<div class="pad">
    <button class="ghost" id="back">← Terminal</button>
    <h1 style="font-size:26px">Risques</h1>
    <p>Grok Bot est un logiciel. Cette page GitHub montre une simulation sur des prix Solana publics. Elle ne détient pas vos fonds, n’envoie pas de transaction et ne promet aucun gain.</p>
    <h2 style="font-size:16px">Mentions</h2>
    <p>Activité distincte de tout autre site. Aucun Price ID Stripe de ce site n’est utilisé ici, parce que GitHub Pages ne peut pas recevoir un paiement.</p>
    <h2 style="font-size:16px">Confidentialité</h2>
    <p>Le carnet, les décisions et l’adresse publique éventuellement lue restent dans le stockage local de ce navigateur. Rien n’est envoyé vers une base Grok Bot. Les prix sont demandés à DexScreener. Le solde SOL, si Phantom est connecté, est lu sur un RPC public.</p>
    <h2 style="font-size:16px">Conditions</h2>
    <p>L’usage de cette page est une démonstration du logiciel. Les dépôts cités sont des références de licence : leur code n’est pas exécuté. Un dépôt introuvable n’est pas affiché comme actif.</p>
  </div>`;
}

function bind() {
  const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
  on("wallet", () => { connectError = ""; sheet = "wallet"; paint(); });
  on("connect", () => connectPhantom());
  on("forget", () => forgetWallet());
  on("recap", () => { sheet = "recap"; paint(); });
  on("bureau", () => { sheet = "bureau"; paint(); });
  on("close", () => { sheet = null; paint(); });
  on("stop", () => { state.emergency = !state.emergency; save(); paint(); });
  on("legal", (e) => { e.preventDefault(); sheet = null; view = "legal"; paint(); });
  on("back", () => { view = "desk"; paint(); });
  on("export", () => {
    const blob = new Blob([JSON.stringify({ trades: state.trades, decisions: state.decisions, snaps: state.snaps }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "grok-bot-journal.json";
    a.click();
  });
  on("wipe", () => {
    if (!confirm("Effacer le carnet simulé de ce navigateur ?")) return;
    state = fresh();
    save();
    sheet = null;
    paint();
  });
  for (const id of ["maxPosition", "dailyLoss", "maxOpen"]) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.onchange = () => {
      const n = Number(el.value);
      if (!Number.isFinite(n) || n < 0) return;
      state.risk[id] = id === "maxOpen" ? Math.max(1, Math.min(12, Math.round(n))) : Math.min(100000, n);
      save();
    };
  }
}

async function checkRepos() {
  for (const repo of REPOS) {
    try {
      const res = await fetch("https://api.github.com/repos/" + repo.slug, { headers: { accept: "application/vnd.github+json" } });
      if (res.status === 404) {
        repo.state = "inactif";
        repo.sync = "dépôt introuvable";
      } else if (res.ok) {
        const body = await res.json();
        const lic = body.license?.spdx_id || "licence non déclarée";
        repo.state = "référence";
        repo.sync = lic + " · code non exécuté";
      }
    } catch { /* conserve le statut déjà connu */ }
  }
  state.reposChecked = Date.now();
  save();
  if (view === "desk") paint();
}

view = "boot";
paint();
if (state.wallet) {
  liveAddress = state.wallet;
  readSol(state.wallet);
}
setTimeout(() => { view = "desk"; paint(); tick(); }, 900);
setInterval(() => { if (view === "desk") tick(); }, 50000);
checkRepos();

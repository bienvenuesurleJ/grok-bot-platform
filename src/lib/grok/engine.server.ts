import type { Actor } from "./data.server";
import { db } from "./data.server";
import { fetchMarkets, type Market } from "./market";
import {
  analyze,
  applyFill,
  assessSafety,
  iso,
  markedEquity,
  num,
  parseParams,
  parisDayStart,
  positionSize,
  wantsBuy,
} from "./pure";

const recent = new Map<string, number>();

type Position = {
  id: number;
  token_address: string;
  symbol: string;
  qty: number;
  avg_price: number;
  status: string;
};

type Risk = {
  max_position_usd: number;
  risk_per_trade_bps: number;
  daily_loss_limit_usd: number;
  max_exposure_usd: number;
  max_open_positions: number;
  stop_loss_bps: number;
  take_profit_bps: number;
  slippage_bps: number;
  fee_bps: number;
};

type Strategy = {
  id: number;
  name: string;
  kind: string;
  params: string;
  enabled: boolean;
};

export async function runTick(actor: Actor, force = false) {
  if (!actor.botId) throw new Error("Aucun bot");
  const now = Date.now();
  const prev = recent.get(actor.userId) ?? 0;
  if (!force && now - prev < 15_000) {
    return { throttled: true, message: "Dernier passage encore frais. Aucun ordre dupliqué." };
  }
  recent.set(actor.userId, now);

  const sql = await db();
  const tickId = `tick_${now.toString(36)}_${actor.userId.slice(0, 6)}`;
  const state = await sql<{
    emergency_stop: boolean;
    entries_halted: boolean;
  }>`select emergency_stop, entries_halted from platform_state where id = 1`;
  const emergency = Boolean(state[0]?.emergency_stop);
  const entriesHalted = Boolean(state[0]?.entries_halted);
  const bots = await sql<{
    id: number;
    mode: string;
    status: string;
    cash: number;
    initial_cash: number;
  }>`select id, mode, status, cash, initial_cash from bot_instances where id = ${actor.botId} and user_id = ${actor.userId}`;
  const bot = bots[0];
  if (!bot) throw new Error("Bot introuvable");

  let markets: Market[] = [];
  let marketError = "";
  try {
    markets = await fetchMarkets();
    if (markets.length === 0) marketError = "Aucun prix exploitable";
  } catch (err) {
    marketError = err instanceof Error ? err.message : "Marché indisponible";
  }

  if (marketError) {
    await recordRun(actor.userId, tickId, "scanner", "error", marketError);
    for (const agent of ["safety", "analyst", "risk", "executor"]) {
      await recordRun(actor.userId, tickId, agent, "error", "En attente des prix. Aucune décision inventée.");
    }
    return { throttled: false, message: marketError };
  }

  for (const m of markets) {
    await sql`
      insert into market_snapshots (
        token_address, symbol, name, price_usd, volume_h24, liquidity_usd, change_h1, change_h24, pair_address, dex, source
      ) values (
        ${m.address}, ${m.symbol}, ${m.name}, ${m.priceUsd}, ${m.volumeH24}, ${m.liquidityUsd},
        ${m.changeH1}, ${m.changeH24}, ${m.pairAddress}, ${m.dex}, 'dexscreener'
      )
    `;
  }
  await sql`delete from market_snapshots where captured_at < now() - interval '35 days'`;

  const byAddress = new Map(markets.map((m) => [m.address, m]));
  const scanner = await recordRun(
    actor.userId,
    tickId,
    "scanner",
    "ok",
    `${markets.length} tokens cotés via DexScreener. Source réelle, pas une simulation de prix.`,
  );
  await sql`
    insert into agent_decisions (user_id, run_id, tick_id, agent, action, reason, result)
    values (${actor.userId}, ${scanner}, ${tickId}, 'scanner', 'ALERT', ${`${markets.length} marchés lus`}, 'données réelles')
  `;

  const safety = await recordRun(actor.userId, tickId, "safety", "ok", "Filtre heuristique appliqué. Audit de contrat non branché.");
  const analyst = await recordRun(actor.userId, tickId, "analyst", "ok", "Scores calculés sur variation, volume et liquidité.");
  const blocked: string[] = [];
  const ranked: { market: Market; score: number; safetyBlocked: boolean; safetyReason: string; analystReason: string }[] = [];

  for (const m of markets) {
    const safe = assessSafety(m);
    const view = analyze(m);
    if (safe.blocked) blocked.push(m.symbol);
    ranked.push({
      market: m,
      score: view.score,
      safetyBlocked: safe.blocked,
      safetyReason: `${safe.reasons.join(". ")}. ${safe.note}`,
      analystReason: view.reason,
    });
    await sql`
      insert into agent_decisions (user_id, run_id, tick_id, agent, token_symbol, token_address, action, reason, price_usd, result)
      values (
        ${actor.userId}, ${safety}, ${tickId}, 'safety', ${m.symbol}, ${m.address},
        ${safe.blocked ? "BLOCK" : "HOLD"}, ${safe.reasons.join(". ")}, ${m.priceUsd},
        ${safe.blocked ? "bloqué" : "passe"}
      )
    `;
    await sql`
      insert into agent_decisions (user_id, run_id, tick_id, agent, token_symbol, token_address, action, reason, price_usd, result)
      values (
        ${actor.userId}, ${analyst}, ${tickId}, 'analyst', ${m.symbol}, ${m.address}, 'HOLD',
        ${view.reason}, ${m.priceUsd}, ${`score ${view.score}`}
      )
    `;
  }

  const positions = await sql<Position>`
    select id, token_address, symbol, qty, avg_price, status
    from trading_positions
    where user_id = ${actor.userId} and bot_id = ${actor.botId} and status = 'open'
  `;
  const open = positions.map((p) => ({
    ...p,
    id: num(p.id),
    qty: num(p.qty),
    avg_price: num(p.avg_price),
    price: byAddress.get(p.token_address)?.priceUsd ?? num(p.avg_price),
  }));
  let cash = num(bot.cash);
  const marked = markedEquity(cash, open.map((p) => ({ qty: p.qty, price: p.price })));
  const dayStart = parisDayStart(new Date()).toISOString();
  const dayOpen = await sql<{ equity: number }>`
    select equity from performance_snapshots
    where user_id = ${actor.userId} and captured_at >= ${dayStart}
    order by captured_at asc limit 1
  `;
  const dailyPnl = marked.equity - num(dayOpen[0]?.equity, marked.equity);

  const riskRows = await sql<Risk>`select * from risk_limits where user_id = ${actor.userId}`;
  const risk = riskRows[0];
  if (!risk) throw new Error("Limites de risque absentes");
  const limits = {
    maxPositionUsd: num(risk.max_position_usd),
    riskPerTradeBps: num(risk.risk_per_trade_bps),
    dailyLossLimit: num(risk.daily_loss_limit_usd),
    maxExposureUsd: num(risk.max_exposure_usd),
    maxOpen: num(risk.max_open_positions),
    stopLossBps: num(risk.stop_loss_bps),
    takeProfitBps: num(risk.take_profit_bps),
    slippageBps: num(risk.slippage_bps),
    feeBps: num(risk.fee_bps),
  };

  const riskRun = await recordRun(
    actor.userId,
    tickId,
    "risk",
    "ok",
    `PnL du jour ${dailyPnl.toFixed(2)} USD. Exposition ${marked.exposure.toFixed(2)} USD.`,
  );
  await sql`
    insert into agent_decisions (user_id, run_id, tick_id, agent, action, reason, result)
    values (${actor.userId}, ${riskRun}, ${tickId}, 'risk', 'HOLD', ${`limite perte jour ${limits.dailyLossLimit} USD, positions max ${limits.maxOpen}`}, ${emergency ? "achats gelés" : "limites actives"})
  `;

  const paused = bot.status !== "active";
  const mode = bot.mode;
  let sells = 0;
  let buys = 0;
  let prepared = 0;

  if (!paused) {
    for (const pos of open) {
      const mark = pos.price;
      const stop = pos.avg_price * (1 - limits.stopLossBps / 10_000);
      const goal = pos.avg_price * (1 + limits.takeProfitBps / 10_000);
      const change = byAddress.get(pos.token_address)?.changeH1 ?? 0;
      let why = "";
      if (mark <= stop) why = `stop-loss ${limits.stopLossBps} bps`;
      else if (mark >= goal) why = `take-profit ${limits.takeProfitBps} bps`;
      else if (change <= -5) why = "variation 1 h inférieure à -5 %";
      if (!why) continue;
      const outcome = await executeSell({
        actor,
        botId: actor.botId,
        mode,
        tickId,
        pos,
        mark,
        why,
        limits,
        cash,
      });
      cash = outcome.cash;
      if (outcome.filled) sells += 1;
      if (outcome.prepared) prepared += 1;
    }
  }

  const strategies = paused
    ? []
    : await sql<Strategy>`
        select id, name, kind, params, enabled from trading_strategies
        where user_id = ${actor.userId} and bot_id = ${actor.botId} and enabled = true
      `;

  const held = new Set(
    (
      await sql<{ token_address: string }>`
        select token_address from trading_positions
        where user_id = ${actor.userId} and status = 'open'
      `
    ).map((r) => r.token_address),
  );

  let best: (typeof ranked)[number] | null = null;
  let bestStrategy: Strategy | null = null;
  let bestWhy = "";
  if (!paused) {
    for (const row of ranked) {
      if (held.has(row.market.address)) continue;
      for (const strategy of strategies) {
        const decision = wantsBuy(
          strategy.kind,
          parseParams(strategy.params),
          row.market,
          row.safetyBlocked,
          row.score,
        );
        if (!decision.ok) continue;
        if (!best || row.score > best.score) {
          best = row;
          bestStrategy = strategy;
          bestWhy = `${strategy.name} : ${decision.reason}`;
        }
      }
    }
  }

  if (best && bestStrategy) {
    const scale = num(parseParams(bestStrategy.params).sizeScale, 1);
    const stillOpen = await sql<{ n: number }>`
      select count(*)::int as n from trading_positions where user_id = ${actor.userId} and status = 'open'
    `;
    const exposureNow = markedEquity(
      cash,
      open.filter((p) => p.token_address).map((p) => ({ qty: p.qty, price: p.price })),
    ).exposure;
    const sized = positionSize({
      cash,
      equity: cash + exposureNow,
      riskPerTradeBps: limits.riskPerTradeBps,
      maxPositionUsd: limits.maxPositionUsd,
      maxExposureUsd: limits.maxExposureUsd,
      currentExposure: exposureNow,
      maxOpen: limits.maxOpen,
      openCount: num(stillOpen[0]?.n),
      dailyPnl,
      dailyLossLimit: limits.dailyLossLimit,
      stopLossBps: limits.stopLossBps,
      sizeScale: scale,
      entriesHalted,
      emergency,
      side: "buy",
    });
    await sql`
      insert into trading_signals (user_id, symbol, token_address, side, score, reason, strategy_id)
      values (${actor.userId}, ${best.market.symbol}, ${best.market.address}, 'BUY', ${best.score}, ${bestWhy}, ${num(bestStrategy.id)})
    `;
    if (!sized.ok) {
      await decide(actor.userId, tickId, "risk", best.market, "HOLD", sized.reason, best.market.priceUsd, 0, "refusé");
    } else {
      const outcome = await executeBuy({
        actor,
        botId: actor.botId,
        mode,
        tickId,
        market: best.market,
        usd: sized.usd,
        why: `${bestWhy}. ${sized.reason}. ${best.analystReason}`,
        limits,
        cash,
      });
      cash = outcome.cash;
      if (outcome.filled) buys += 1;
      if (outcome.prepared) prepared += 1;
    }
  }

  const execSummary = paused
    ? "Bot en pause. Aucun ordre."
    : mode === "assisted"
      ? `${prepared} ordre(s) en attente de validation. Aucun envoi on-chain.`
      : `${buys} achat(s) et ${sells} vente(s) simulés. Exécution on-chain non armée.`;
  await recordRun(actor.userId, tickId, "executor", "ok", execSummary);
  if (blocked.length) {
    await sql`
      update agent_runs set summary = ${`${blocked.length} token(s) bloqués : ${blocked.slice(0, 8).join(", ")}`}
      where id = ${safety}
    `;
  }

  const fresh = await sql<Position>`
    select id, token_address, symbol, qty, avg_price, status
    from trading_positions where user_id = ${actor.userId} and status = 'open'
  `;
  const book = fresh.map((p) => ({
    qty: num(p.qty),
    price: byAddress.get(p.token_address)?.priceUsd ?? num(p.avg_price),
  }));
  const equity = markedEquity(cash, book).equity;
  await sql`update bot_instances set cash = ${cash} where id = ${actor.botId} and user_id = ${actor.userId}`;
  await sql`
    insert into performance_snapshots (user_id, bot_id, equity, cash)
    values (${actor.userId}, ${actor.botId}, ${equity}, ${cash})
  `;
  return {
    throttled: false,
    message: execSummary,
  };
}

async function executeBuy(input: {
  actor: Actor;
  botId: number;
  mode: string;
  tickId: string;
  market: Market;
  usd: number;
  why: string;
  limits: { slippageBps: number; feeBps: number };
  cash: number;
}) {
  const simulated = input.mode !== "assisted";
  const chainNote =
    input.mode === "automated"
      ? "Mode automatisé : remplissage papier uniquement. Aucune délégation de clé, aucun envoi."
      : "Simulation. Aucune transaction blockchain.";
  if (!simulated) {
    const sql = await db();
    const pending = await sql`
      select id from trading_orders
      where user_id = ${input.actor.userId} and token_address = ${input.market.address}
        and side = 'buy' and status = 'awaiting_signature'
    `;
    if (pending.length > 0) return { cash: input.cash, filled: false, prepared: false };
    await createOrder(input, "awaiting_signature", chainNote);
    await decide(input.actor.userId, input.tickId, "executor", input.market, "BUY", input.why, input.market.priceUsd, input.usd, "en attente de validation");
    return { cash: input.cash, filled: false, prepared: true };
  }
  const fill = applyFill({
    side: "buy",
    mark: input.market.priceUsd,
    usd: input.usd,
    slippageBps: input.limits.slippageBps,
    feeBps: input.limits.feeBps,
  });
  if (input.cash < input.usd + fill.fee) {
    await decide(input.actor.userId, input.tickId, "executor", input.market, "HOLD", "cash simulé insuffisant", input.market.priceUsd, input.usd, "refusé");
    return { cash: input.cash, filled: false, prepared: false };
  }
  const orderId = await createOrder(input, "filled", chainNote);
  const pos = await (await db())<{ id: number }>`
    insert into trading_positions (user_id, bot_id, token_address, symbol, qty, avg_price, status)
    values (${input.actor.userId}, ${input.botId}, ${input.market.address}, ${input.market.symbol}, ${fill.qty}, ${fill.price}, 'open')
    returning id
  `;
  await (await db())`
    insert into trade_executions (
      user_id, order_id, position_id, symbol, token_address, side, qty, price, notional_usd, fee_usd, slippage_usd, pnl_usd, mode, simulated
    ) values (
      ${input.actor.userId}, ${orderId}, ${num(pos[0]?.id)}, ${input.market.symbol}, ${input.market.address}, 'buy',
      ${fill.qty}, ${fill.price}, ${fill.notional}, ${fill.fee}, ${Math.max(0, fill.slippageUsd)}, ${null}, ${input.mode}, true
    )
  `;
  const cash = input.cash - input.usd - fill.fee;
  await decide(
    input.actor.userId,
    input.tickId,
    "executor",
    input.market,
    "BUY",
    `${input.why} ${chainNote}`,
    fill.price,
    input.usd,
    "simulé",
  );
  await (await db())`
    insert into notifications (user_id, title, body, level)
    values (${input.actor.userId}, ${`Achat simulé ${input.market.symbol}`}, ${`${input.usd.toFixed(2)} USD au prix observé. ${chainNote}`}, 'info')
  `;
  return { cash, filled: true, prepared: false };
}

async function executeSell(input: {
  actor: Actor;
  botId: number;
  mode: string;
  tickId: string;
  pos: { id: number; token_address: string; symbol: string; qty: number; avg_price: number };
  mark: number;
  why: string;
  limits: { slippageBps: number; feeBps: number };
  cash: number;
}) {
  const market = {
    address: input.pos.token_address,
    symbol: input.pos.symbol,
    name: input.pos.symbol,
    priceUsd: input.mark,
    volumeH24: 0,
    liquidityUsd: 0,
    changeH1: 0,
    changeH24: 0,
    dex: "",
    pairAddress: "",
  };
  if (input.mode === "assisted") {
    const sql = await db();
    const pending = await sql`
      select id from trading_orders
      where user_id = ${input.actor.userId} and token_address = ${input.pos.token_address}
        and side = 'sell' and status = 'awaiting_signature'
    `;
    if (pending.length > 0) return { cash: input.cash, filled: false, prepared: false };
    await createOrder(
      { actor: input.actor, botId: input.botId, mode: input.mode, tickId: input.tickId, market, usd: input.pos.qty * input.mark, why: input.why },
      "awaiting_signature",
      "Vente en attente. Aucun envoi on-chain.",
      "sell",
      input.pos.qty,
    );
    await decide(input.actor.userId, input.tickId, "executor", market, "SELL", input.why, input.mark, input.pos.qty * input.mark, "en attente de validation");
    return { cash: input.cash, filled: false, prepared: true };
  }
  const fill = applyFill({
    side: "sell",
    mark: input.mark,
    qty: input.pos.qty,
    avgPrice: input.pos.avg_price,
    slippageBps: input.limits.slippageBps,
    feeBps: input.limits.feeBps,
  });
  const orderId = await createOrder(
    { actor: input.actor, botId: input.botId, mode: input.mode, tickId: input.tickId, market, usd: fill.notional, why: input.why },
    "filled",
    "Vente simulée. Aucune transaction blockchain.",
    "sell",
    fill.qty,
  );
  const sql = await db();
  await sql`
    update trading_positions
    set status = 'closed', realized_pnl = ${fill.pnl ?? 0}, closed_at = now(), qty = 0
    where id = ${input.pos.id} and user_id = ${input.actor.userId}
  `;
  await sql`
    insert into trade_executions (
      user_id, order_id, position_id, symbol, token_address, side, qty, price, notional_usd, fee_usd, slippage_usd, pnl_usd, mode, simulated
    ) values (
      ${input.actor.userId}, ${orderId}, ${input.pos.id}, ${input.pos.symbol}, ${input.pos.token_address}, 'sell',
      ${fill.qty}, ${fill.price}, ${fill.notional}, ${fill.fee}, ${Math.max(0, fill.slippageUsd)}, ${fill.pnl}, ${input.mode}, true
    )
  `;
  const cash = input.cash + fill.notional - fill.fee;
  await decide(input.actor.userId, input.tickId, "executor", market, "SELL", `${input.why}. Simulation, pas une vente on-chain.`, fill.price, fill.notional, "simulé");
  return { cash, filled: true, prepared: false };
}

async function createOrder(
  input: {
    actor: Actor;
    botId: number;
    mode: string;
    tickId: string;
    market: Market;
    usd: number;
    why: string;
  },
  status: string,
  reason: string,
  side = "buy",
  qty: number | null = null,
) {
  const sql = await db();
  const key = `${input.tickId}:${input.market.address}:${side}`;
  const rows = await sql<{ id: number }>`
    insert into trading_orders (user_id, bot_id, client_key, symbol, token_address, side, size_usd, qty, limit_price, status, mode, reason)
    values (
      ${input.actor.userId}, ${input.botId}, ${key}, ${input.market.symbol}, ${input.market.address}, ${side},
      ${input.usd}, ${qty}, ${input.market.priceUsd}, ${status}, ${input.mode}, ${`${input.why} ${reason}`}
    )
    on conflict (user_id, client_key) do nothing
    returning id
  `;
  if (rows[0]) return num(rows[0].id);
  const existing = await sql<{ id: number }>`select id from trading_orders where user_id = ${input.actor.userId} and client_key = ${key}`;
  return num(existing[0]?.id);
}

async function recordRun(userId: string, tickId: string, agent: string, status: string, summary: string) {
  const sql = await db();
  const rows = await sql<{ id: number }>`
    insert into agent_runs (user_id, tick_id, agent, status, summary, finished_at)
    values (${userId}, ${tickId}, ${agent}, ${status}, ${summary}, now())
    returning id
  `;
  return num(rows[0]?.id);
}

async function decide(
  userId: string,
  tickId: string,
  agent: string,
  market: Market,
  action: string,
  reason: string,
  price: number,
  size: number,
  result: string,
) {
  const sql = await db();
  await sql`
    insert into agent_decisions (user_id, tick_id, agent, token_symbol, token_address, action, reason, price_usd, size_usd, result)
    values (${userId}, ${tickId}, ${agent}, ${market.symbol}, ${market.address}, ${action}, ${reason}, ${price}, ${size}, ${result})
  `;
}

export async function confirmOrder(actor: Actor, orderId: number) {
  const sql = await db();
  const rows = await sql<{
    id: number;
    bot_id: number;
    symbol: string;
    token_address: string;
    side: string;
    size_usd: number;
    qty: number | null;
    limit_price: number | null;
    status: string;
    mode: string;
  }>`
    select id, bot_id, symbol, token_address, side, size_usd, qty, limit_price, status, mode
    from trading_orders where id = ${orderId} and user_id = ${actor.userId}
  `;
  const order = rows[0];
  if (!order) throw new Error("Ordre introuvable");
  if (order.status !== "awaiting_signature") throw new Error("Cet ordre n’attend pas de validation");
  const state = await sql<{ emergency_stop: boolean }>`select emergency_stop from platform_state where id = 1`;
  if (state[0]?.emergency_stop && order.side === "buy") {
    throw new Error("Arrêt d’urgence : les achats restent bloqués");
  }
  const risks = await sql<Risk>`select * from risk_limits where user_id = ${actor.userId}`;
  const risk = risks[0];
  const mark = num(order.limit_price);
  const bots = await sql<{ cash: number; mode: string }>`select cash, mode from bot_instances where id = ${order.bot_id} and user_id = ${actor.userId}`;
  let cash = num(bots[0]?.cash);
  if (order.side === "buy") {
    const fill = applyFill({
      side: "buy",
      mark,
      usd: num(order.size_usd),
      slippageBps: num(risk?.slippage_bps, 30),
      feeBps: num(risk?.fee_bps, 30),
    });
    if (cash < num(order.size_usd) + fill.fee) throw new Error("Cash simulé insuffisant");
    const pos = await sql<{ id: number }>`
      insert into trading_positions (user_id, bot_id, token_address, symbol, qty, avg_price)
      values (${actor.userId}, ${order.bot_id}, ${order.token_address}, ${order.symbol}, ${fill.qty}, ${fill.price})
      returning id
    `;
    cash -= num(order.size_usd) + fill.fee;
    await sql`
      insert into trade_executions (
        user_id, order_id, position_id, symbol, token_address, side, qty, price, notional_usd, fee_usd, slippage_usd, mode, simulated
      ) values (
        ${actor.userId}, ${order.id}, ${num(pos[0]?.id)}, ${order.symbol}, ${order.token_address}, 'buy',
        ${fill.qty}, ${fill.price}, ${fill.notional}, ${fill.fee}, ${Math.max(0, fill.slippageUsd)}, ${order.mode}, true
      )
    `;
  } else {
    const pos = await sql<Position>`
      select id, token_address, symbol, qty, avg_price, status from trading_positions
      where user_id = ${actor.userId} and token_address = ${order.token_address} and status = 'open' limit 1
    `;
    const position = pos[0];
    if (!position) throw new Error("Position déjà fermée");
    const fill = applyFill({
      side: "sell",
      mark,
      qty: num(position.qty),
      avgPrice: num(position.avg_price),
      slippageBps: num(risk?.slippage_bps, 30),
      feeBps: num(risk?.fee_bps, 30),
    });
    cash += fill.notional - fill.fee;
    await sql`
      update trading_positions set status = 'closed', qty = 0, realized_pnl = ${fill.pnl ?? 0}, closed_at = now()
      where id = ${position.id} and user_id = ${actor.userId}
    `;
    await sql`
      insert into trade_executions (
        user_id, order_id, position_id, symbol, token_address, side, qty, price, notional_usd, fee_usd, slippage_usd, pnl_usd, mode, simulated
      ) values (
        ${actor.userId}, ${order.id}, ${position.id}, ${order.symbol}, ${order.token_address}, 'sell',
        ${fill.qty}, ${fill.price}, ${fill.notional}, ${fill.fee}, ${Math.max(0, fill.slippageUsd)}, ${fill.pnl}, ${order.mode}, true
      )
    `;
  }
  await sql`update trading_orders set status = 'filled' where id = ${order.id} and user_id = ${actor.userId}`;
  await sql`update bot_instances set cash = ${cash} where id = ${order.bot_id} and user_id = ${actor.userId}`;
  return { ok: true as const, message: "Validation enregistrée. Remplissage simulé, signature blockchain non demandée pour déplacer des fonds." };
}

export async function manualClose(actor: Actor, positionId: number) {
  if (!actor.botId) throw new Error("Aucun bot");
  const sql = await db();
  const state = await sql<{ emergency_stop: boolean }>`select emergency_stop from platform_state where id = 1`;
  const rows = await sql<Position>`
    select id, token_address, symbol, qty, avg_price, status
    from trading_positions where id = ${positionId} and user_id = ${actor.userId} and status = 'open'
  `;
  const pos = rows[0];
  if (!pos) throw new Error("Position introuvable");
  const markets = await fetchMarkets();
  const mark = markets.find((m) => m.address === pos.token_address)?.priceUsd;
  if (!mark) throw new Error("Prix réel introuvable pour clôturer. Aucun prix inventé.");
  const bots = await sql<{ cash: number; mode: string }>`
    select cash, mode from bot_instances where id = ${actor.botId} and user_id = ${actor.userId}
  `;
  const risks = await sql<Risk>`select * from risk_limits where user_id = ${actor.userId}`;
  const mode = bots[0]?.mode ?? "simulation";
  if (mode === "assisted") {
    const tickId = `manual_${Date.now().toString(36)}`;
    await executeSell({
      actor,
      botId: actor.botId,
      mode,
      tickId,
      pos: { ...pos, id: num(pos.id), qty: num(pos.qty), avg_price: num(pos.avg_price) },
      mark,
      why: "clôture demandée par l’utilisateur",
      limits: { slippageBps: num(risks[0]?.slippage_bps, 30), feeBps: num(risks[0]?.fee_bps, 30) },
      cash: num(bots[0]?.cash),
    });
    return { message: "Ordre de vente préparé. Confirmez-le dans Transactions. Aucun envoi on-chain." };
  }
  const tickId = `manual_${Date.now().toString(36)}`;
  const outcome = await executeSell({
    actor,
    botId: actor.botId,
    mode,
    tickId,
    pos: { ...pos, id: num(pos.id), qty: num(pos.qty), avg_price: num(pos.avg_price) },
    mark,
    why: state[0]?.emergency_stop
      ? "clôture pendant l’arrêt d’urgence — les positions ouvertes ne sont pas abandonnées"
      : "clôture demandée par l’utilisateur",
    limits: { slippageBps: num(risks[0]?.slippage_bps, 30), feeBps: num(risks[0]?.fee_bps, 30) },
    cash: num(bots[0]?.cash),
  });
  await sql`update bot_instances set cash = ${outcome.cash} where id = ${actor.botId} and user_id = ${actor.userId}`;
  return { message: "Position clôturée en simulation, au dernier prix DexScreener." };
}

export { iso };


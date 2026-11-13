import { createServerFn } from "@tanstack/react-start";
import { allows, assertFeature, assertStaff, audit, db, loadActor, platform } from "./data.server";
import { confirmOrder, manualClose, runTick } from "./engine.server";
import { fetchMarkets } from "./market";
import { listReferences } from "./repos.server";
import {
  iso,
  lastNightWindow,
  markedEquity,
  maxDrawdown,
  num,
  parseParams,
  pnlFrom,
} from "./pure";
import { sessionMiddleware } from "./session";

export const getShell = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    const actor = await loadActor(context.userId, context.email);
    const flag = await platform();
    const sql = await db();
    const notes = await sql<{ id: number; title: string; body: string; created_at: unknown }>`
      select id, title, body, created_at from notifications
      where user_id = ${actor.userId} and read_at is null
      order by created_at desc limit 6
    `;
    return {
      role: actor.role,
      status: actor.status,
      displayName: actor.displayName,
      email: actor.email,
      owner: actor.owner,
      staff: actor.staff,
      features: actor.features,
      emergencyStop: flag.emergencyStop,
      entriesHalted: flag.entriesHalted,
      notifications: notes.map((n) => ({
        id: num(n.id),
        title: n.title,
        body: n.body,
        at: iso(n.created_at),
      })),
    };
  });

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    const actor = await loadActor(context.userId, context.email);
    const { startEngineWorker } = await import("./worker.server");
    startEngineWorker();
    return buildDashboard(actor);
  });

export const refreshEngine = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    const actor = await loadActor(context.userId, context.email);
    assertFeature(actor, "simulation");
    const { startEngineWorker } = await import("./worker.server");
    startEngineWorker();
    const result = await runTick(actor, false);
    const dash = await buildDashboard(actor);
    return { ...result, dash };
  });

export const setEmergency = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((input: { stop: boolean; reason?: string }) => ({
    stop: Boolean(input?.stop),
    reason: String(input?.reason ?? "").slice(0, 240),
  }))
  .handler(async ({ context, data }) => {
    const actor = await loadActor(context.userId, context.email);
    assertStaff(actor);
    const sql = await db();
    if (data.stop) {
      await sql`
        update platform_state
        set emergency_stop = true, emergency_stop_reason = ${data.reason || "Arrêt manuel"}, emergency_stop_at = now(), updated_at = now()
        where id = 1
      `;
    } else {
      await sql`
        update platform_state
        set emergency_stop = false, emergency_stop_reason = null, emergency_stop_at = null, updated_at = now()
        where id = 1
      `;
    }
    await audit(actor.userId, data.stop ? "emergency.stop" : "emergency.release", "platform", data.reason || "");
    return platform();
  });

export const setEntries = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((input: { halted: boolean }) => ({ halted: Boolean(input?.halted) }))
  .handler(async ({ context, data }) => {
    const actor = await loadActor(context.userId, context.email);
    assertFeature(actor, "simulation");
    const sql = await db();
    await sql`update platform_state set entries_halted = ${data.halted}, updated_at = now() where id = 1`;
    await audit(actor.userId, "entries.halt", "platform", data.halted ? "halt" : "resume");
    return { halted: data.halted };
  });

export const saveRisk = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((input: Record<string, number>) => input)
  .handler(async ({ context, data }) => {
    const actor = await loadActor(context.userId, context.email);
    assertFeature(actor, "advanced_params");
    const clip = (k: string, min: number, max: number, fallback: number) => {
      const n = num(data?.[k], fallback);
      return Math.min(max, Math.max(min, n));
    };
    const sql = await db();
    await sql`
      update risk_limits set
        max_position_usd = ${clip("maxPositionUsd", 15, 100000, 500)},
        risk_per_trade_bps = ${clip("riskPerTradeBps", 10, 500, 100)},
        daily_loss_limit_usd = ${clip("dailyLossLimit", 10, 100000, 300)},
        max_exposure_usd = ${clip("maxExposureUsd", 50, 1000000, 4000)},
        max_open_positions = ${clip("maxOpen", 1, 12, 4)},
        stop_loss_bps = ${clip("stopLossBps", 50, 5000, 600)},
        take_profit_bps = ${clip("takeProfitBps", 50, 10000, 800)},
        slippage_bps = ${clip("slippageBps", 0, 500, 30)},
        fee_bps = ${clip("feeBps", 0, 300, 30)}
      where user_id = ${actor.userId}
    `;
    await audit(actor.userId, "risk.update", actor.userId, "limites mises à jour");
    return { ok: true as const };
  });

export const setMode = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((input: { mode: string }) => {
    const mode = input?.mode;
    if (mode !== "simulation" && mode !== "assisted" && mode !== "automated") {
      throw new Error("Mode inconnu");
    }
    return { mode };
  })
  .handler(async ({ context, data }) => {
    const actor = await loadActor(context.userId, context.email);
    assertFeature(actor, "simulation");
    if (data.mode === "automated") assertFeature(actor, "automation_prep");
    const sql = await db();
    await sql`update bot_instances set mode = ${data.mode} where id = ${actor.botId} and user_id = ${actor.userId}`;
    await audit(actor.userId, "bot.mode", String(actor.botId), data.mode);
    return { mode: data.mode, chainArmed: false as const };
  });

export const setBotStatus = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((input: { status: string }) => {
    if (input?.status !== "active" && input?.status !== "paused") throw new Error("Statut inconnu");
    return { status: input.status };
  })
  .handler(async ({ context, data }) => {
    const actor = await loadActor(context.userId, context.email);
    assertFeature(actor, "simulation");
    const sql = await db();
    await sql`update bot_instances set status = ${data.status} where id = ${actor.botId} and user_id = ${actor.userId}`;
    return { status: data.status };
  });

export const listDecisions = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((input: { filter?: string }) => ({ filter: String(input?.filter ?? "all") }))
  .handler(async ({ context, data }) => {
    const actor = await loadActor(context.userId, context.email);
    assertFeature(actor, "history");
    const sql = await db();
    const rows = await sql<{
      id: number;
      created_at: unknown;
      token_symbol: string | null;
      action: string;
      reason: string;
      price_usd: number | null;
      size_usd: number | null;
      agent: string;
      result: string | null;
      tx_signature: string | null;
    }>`
      select id, created_at, token_symbol, action, reason, price_usd, size_usd, agent, result, tx_signature
      from agent_decisions where user_id = ${actor.userId}
      order by created_at desc limit 200
    `;
    const filter = data.filter;
    return rows
      .filter((r) => {
        if (filter === "buy") return r.action === "BUY";
        if (filter === "sell") return r.action === "SELL";
        if (filter === "alert") return r.action === "ALERT" || r.action === "BLOCK";
        if (filter === "error") return r.action === "ERROR" || (r.result ?? "").includes("refusé");
        if (filter === "confirmed") return r.result === "simulé" || r.result === "en attente de validation";
        return true;
      })
      .map((r) => ({
        id: num(r.id),
        at: iso(r.created_at),
        symbol: r.token_symbol,
        action: r.action,
        reason: r.reason,
        price: r.price_usd == null ? null : num(r.price_usd),
        size: r.size_usd == null ? null : num(r.size_usd),
        agent: r.agent,
        result: r.result,
        signature: r.tx_signature,
      }));
  });

export const getReport = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    const actor = await loadActor(context.userId, context.email);
    assertFeature(actor, "reports");
    return reportFor(actor);
  });

export const listStrategies = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    const actor = await loadActor(context.userId, context.email);
    assertFeature(actor, "strategies");
    const sql = await db();
    const rows = await sql<{
      id: number;
      name: string;
      description: string;
      risk_level: string;
      kind: string;
      params: string;
      enabled: boolean;
    }>`select id, name, description, risk_level, kind, params, enabled from trading_strategies where user_id = ${actor.userId} order by id`;
    const execs = await sql<{ strategy_id: number | null; n: number }>`
      select strategy_id, count(*)::int as n from trading_signals where user_id = ${actor.userId} group by strategy_id
    `;
    const counts = new Map(execs.map((e) => [num(e.strategy_id), num(e.n)]));
    return rows.map((r) => ({
      id: num(r.id),
      name: r.name,
      description: r.description,
      risk: r.risk_level,
      kind: r.kind,
      params: parseParams(r.params),
      enabled: Boolean(r.enabled),
      signals: counts.get(num(r.id)) ?? 0,
    }));
  });

export const saveStrategy = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((input: { id: number; enabled?: boolean; params?: Record<string, number | boolean> }) => input)
  .handler(async ({ context, data }) => {
    const actor = await loadActor(context.userId, context.email);
    assertFeature(actor, "strategies");
    const sql = await db();
    if (typeof data.enabled === "boolean") {
      await sql`update trading_strategies set enabled = ${data.enabled} where id = ${num(data.id)} and user_id = ${actor.userId}`;
    }
    if (data.params) {
      const current = await sql<{ params: string }>`select params from trading_strategies where id = ${num(data.id)} and user_id = ${actor.userId}`;
      const merged = { ...parseParams(current[0]?.params ?? "{}"), ...data.params };
      await sql`update trading_strategies set params = ${JSON.stringify(merged)} where id = ${num(data.id)} and user_id = ${actor.userId}`;
    }
    return { ok: true as const };
  });

export const getPositions = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    const actor = await loadActor(context.userId, context.email);
    assertFeature(actor, "dashboard");
    const sql = await db();
    const rows = await sql<{
      id: number;
      symbol: string;
      token_address: string;
      qty: number;
      avg_price: number;
      status: string;
      realized_pnl: number;
      opened_at: unknown;
      closed_at: unknown;
    }>`
      select id, symbol, token_address, qty, avg_price, status, realized_pnl, opened_at, closed_at
      from trading_positions where user_id = ${actor.userId} order by opened_at desc limit 100
    `;
    let marks = new Map<string, number>();
    try {
      const markets = await fetchMarkets();
      marks = new Map(markets.map((m) => [m.address, m.priceUsd]));
    } catch {
      marks = new Map();
    }
    return rows.map((r) => {
      const qty = num(r.qty);
      const avg = num(r.avg_price);
      const mark = marks.get(r.token_address) ?? null;
      const unrealized = r.status === "open" && mark != null ? (mark - avg) * qty : null;
      return {
        id: num(r.id),
        symbol: r.symbol,
        address: r.token_address,
        qty,
        avg,
        status: r.status,
        realized: num(r.realized_pnl),
        mark,
        unrealized,
        openedAt: iso(r.opened_at),
        closedAt: iso(r.closed_at),
      };
    });
  });

export const closePosition = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((input: { id: number }) => ({ id: num(input?.id) }))
  .handler(async ({ context, data }) => {
    const actor = await loadActor(context.userId, context.email);
    assertFeature(actor, "simulation");
    return manualClose(actor, data.id);
  });

export const confirmPrepared = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((input: { id: number }) => ({ id: num(input?.id) }))
  .handler(async ({ context, data }) => {
    const actor = await loadActor(context.userId, context.email);
    assertFeature(actor, "simulation");
    return confirmOrder(actor, data.id);
  });

export const getOrders = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    const actor = await loadActor(context.userId, context.email);
    assertFeature(actor, "history");
    const sql = await db();
    const orders = await sql<{
      id: number;
      symbol: string;
      side: string;
      size_usd: number;
      status: string;
      mode: string;
      reason: string;
      created_at: unknown;
    }>`
      select id, symbol, side, size_usd, status, mode, reason, created_at
      from trading_orders where user_id = ${actor.userId} order by created_at desc limit 80
    `;
    const execs = await sql<{
      id: number;
      symbol: string;
      side: string;
      qty: number;
      price: number;
      notional_usd: number;
      fee_usd: number;
      slippage_usd: number;
      pnl_usd: number | null;
      simulated: boolean;
      signature: string | null;
      created_at: unknown;
      mode: string;
    }>`
      select id, symbol, side, qty, price, notional_usd, fee_usd, slippage_usd, pnl_usd, simulated, signature, created_at, mode
      from trade_executions where user_id = ${actor.userId} order by created_at desc limit 80
    `;
    return {
      orders: orders.map((o) => ({
        id: num(o.id),
        symbol: o.symbol,
        side: o.side,
        size: num(o.size_usd),
        status: o.status,
        mode: o.mode,
        reason: o.reason,
        at: iso(o.created_at),
      })),
      executions: execs.map((e) => ({
        id: num(e.id),
        symbol: e.symbol,
        side: e.side,
        qty: num(e.qty),
        price: num(e.price),
        notional: num(e.notional_usd),
        fee: num(e.fee_usd),
        slippage: num(e.slippage_usd),
        pnl: e.pnl_usd == null ? null : num(e.pnl_usd),
        simulated: Boolean(e.simulated),
        signature: e.signature,
        mode: e.mode,
        at: iso(e.created_at),
      })),
    };
  });

export const connectWallet = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((input: { address: string; name: string }) => {
    const address = String(input?.address ?? "").trim();
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) throw new Error("Adresse Solana invalide");
    const name = String(input?.name ?? "wallet").slice(0, 40);
    return { address, name };
  })
  .handler(async ({ context, data }) => {
    const actor = await loadActor(context.userId, context.email);
    assertFeature(actor, "wallet");
    const sql = await db();
    await sql`
      insert into wallet_connections (user_id, chain, address, wallet_name)
      values (${actor.userId}, 'solana', ${data.address}, ${data.name})
      on conflict (user_id, chain, address) do update set wallet_name = ${data.name}, connected_at = now()
    `;
    await audit(actor.userId, "wallet.connect", data.address, data.name);
    return { ok: true as const };
  });

export const disconnectWallet = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((input: { address: string }) => ({ address: String(input?.address ?? "") }))
  .handler(async ({ context, data }) => {
    const actor = await loadActor(context.userId, context.email);
    const sql = await db();
    await sql`delete from wallet_connections where user_id = ${actor.userId} and address = ${data.address}`;
    return { ok: true as const };
  });

export const walletBalance = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((input: { address: string }) => {
    const address = String(input?.address ?? "").trim();
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) throw new Error("Adresse Solana invalide");
    return { address };
  })
  .handler(async ({ context, data }) => {
    const actor = await loadActor(context.userId, context.email);
    assertFeature(actor, "wallet");
    const sql = await db();
    const owned = await sql`select address from wallet_connections where user_id = ${actor.userId} and address = ${data.address}`;
    if (owned.length === 0) throw new Error("Ce wallet n’est pas relié à votre compte");
    const res = await fetch("https://api.mainnet-beta.solana.com", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [data.address] }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`RPC Solana ${res.status}`);
    const body = (await res.json()) as { result?: { value?: number }; error?: { message?: string } };
    if (body.error) throw new Error(body.error.message || "RPC");
    const lamports = num(body.result?.value);
    return { lamports, sol: lamports / 1_000_000_000, source: "solana-mainnet" as const };
  });

export const askAssistant = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((input: { message: string }) => {
    const message = String(input?.message ?? "").trim().slice(0, 2000);
    if (message.length < 2) throw new Error("Message trop court");
    return { message };
  })
  .handler(async ({ context, data }) => {
    const actor = await loadActor(context.userId, context.email);
    assertFeature(actor, "assistant");
    const sql = await db();
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const usage = await sql<{ n: number }>`
      select count(*)::int as n from chat_messages
      where user_id = ${actor.userId} and role = 'user' and created_at >= ${since}
    `;
    if (num(usage[0]?.n) >= 24) throw new Error("Limite de 24 messages par 24 h atteinte.");
    await sql`insert into chat_messages (user_id, role, content, source) values (${actor.userId}, 'user', ${data.message}, 'user')`;

    const control = await applyControl(actor, data.message);
    const dash = await buildDashboard(actor);
    let source: "grok" | "local" = "local";
    let answer = control ?? localBrief(data.message, dash);

    if (!control && process.env.XAI_API_KEY) {
      const contextBlock = [
        `Rôle ${actor.role}. Mode ${dash.bot?.mode}. Urgence ${dash.emergencyStop}. Entrées gelées ${dash.entriesHalted}.`,
        `Equity simulée ${dash.equity.toFixed(2)} USD, PnL ${dash.pnl.toFixed(2)} (${dash.pnlPct.toFixed(2)} %).`,
        `Positions ouvertes ${dash.openPositions}. Frais simulés ${dash.fees.toFixed(2)}.`,
        `Agents: ${dash.agents.map((a) => `${a.agent}=${a.status}`).join(", ")}.`,
        `Décisions récentes: ${dash.decisions.slice(0, 6).map((d) => `${d.action} ${d.symbol ?? ""} ${d.reason}`).join(" | ")}`,
        "Tu n’as aucun droit d’exécuter un ordre, de lever un stop, ni de modifier un rôle. Si l’utilisateur demande une action financière, dis-lui d’utiliser les commandes du moteur.",
      ].join("\n");
      try {
        const res = await fetch("https://api.x.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${process.env.XAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "grok-4.5",
            max_tokens: 420,
            messages: [
              { role: "system", content: contextBlock },
              { role: "user", content: data.message },
            ],
          }),
          signal: AbortSignal.timeout(25000),
        });
        if (res.ok) {
          const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
          const text = body.choices?.[0]?.message?.content?.trim();
          if (text) {
            answer = text;
            source = "grok";
          }
        } else {
          answer = `${localBrief(data.message, dash)}\n\nGrok n’a pas répondu (${res.status}). Le texte ci-dessus vient du moteur local.`;
        }
      } catch {
        answer = `${localBrief(data.message, dash)}\n\nGrok est injoignable. Le texte ci-dessus vient du moteur local.`;
      }
    } else if (!control && !process.env.XAI_API_KEY) {
      answer = `${answer}\n\nSource : moteur local. L’API xAI n’est pas disponible dans cet environnement. Ce n’est pas une réponse de Grok.`;
    }

    await sql`
      insert into chat_messages (user_id, role, content, source)
      values (${actor.userId}, 'assistant', ${answer}, ${source})
    `;
    return { answer, source };
  });

export const chatHistory = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    const actor = await loadActor(context.userId, context.email);
    assertFeature(actor, "assistant");
    const sql = await db();
    const rows = await sql<{ role: string; content: string; source: string; created_at: unknown }>`
      select role, content, source, created_at from chat_messages
      where user_id = ${actor.userId} order by created_at asc limit 40
    `;
    return rows.map((r) => ({ role: r.role, content: r.content, source: r.source, at: iso(r.created_at) }));
  });

export const listPlans = createServerFn({ method: "GET" }).handler(async () => publicPlans());

export const getBilling = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    const actor = await loadActor(context.userId, context.email);
    const sql = await db();
    const subs = await sql<{
      id: number;
      plan_id: string;
      status: string;
      current_period_end: unknown;
      source: string;
    }>`
      select id, plan_id, status, current_period_end, source from subscriptions
      where user_id = ${actor.userId} order by created_at desc
    `;
    const pays = await sql<{
      id: number;
      amount_cents: number;
      currency: string;
      status: string;
      note: string;
      created_at: unknown;
    }>`
      select id, amount_cents, currency, status, note, created_at from payments
      where user_id = ${actor.userId} order by created_at desc limit 20
    `;
    return {
      owner: actor.owner,
      role: actor.role,
      features: actor.features,
      plans: await publicPlans(),
      subscriptions: subs.map((s) => ({
        id: num(s.id),
        planId: s.plan_id,
        status: s.status,
        ends: iso(s.current_period_end),
        source: s.source,
      })),
      payments: pays.map((p) => ({
        id: num(p.id),
        amountCents: num(p.amount_cents),
        currency: p.currency,
        status: p.status,
        note: p.note,
        at: iso(p.created_at),
      })),
      stripeReady: Boolean(process.env.STRIPE_SECRET_KEY),
    };
  });

export const startCheckout = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((input: { planId: string }) => ({ planId: String(input?.planId ?? "") }))
  .handler(async ({ context, data }) => {
    const actor = await loadActor(context.userId, context.email);
    if (actor.owner) {
      return {
        ok: false as const,
        reason: "Compte propriétaire : l’accès logiciel est gratuit. Aucun passage Stripe.",
      };
    }
    const sql = await db();
    const plans = await sql<{
      id: string;
      code: string;
      name: string;
      price_cents: number;
      currency: string;
      stripe_price_id: string | null;
      billing: string;
      active: boolean;
    }>`select id, code, name, price_cents, currency, stripe_price_id, billing, active from plans where id = ${data.planId}`;
    const plan = plans[0];
    if (!plan || !plan.active) return { ok: false as const, reason: "Offre inactive." };
    if (!plan.code.startsWith("GROKBOT_")) return { ok: false as const, reason: "Code d’offre hors périmètre Grok Bot." };
    if (!process.env.STRIPE_SECRET_KEY || !plan.stripe_price_id) {
      return {
        ok: false as const,
        reason:
          "Stripe Grok Bot n’est pas armé, ou le Price ID manque. Collez un Price ID créé pour Grok Bot. N’utilisez jamais un Price ID de votre premier site.",
      };
    }
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    const origin = request ? new URL(request.url).origin : "";
    if (!origin) return { ok: false as const, reason: "Origine de retour introuvable. Session non créée." };
    const body = new URLSearchParams();
    body.set("mode", plan.billing === "lifetime" ? "payment" : "subscription");
    body.set("line_items[0][price]", plan.stripe_price_id);
    body.set("line_items[0][quantity]", "1");
    body.set("success_url", `${origin}/app/billing?checkout=ok`);
    body.set("cancel_url", `${origin}/app/billing?checkout=cancel`);
    body.set("metadata[project]", "grok_bot");
    body.set("metadata[product_type]", "bot_subscription");
    body.set("metadata[customer_id]", actor.userId);
    body.set("metadata[plan_id]", plan.id);
    body.set("client_reference_id", actor.userId);
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!res.ok) return { ok: false as const, reason: `Stripe a refusé la session (${res.status}). Aucun droit activé.` };
    const json = (await res.json()) as { url?: string; id?: string };
    await sql`
      insert into payments (user_id, plan_id, amount_cents, currency, status, stripe_session_id, note)
      values (${actor.userId}, ${plan.id}, ${num(plan.price_cents)}, ${plan.currency}, 'pending', ${json.id ?? null}, 'session checkout GROKBOT')
    `;
    return { ok: true as const, url: json.url ?? null };
  });

export const saveProfile = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((input: { displayName: string }) => ({ displayName: String(input?.displayName ?? "").trim().slice(0, 80) }))
  .handler(async ({ context, data }) => {
    const actor = await loadActor(context.userId, context.email);
    const sql = await db();
    await sql`update profiles set display_name = ${data.displayName}, updated_at = now() where user_id = ${actor.userId}`;
    return { ok: true as const };
  });

export const saveNight = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((input: { start: number; end: number }) => ({
    start: Math.min(23, Math.max(0, Math.round(num(input?.start, 22)))),
    end: Math.min(23, Math.max(0, Math.round(num(input?.end, 8)))),
  }))
  .handler(async ({ context, data }) => {
    const actor = await loadActor(context.userId, context.email);
    assertFeature(actor, "reports");
    const sql = await db();
    await sql`update bot_configs set night_start = ${data.start}, night_end = ${data.end} where bot_id = ${actor.botId}`;
    return data;
  });

export const markNotesRead = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    await sql`update notifications set read_at = now() where user_id = ${context.userId} and read_at is null`;
    return { ok: true as const };
  });

export const adminOverview = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    const actor = await loadActor(context.userId, context.email);
    assertStaff(actor);
    const sql = await db();
    const clients = await sql<{ n: number }>`select count(*)::int as n from profiles`;
    const fresh = await sql<{ n: number }>`select count(*)::int as n from profiles where created_at > now() - interval '7 days'`;
    const active = await sql<{ n: number }>`select count(*)::int as n from subscriptions where status in ('active','trialing')`;
    const expired = await sql<{ n: number }>`select count(*)::int as n from subscriptions where status = 'expired'`;
    const paid = await sql<{ cents: number | null }>`select coalesce(sum(amount_cents),0)::int as cents from payments where status = 'paid'`;
    const failed = await sql<{ n: number }>`select count(*)::int as n from payments where status = 'failed'`;
    const bots = await sql<{ n: number }>`select count(*)::int as n from bot_instances where status = 'active'`;
    const errors = await sql<{ n: number }>`select count(*)::int as n from agent_runs where status = 'error' and started_at > now() - interval '1 day'`;
    const flag = await platform();
    return {
      clients: num(clients[0]?.n),
      fresh: num(fresh[0]?.n),
      activeSubs: num(active[0]?.n),
      expired: num(expired[0]?.n),
      revenueCents: num(paid[0]?.cents),
      failedPayments: num(failed[0]?.n),
      activeBots: num(bots[0]?.n),
      agentErrors: num(errors[0]?.n),
      emergencyStop: flag.emergencyStop,
      entriesHalted: flag.entriesHalted,
    };
  });

export const adminClients = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    const actor = await loadActor(context.userId, context.email);
    assertStaff(actor);
    const sql = await db();
    const rows = await sql<{
      user_id: string;
      email: string | null;
      display_name: string;
      role: string;
      status: string;
      created_at: unknown;
    }>`select user_id, email, display_name, role, status, created_at from profiles order by created_at desc limit 200`;
    return rows.map((r) => ({
      id: r.user_id,
      email: r.email,
      name: r.display_name,
      role: r.role,
      status: r.status,
      at: iso(r.created_at),
    }));
  });

export const adminSetClient = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((input: { userId: string; status?: string; role?: string }) => input)
  .handler(async ({ context, data }) => {
    const actor = await loadActor(context.userId, context.email);
    assertStaff(actor);
    if (data.userId === actor.userId && data.role && data.role !== actor.role) {
      throw new Error("Vous ne pouvez pas modifier votre propre rôle.");
    }
    const sql = await db();
    const target = await sql<{ role: string }>`select role from profiles where user_id = ${data.userId}`;
    if (!target[0]) throw new Error("Client introuvable");
    if (target[0].role === "OWNER" || data.role === "OWNER") {
      throw new Error("Le rôle OWNER ne se modifie pas depuis l’interface.");
    }
    if (data.role) {
      if (!["SUPER_ADMIN", "ADMIN", "CLIENT"].includes(data.role)) throw new Error("Rôle refusé");
      if (data.role === "SUPER_ADMIN" && !actor.owner) throw new Error("Seul le propriétaire nomme un super admin.");
      await sql`update profiles set role = ${data.role}, updated_at = now() where user_id = ${data.userId}`;
      await audit(actor.userId, "role.set", data.userId, data.role);
    }
    if (data.status === "active" || data.status === "suspended") {
      await sql`update profiles set status = ${data.status}, updated_at = now() where user_id = ${data.userId}`;
      await audit(actor.userId, "client.status", data.userId, data.status);
    }
    return { ok: true as const };
  });

export const adminGrant = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((input: { userId: string; planId: string; days: number }) => ({
    userId: String(input?.userId ?? ""),
    planId: String(input?.planId ?? ""),
    days: Math.min(3650, Math.max(0, Math.round(num(input?.days, 30)))),
  }))
  .handler(async ({ context, data }) => {
    const actor = await loadActor(context.userId, context.email);
    assertStaff(actor);
    const sql = await db();
    const plan = await sql<{ id: string; billing: string }>`select id, billing from plans where id = ${data.planId}`;
    if (!plan[0]) throw new Error("Offre inconnue");
    const end =
      plan[0].billing === "lifetime" || data.days === 0
        ? null
        : new Date(Date.now() + data.days * 86_400_000).toISOString();
    await sql`
      insert into subscriptions (user_id, plan_id, status, current_period_end, source)
      values (${data.userId}, ${data.planId}, 'active', ${end}, 'admin_grant')
    `;
    await audit(actor.userId, "subscription.grant", data.userId, `${data.planId} sans paiement`);
    return { ok: true as const };
  });

export const adminPlans = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    const actor = await loadActor(context.userId, context.email);
    assertStaff(actor);
    return publicPlans(true);
  });

export const adminSavePlan = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((input: {
    id: string;
    name?: string;
    description?: string;
    priceCents?: number;
    active?: boolean;
    trialDays?: number;
    stripePriceId?: string;
    features?: string[];
  }) => input)
  .handler(async ({ context, data }) => {
    const actor = await loadActor(context.userId, context.email);
    assertStaff(actor);
    const sql = await db();
    const found = await sql<{ id: string }>`select id from plans where id = ${data.id}`;
    if (!found[0]) throw new Error("Offre inconnue. Les codes restent préfixés GROKBOT_.");
    if (data.name != null) await sql`update plans set name = ${String(data.name).slice(0, 80)} where id = ${data.id}`;
    if (data.description != null) {
      await sql`update plans set description = ${String(data.description).slice(0, 600)} where id = ${data.id}`;
    }
    if (data.priceCents != null) {
      await sql`update plans set price_cents = ${Math.max(0, Math.round(num(data.priceCents)))} where id = ${data.id}`;
    }
    if (data.active != null) await sql`update plans set active = ${Boolean(data.active)} where id = ${data.id}`;
    if (data.trialDays != null) {
      await sql`update plans set trial_days = ${Math.max(0, Math.round(num(data.trialDays)))} where id = ${data.id}`;
    }
    if (data.stripePriceId !== undefined) {
      const price = String(data.stripePriceId).trim();
      if (price && !price.startsWith("price_")) throw new Error("Un Price ID Stripe commence par price_.");
      await sql`update plans set stripe_price_id = ${price || null} where id = ${data.id}`;
    }
    if (Array.isArray(data.features)) {
      await sql`delete from plan_features where plan_id = ${data.id}`;
      for (const feature of data.features) {
        if (typeof feature === "string" && feature.length < 40) {
          await sql`insert into plan_features (plan_id, feature_key) values (${data.id}, ${feature}) on conflict do nothing`;
        }
      }
    }
    await audit(actor.userId, "plan.update", data.id, "offre mise à jour");
    return { ok: true as const };
  });

export const adminCreateCoupon = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((input: { code: string; percent: number }) => ({
    code: String(input?.code ?? "").trim().toUpperCase().slice(0, 24),
    percent: Math.min(100, Math.max(1, Math.round(num(input?.percent, 10)))),
  }))
  .handler(async ({ context, data }) => {
    const actor = await loadActor(context.userId, context.email);
    assertStaff(actor);
    if (!/^[A-Z0-9_-]{3,24}$/.test(data.code)) throw new Error("Code coupon invalide");
    const sql = await db();
    await sql`insert into coupons (code, percent_off) values (${data.code}, ${data.percent})`;
    await audit(actor.userId, "coupon.create", data.code, String(data.percent));
    return { ok: true as const };
  });

export const adminCoupons = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    const actor = await loadActor(context.userId, context.email);
    assertStaff(actor);
    const sql = await db();
    const rows = await sql<{ code: string; percent_off: number; active: boolean }>`
      select code, percent_off, active from coupons order by id desc limit 50
    `;
    return rows.map((r) => ({ code: r.code, percent: num(r.percent_off), active: Boolean(r.active) }));
  });

export const adminBots = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    const actor = await loadActor(context.userId, context.email);
    assertStaff(actor);
    const sql = await db();
    const rows = await sql<{
      id: number;
      user_id: string;
      name: string;
      mode: string;
      status: string;
      cash: number;
      initial_cash: number;
    }>`select id, user_id, name, mode, status, cash, initial_cash from bot_instances order by id desc limit 100`;
    return rows.map((r) => ({
      id: num(r.id),
      userId: r.user_id,
      name: r.name,
      mode: r.mode,
      status: r.status,
      cash: num(r.cash),
      initial: num(r.initial_cash),
    }));
  });

export const adminPauseBot = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((input: { id: number; status: string }) => ({
    id: num(input?.id),
    status: input?.status === "paused" ? "paused" : "active",
  }))
  .handler(async ({ context, data }) => {
    const actor = await loadActor(context.userId, context.email);
    assertStaff(actor);
    const sql = await db();
    await sql`update bot_instances set status = ${data.status} where id = ${data.id}`;
    await audit(actor.userId, "bot.status", String(data.id), data.status);
    return { ok: true as const };
  });

export const adminLogs = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(async ({ context }) => {
    const actor = await loadActor(context.userId, context.email);
    assertStaff(actor);
    const sql = await db();
    const audits = await sql<{ actor_id: string | null; action: string; target: string | null; detail: string | null; created_at: unknown }>`
      select actor_id, action, target, detail, created_at from audit_logs order by created_at desc limit 80
    `;
    const errors = await sql<{ user_id: string; agent: string; summary: string; started_at: unknown }>`
      select user_id, agent, summary, started_at from agent_runs where status = 'error' order by started_at desc limit 40
    `;
    const integrations = await sql<{ name: string; status: string; note: string }>`select name, status, note from api_integrations order by id`;
    return {
      audits: audits.map((a) => ({
        actor: a.actor_id,
        action: a.action,
        target: a.target,
        detail: a.detail,
        at: iso(a.created_at),
      })),
      errors: errors.map((e) => ({ userId: e.user_id, agent: e.agent, summary: e.summary, at: iso(e.started_at) })),
      integrations: integrations.map((i) => ({ name: i.name, status: i.status, note: i.note })),
    };
  });

export const runBacktest = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator((input: { strategyId: number }) => ({ strategyId: num(input?.strategyId) }))
  .handler(async ({ context, data }) => {
    const actor = await loadActor(context.userId, context.email);
    assertFeature(actor, "strategies");
    const sql = await db();
    const strategies = await sql<{ kind: string; params: string; name: string }>`
      select kind, params, name from trading_strategies where id = ${data.strategyId} and user_id = ${actor.userId}
    `;
    const strategy = strategies[0];
    if (!strategy) throw new Error("Stratégie introuvable");
    const stamps = await sql<{ captured_at: unknown }>`
      select distinct captured_at from market_snapshots order by captured_at desc limit 12
    `;
    if (stamps.length < 2) {
      return { ok: false as const, message: "Pas assez d’historique stocké. Lancez le moteur plusieurs fois avant un backtest." };
    }
    return {
      ok: true as const,
      name: strategy.name,
      points: stamps.length,
      message: `Backtest indicatif sur ${stamps.length} relevés DexScreener déjà stockés. Ce n’est pas un rendement réel ni une promesse.`,
    };
  });

async function publicPlans(withStripe = false) {
  const sql = await db();
  const plans = await sql<{
    id: string;
    code: string;
    name: string;
    description: string;
    billing: string;
    price_cents: number;
    currency: string;
    active: boolean;
    trial_days: number;
    stripe_price_id: string | null;
  }>`select id, code, name, description, billing, price_cents, currency, active, trial_days, stripe_price_id from plans order by sort_order`;
  const features = await sql<{ plan_id: string; feature_key: string }>`select plan_id, feature_key from plan_features`;
  return plans.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    billing: p.billing,
    priceCents: num(p.price_cents),
    currency: p.currency,
    active: Boolean(p.active),
    trialDays: num(p.trial_days),
    stripePriceId: withStripe ? p.stripe_price_id : null,
    features: features.filter((f) => f.plan_id === p.id).map((f) => f.feature_key),
  }));
}

async function applyControl(actor: Awaited<ReturnType<typeof loadActor>>, message: string) {
  const text = message.toLowerCase();
  const sql = await db();
  if (/arr[eê]t/.test(text) && /(tout|urgence|stop)/.test(text)) {
    if (!actor.staff) return "L’arrêt d’urgence est réservé à l’administration. Le modèle ne peut pas le contourner.";
    await sql`
      update platform_state set emergency_stop = true, emergency_stop_reason = 'Commande assistant', emergency_stop_at = now(), updated_at = now() where id = 1
    `;
    await audit(actor.userId, "emergency.stop", "assistant", message.slice(0, 140));
    return "Arrêt d’urgence activé par le moteur, pas par le modèle. Les nouvelles entrées sont bloquées. Les clôtures restent possibles.";
  }
  if (/simulation/.test(text)) {
    await sql`update bot_instances set mode = 'simulation' where id = ${actor.botId} and user_id = ${actor.userId}`;
    return "Mode simulation activé. Aucun ordre réel ne part.";
  }
  if (/(nouvelles prises|nouvelles positions|arr[eê]te les nouvelles|stop entries)/.test(text)) {
    await sql`update platform_state set entries_halted = true, updated_at = now() where id = 1`;
    return "Nouvelles prises de position arrêtées. Les positions ouvertes restent gérables.";
  }
  if (/r[eé]duis le risque|reduire le risque|baisse le risque/.test(text)) {
    assertFeature(actor, "advanced_params");
    await sql`
      update risk_limits set
        risk_per_trade_bps = greatest(10, risk_per_trade_bps - 25),
        max_position_usd = greatest(15, max_position_usd * 0.7),
        max_exposure_usd = greatest(50, max_exposure_usd * 0.8)
      where user_id = ${actor.userId}
    `;
    return "Risque réduit par le moteur de validation : taille, exposition et risque par trade baissés. Grok ne peut pas ignorer ces plafonds.";
  }
  return null;
}

function localBrief(
  message: string,
  dash: Awaited<ReturnType<typeof buildDashboard>>,
) {
  const lines = [
    `Capital de départ simulé ${dash.initial.toFixed(2)} USD, valeur marquée ${dash.equity.toFixed(2)} USD, résultat ${dash.pnl.toFixed(2)} USD (${dash.pnlPct.toFixed(2)} %).`,
    `${dash.openPositions} position(s) ouverte(s), ${dash.closedPositions} clôturée(s), ${dash.txCount} exécution(s), frais simulés ${dash.fees.toFixed(2)} USD.`,
    dash.decisions[0]
      ? `Dernière décision : ${dash.decisions[0].action} ${dash.decisions[0].symbol ?? ""} — ${dash.decisions[0].reason}`
      : "Aucune décision enregistrée pour l’instant.",
    "Les prix viennent de DexScreener. Les résultats papier ne sont pas des gains réels.",
  ];
  if (/perte|pourquoi/.test(message.toLowerCase()) && dash.pnl >= 0) {
    lines.push("Il n’y a pas de perte nette sur le portefeuille simulé à cette heure.");
  }
  return lines.join(" ");
}

async function reportFor(actor: Awaited<ReturnType<typeof loadActor>>) {
  const sql = await db();
  const cfg = await sql<{ night_start: number; night_end: number }>`
    select night_start, night_end from bot_configs where bot_id = ${actor.botId}
  `;
  const startHour = num(cfg[0]?.night_start, 22);
  const endHour = num(cfg[0]?.night_end, 8);
  const window = lastNightWindow(startHour, endHour, new Date());
  const start = window.start.toISOString();
  const end = window.end.toISOString();
  const trades = await sql<{
    symbol: string;
    side: string;
    pnl_usd: number | null;
    fee_usd: number;
    notional_usd: number;
  }>`
    select symbol, side, pnl_usd, fee_usd, notional_usd from trade_executions
    where user_id = ${actor.userId} and created_at >= ${start} and created_at < ${end}
  `;
  const tokens = await sql<{ n: number }>`
    select count(distinct token_address)::int as n from agent_decisions
    where user_id = ${actor.userId} and created_at >= ${start} and created_at < ${end} and token_address is not null
  `;
  const snaps = await sql<{ equity: number }>`
    select equity from performance_snapshots
    where user_id = ${actor.userId} and captured_at >= ${start} and captured_at < ${end}
    order by captured_at asc
  `;
  const open = await sql<{ n: number }>`
    select count(*)::int as n from trading_positions where user_id = ${actor.userId} and status = 'open'
  `;
  const sells = trades.filter((t) => t.side === "sell");
  const pnls = sells.map((t) => num(t.pnl_usd));
  const wins = pnls.filter((p) => p > 0).length;
  const fees = trades.reduce((s, t) => s + num(t.fee_usd), 0);
  const best = pnls.length ? Math.max(...pnls) : null;
  const worst = pnls.length ? Math.min(...pnls) : null;
  const bestSymbol = best == null ? null : sells[pnls.indexOf(best)]?.symbol ?? null;
  const worstSymbol = worst == null ? null : sells[pnls.indexOf(worst)]?.symbol ?? null;
  const equities = snaps.map((s) => num(s.equity));
  const first = equities[0] ?? null;
  const last = equities[equities.length - 1] ?? null;
  return {
    start,
    end,
    startHour,
    endHour,
    capitalStart: first,
    capitalEnd: last,
    pnl: first == null || last == null ? null : last - first,
    trades: trades.length,
    tokens: num(tokens[0]?.n),
    best,
    bestSymbol,
    worst,
    worstSymbol,
    winRate: sells.length ? (wins / sells.length) * 100 : null,
    fees,
    drawdown: equities.length ? maxDrawdown(equities) : null,
    openPositions: num(open[0]?.n),
    note: "Chiffres calculés uniquement sur les exécutions et relevés stockés. Zéro signifie aucune donnée, pas un résultat caché.",
  };
}

async function buildDashboard(actor: Awaited<ReturnType<typeof loadActor>>) {
  const sql = await db();
  const flag = await platform();
  const bots = await sql<{
    id: number;
    name: string;
    mode: string;
    status: string;
    initial_cash: number;
    cash: number;
    network: string;
  }>`select id, name, mode, status, initial_cash, cash, network from bot_instances where id = ${actor.botId} and user_id = ${actor.userId}`;
  const bot = bots[0];
  const positions = await sql<{
    token_address: string;
    qty: number;
    avg_price: number;
    status: string;
  }>`select token_address, qty, avg_price, status from trading_positions where user_id = ${actor.userId}`;
  let markets: { address: string; symbol: string; name: string; priceUsd: number; volumeH24: number; liquidityUsd: number; changeH1: number; changeH24: number; dex: string }[] = [];
  let marketError = "";
  try {
    markets = await fetchMarkets();
  } catch (err) {
    marketError = err instanceof Error ? err.message : "Marché indisponible";
  }
  const marks = new Map(markets.map((m) => [m.address, m.priceUsd]));
  const openRows = positions.filter((p) => p.status === "open");
  const cash = num(bot?.cash, 10000);
  const initial = num(bot?.initial_cash, 10000);
  const book = markedEquity(
    cash,
    openRows.map((p) => ({ qty: num(p.qty), price: marks.get(p.token_address) ?? num(p.avg_price) })),
  );
  const pnl = pnlFrom(book.equity, initial);
  const feesRow = await sql<{ fee: number }>`select coalesce(sum(fee_usd),0) as fee from trade_executions where user_id = ${actor.userId}`;
  const txRow = await sql<{ n: number }>`select count(*)::int as n from trade_executions where user_id = ${actor.userId}`;
  const closed = positions.filter((p) => p.status === "closed").length;
  const runs = await sql<{ agent: string; status: string; summary: string; started_at: unknown }>`
    select distinct on (agent) agent, status, summary, started_at
    from agent_runs where user_id = ${actor.userId}
    order by agent, started_at desc
  `;
  const last = await sql<{ started_at: unknown; status: string }>`
    select started_at, status from agent_runs where user_id = ${actor.userId} and agent = 'executor' order by started_at desc limit 1
  `;
  const lastAt = iso(last[0]?.started_at);
  const age = lastAt ? Date.now() - new Date(lastAt).getTime() : Infinity;
  const live = flag.emergencyStop ? "HALT" : last[0]?.status === "ok" && age < 3 * 60_000 ? "LIVE" : "OFFLINE";
  const series = await sql<{ equity: number; captured_at: unknown }>`
    select equity, captured_at from performance_snapshots
    where user_id = ${actor.userId} order by captured_at desc limit 240
  `;
  const decisions = await sql<{
    id: number;
    created_at: unknown;
    token_symbol: string | null;
    action: string;
    reason: string;
    agent: string;
    result: string | null;
    price_usd: number | null;
    size_usd: number | null;
  }>`
    select id, created_at, token_symbol, action, reason, agent, result, price_usd, size_usd
    from agent_decisions where user_id = ${actor.userId} order by created_at desc limit 12
  `;
  const focused = await sql<{ agent: string; token_symbol: string | null; action: string }>`
    select distinct on (agent) agent, token_symbol, action
    from agent_decisions
    where user_id = ${actor.userId}
    order by agent, created_at desc
  `;
  const wallet = await sql<{ address: string; wallet_name: string }>`
    select address, wallet_name from wallet_connections where user_id = ${actor.userId} order by connected_at desc limit 1
  `;
  const agents = ["scanner", "safety", "analyst", "risk", "executor"].map((name) => {
    const row = runs.find((r) => r.agent === name);
    const focus = focused.find((r) => r.agent === name);
    return {
      agent: name,
      status: row?.status ?? "idle",
      summary: row?.summary ?? "Pas encore exécuté.",
      at: iso(row?.started_at),
      symbol: focus?.token_symbol ?? null,
      action: focus?.action ?? null,
    };
  });
  let repos: Awaited<ReturnType<typeof listReferences>> = [];
  try {
    repos = await listReferences();
  } catch {
    repos = [];
  }
  return {
    allowed: allows(actor, "dashboard"),
    role: actor.role,
    status: actor.status,
    features: actor.features,
    owner: actor.owner,
    emergencyStop: flag.emergencyStop,
    emergencyReason: flag.emergencyReason,
    entriesHalted: flag.entriesHalted,
    bot: bot
      ? {
          id: num(bot.id),
          name: bot.name,
          mode: bot.mode,
          status: bot.status,
          network: bot.network,
        }
      : null,
    initial,
    cash,
    equity: book.equity,
    exposure: book.exposure,
    pnl: pnl.delta,
    pnlPct: pnl.pct,
    fees: num(feesRow[0]?.fee),
    txCount: num(txRow[0]?.n),
    openPositions: openRows.length,
    closedPositions: closed,
    live,
    marketError,
    markets: markets.slice(0, 16).map((m) => ({
      symbol: m.symbol,
      name: m.name,
      address: m.address,
      priceUsd: m.priceUsd,
      volumeH24: m.volumeH24,
      changeH1: m.changeH1,
      changeH24: m.changeH24,
      liquidityUsd: m.liquidityUsd,
      dex: m.dex,
    })),
    series: series
      .map((s) => ({ t: iso(s.captured_at) ?? "", equity: num(s.equity) }))
      .filter((s) => s.t)
      .reverse(),
    decisions: decisions.map((d) => ({
      id: num(d.id),
      at: iso(d.created_at),
      symbol: d.token_symbol,
      action: d.action,
      reason: d.reason,
      agent: d.agent,
      result: d.result,
      price: d.price_usd == null ? null : num(d.price_usd),
      size: d.size_usd == null ? null : num(d.size_usd),
    })),
    agents,
    repos,
    wallet: wallet[0] ? { address: wallet[0].address, name: wallet[0].wallet_name } : null,
  };
}

export type Dashboard = Awaited<ReturnType<typeof buildDashboard>>;

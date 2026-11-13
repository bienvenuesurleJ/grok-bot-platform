import { getSql, type Sql } from "@/lib/db";
import { FEATURE_KEYS, iso, num, type FeatureKey } from "./pure";

export type Role = "OWNER" | "SUPER_ADMIN" | "ADMIN" | "CLIENT";

export type Actor = {
  userId: string;
  email: string | null;
  role: Role;
  status: string;
  displayName: string;
  features: string[];
  staff: boolean;
  owner: boolean;
  botId: number | null;
};

type ProfileRow = {
  user_id: string;
  email: string | null;
  display_name: string;
  role: Role;
  status: string;
};

const STAFF = new Set(["OWNER", "SUPER_ADMIN", "ADMIN"]);

export async function loadActor(userId: string, email: string | null): Promise<Actor> {
  const sql = await getSql();
  await sql`
    update subscriptions
    set status = 'expired'
    where user_id = ${userId}
      and status in ('active', 'trialing')
      and current_period_end is not null
      and current_period_end < now()
  `;

  let rows = await sql<ProfileRow>`select user_id, email, display_name, role, status from profiles where user_id = ${userId}`;
  if (rows.length === 0) {
    const claimed = await sql<{ owner_user_id: string }>`
      update platform_state
      set owner_user_id = ${userId}, updated_at = now()
      where id = 1 and owner_user_id is null
      returning owner_user_id
    `;
    const role: Role = claimed.length > 0 ? "OWNER" : "CLIENT";
    await sql`
      insert into profiles (user_id, email, display_name, role)
      values (${userId}, ${email}, ${""}, ${role})
      on conflict (user_id) do nothing
    `;
    if (role === "OWNER") {
      await sql`
        insert into audit_logs (actor_id, action, target, detail)
        values (${userId}, 'owner.claim', ${userId}, 'Premier compte : rôle OWNER attribué côté serveur')
      `;
    }
    rows = await sql<ProfileRow>`select user_id, email, display_name, role, status from profiles where user_id = ${userId}`;
  }

  const state = await sql<{ owner_user_id: string | null }>`select owner_user_id from platform_state where id = 1`;
  if (state[0]?.owner_user_id === userId && rows[0]?.role !== "OWNER") {
    await sql`update profiles set role = 'OWNER', updated_at = now() where user_id = ${userId}`;
    rows = await sql<ProfileRow>`select user_id, email, display_name, role, status from profiles where user_id = ${userId}`;
  }

  const profile = rows[0];
  if (!profile) throw new Error("Profil introuvable");

  if (email && email !== profile.email) {
    await sql`update profiles set email = ${email}, updated_at = now() where user_id = ${userId}`;
    profile.email = email;
  }

  await ensureDesk(sql, userId);
  const bots = await sql<{ id: number }>`select id from bot_instances where user_id = ${userId} order by id asc limit 1`;
  const features = await featuresFor(sql, userId, profile.role);
  return {
    userId,
    email: profile.email,
    role: profile.role,
    status: profile.status,
    displayName: profile.display_name,
    features,
    staff: STAFF.has(profile.role),
    owner: profile.role === "OWNER",
    botId: bots[0] ? num(bots[0].id) : null,
  };
}

async function ensureDesk(sql: Sql, userId: string) {
  const bots = await sql<{ id: number }>`select id from bot_instances where user_id = ${userId} limit 1`;
  let botId = bots[0] ? num(bots[0].id) : 0;
  if (!botId) {
    const created = await sql<{ id: number }>`
      insert into bot_instances (user_id, name, mode, initial_cash, cash)
      values (${userId}, 'Grok Core', 'simulation', 10000, 10000)
      returning id
    `;
    botId = num(created[0]?.id);
    await sql`insert into bot_configs (bot_id) values (${botId}) on conflict (bot_id) do nothing`;
    await sql`
      insert into performance_snapshots (user_id, bot_id, equity, cash)
      values (${userId}, ${botId}, 10000, 10000)
    `;
  }
  await sql`
    insert into risk_limits (user_id) values (${userId})
    on conflict (user_id) do nothing
  `;
  const strategies = await sql<{ id: number }>`select id from trading_strategies where user_id = ${userId} limit 1`;
  if (strategies.length === 0) {
    const seeds = [
      {
        name: "Momentum gardé",
        description: "Achat simulé si la variation 1 h et le score analyste confirment un mouvement, après filtre Safety.",
        risk: "modéré",
        kind: "momentum",
        params: { minH1: 1.2, minH24: 0, minLiq: 80_000, minScore: 62, majorsOnly: false, sizeScale: 1 },
      },
      {
        name: "Repli liquide",
        description: "Achat simulé sur repli 24 h, uniquement si la liquidité reste profonde et que le repli n’accélère plus.",
        risk: "élevé",
        kind: "dip",
        params: { maxH24: -4, minLiq: 250_000, minScore: 48, majorsOnly: true, sizeScale: 0.7 },
      },
      {
        name: "Conservateur",
        description: "Uniquement SOL, JUP, RAY, ORCA ou PYTH, taille réduite, biais déjà positif.",
        risk: "faible",
        kind: "conservative",
        params: { minH1: 0.3, minH24: -2, minLiq: 200_000, minScore: 55, majorsOnly: true, sizeScale: 0.45 },
      },
    ];
    for (const s of seeds) {
      await sql`
        insert into trading_strategies (user_id, bot_id, name, description, risk_level, kind, params, enabled)
        values (${userId}, ${botId}, ${s.name}, ${s.description}, ${s.risk}, ${s.kind}, ${JSON.stringify(s.params)}, ${s.kind !== "dip"})
      `;
    }
  }
}

async function featuresFor(sql: Sql, userId: string, role: Role) {
  if (STAFF.has(role)) return ["*"];
  const rows = await sql<{ feature_key: string }>`
    select distinct f.feature_key
    from subscriptions s
    join plan_features f on f.plan_id = s.plan_id
    where s.user_id = ${userId} and s.status in ('active', 'trialing')
  `;
  return rows.map((r) => r.feature_key);
}

export function allows(actor: Actor, feature: FeatureKey) {
  return actor.features.includes("*") || actor.features.includes(feature);
}

export function assertActive(actor: Actor) {
  if (actor.status === "suspended") {
    throw new Error("Compte suspendu. Les opérations sont bloquées.");
  }
}

export function assertFeature(actor: Actor, feature: FeatureKey) {
  assertActive(actor);
  if (!allows(actor, feature)) {
    throw new Error("Offre insuffisante pour cette fonction. Aucun contournement n’est appliqué.");
  }
}

export function assertStaff(actor: Actor) {
  if (!actor.staff) throw new Error("Accès administration refusé.");
  if (actor.status === "suspended") throw new Error("Compte suspendu.");
}

export async function audit(actorId: string, action: string, target: string, detail: string) {
  const sql = await getSql();
  await sql`
    insert into audit_logs (actor_id, action, target, detail)
    values (${actorId}, ${action}, ${target}, ${detail})
  `;
}

export async function platform() {
  const sql = await getSql();
  const rows = await sql<{
    emergency_stop: boolean;
    emergency_stop_reason: string | null;
    emergency_stop_at: unknown;
    entries_halted: boolean;
    owner_user_id: string | null;
  }>`select emergency_stop, emergency_stop_reason, emergency_stop_at, entries_halted, owner_user_id from platform_state where id = 1`;
  const row = rows[0];
  return {
    emergencyStop: Boolean(row?.emergency_stop),
    emergencyReason: row?.emergency_stop_reason ?? null,
    emergencyAt: iso(row?.emergency_stop_at),
    entriesHalted: Boolean(row?.entries_halted),
    ownerUserId: row?.owner_user_id ?? null,
  };
}

export function knownFeature(key: string): key is FeatureKey {
  return (FEATURE_KEYS as readonly string[]).includes(key);
}

export async function db() {
  return getSql();
}

-- Grok Bot schema. Isolation is enforced in server functions (auth user id),
-- not by exposing the database role to the browser.

create table if not exists profiles (
  user_id text primary key,
  email text,
  display_name text not null default '',
  role text not null default 'CLIENT' check (role in ('OWNER', 'SUPER_ADMIN', 'ADMIN', 'CLIENT')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists platform_state (
  id integer primary key check (id = 1),
  owner_user_id text,
  emergency_stop boolean not null default false,
  emergency_stop_reason text,
  emergency_stop_at timestamptz,
  entries_halted boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into platform_state (id) values (1) on conflict (id) do nothing;

create table if not exists plans (
  id text primary key,
  code text not null unique,
  name text not null,
  description text not null default '',
  billing text not null default 'month' check (billing in ('month', 'year', 'lifetime')),
  price_cents integer not null default 0 check (price_cents >= 0),
  currency text not null default 'eur',
  active boolean not null default true,
  trial_days integer not null default 0 check (trial_days >= 0),
  stripe_price_id text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists plan_features (
  id serial primary key,
  plan_id text not null references plans (id) on delete cascade,
  feature_key text not null,
  unique (plan_id, feature_key)
);

create table if not exists coupons (
  id serial primary key,
  code text not null unique,
  percent_off integer not null check (percent_off between 1 and 100),
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists subscriptions (
  id serial primary key,
  user_id text not null references profiles (user_id) on delete cascade,
  plan_id text not null references plans (id),
  status text not null default 'active' check (status in ('trialing', 'active', 'past_due', 'canceled', 'expired')),
  current_period_end timestamptz,
  stripe_subscription_id text,
  source text not null default 'admin_grant',
  created_at timestamptz not null default now()
);
create index if not exists subscriptions_user_idx on subscriptions (user_id, status);

create table if not exists payments (
  id serial primary key,
  user_id text not null,
  plan_id text,
  amount_cents integer not null,
  currency text not null default 'eur',
  status text not null check (status in ('pending', 'paid', 'failed')),
  stripe_event_id text unique,
  stripe_session_id text,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists payments_user_idx on payments (user_id, created_at desc);

create table if not exists invoices (
  id serial primary key,
  user_id text not null,
  payment_id integer references payments (id),
  number text not null unique,
  amount_cents integer not null,
  currency text not null default 'eur',
  status text not null,
  created_at timestamptz not null default now()
);
create index if not exists invoices_user_idx on invoices (user_id, created_at desc);

create table if not exists wallet_connections (
  id serial primary key,
  user_id text not null references profiles (user_id) on delete cascade,
  chain text not null default 'solana',
  address text not null,
  wallet_name text not null default 'wallet',
  connected_at timestamptz not null default now(),
  unique (user_id, chain, address)
);
create index if not exists wallets_user_idx on wallet_connections (user_id);

create table if not exists bot_instances (
  id serial primary key,
  user_id text not null references profiles (user_id) on delete cascade,
  name text not null,
  mode text not null default 'simulation' check (mode in ('simulation', 'assisted', 'automated')),
  status text not null default 'active' check (status in ('active', 'paused')),
  initial_cash double precision not null default 10000,
  cash double precision not null default 10000,
  network text not null default 'solana-mainnet',
  created_at timestamptz not null default now()
);
create index if not exists bots_user_idx on bot_instances (user_id);

create table if not exists bot_configs (
  bot_id integer primary key references bot_instances (id) on delete cascade,
  night_start integer not null default 22 check (night_start between 0 and 23),
  night_end integer not null default 8 check (night_end between 0 and 23),
  timezone text not null default 'Europe/Paris'
);

create table if not exists trading_strategies (
  id serial primary key,
  user_id text not null,
  bot_id integer references bot_instances (id) on delete cascade,
  name text not null,
  description text not null default '',
  risk_level text not null default 'modéré',
  kind text not null,
  params text not null default '{}',
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists strategies_user_idx on trading_strategies (user_id, bot_id);

create table if not exists risk_limits (
  user_id text primary key references profiles (user_id) on delete cascade,
  max_position_usd double precision not null default 500,
  risk_per_trade_bps integer not null default 100,
  daily_loss_limit_usd double precision not null default 300,
  max_exposure_usd double precision not null default 4000,
  max_open_positions integer not null default 4,
  stop_loss_bps integer not null default 600,
  take_profit_bps integer not null default 800,
  slippage_bps integer not null default 30,
  fee_bps integer not null default 30
);

create table if not exists market_snapshots (
  id serial primary key,
  token_address text not null,
  symbol text not null,
  name text not null,
  price_usd double precision not null,
  volume_h24 double precision,
  liquidity_usd double precision,
  change_h1 double precision,
  change_h24 double precision,
  pair_address text,
  dex text,
  source text not null default 'dexscreener',
  captured_at timestamptz not null default now()
);
create index if not exists market_snap_token_time on market_snapshots (token_address, captured_at desc);
create index if not exists market_snap_time on market_snapshots (captured_at desc);

create table if not exists agent_runs (
  id serial primary key,
  user_id text not null,
  tick_id text not null,
  agent text not null,
  status text not null check (status in ('ok', 'error', 'idle')),
  summary text not null default '',
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists agent_runs_user on agent_runs (user_id, started_at desc);

create table if not exists agent_decisions (
  id serial primary key,
  user_id text not null,
  run_id integer references agent_runs (id) on delete set null,
  tick_id text not null,
  agent text not null,
  token_symbol text,
  token_address text,
  action text not null,
  reason text not null,
  price_usd double precision,
  size_usd double precision,
  result text,
  tx_signature text,
  created_at timestamptz not null default now()
);
create index if not exists decisions_user_time on agent_decisions (user_id, created_at desc);

create table if not exists trading_signals (
  id serial primary key,
  user_id text not null,
  symbol text not null,
  token_address text not null,
  side text not null,
  score integer not null,
  reason text not null,
  strategy_id integer,
  created_at timestamptz not null default now()
);
create index if not exists signals_user_idx on trading_signals (user_id, created_at desc);

create table if not exists trading_orders (
  id serial primary key,
  user_id text not null,
  bot_id integer not null,
  client_key text not null,
  symbol text not null,
  token_address text not null,
  side text not null,
  size_usd double precision not null,
  qty double precision,
  limit_price double precision,
  status text not null,
  mode text not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, client_key)
);
create index if not exists orders_user_idx on trading_orders (user_id, created_at desc);

create table if not exists trading_positions (
  id serial primary key,
  user_id text not null,
  bot_id integer not null,
  token_address text not null,
  symbol text not null,
  qty double precision not null,
  avg_price double precision not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  realized_pnl double precision not null default 0,
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists positions_user_idx on trading_positions (user_id, status);

create table if not exists trade_executions (
  id serial primary key,
  user_id text not null,
  order_id integer references trading_orders (id),
  position_id integer,
  symbol text not null,
  token_address text not null,
  side text not null,
  qty double precision not null,
  price double precision not null,
  notional_usd double precision not null,
  fee_usd double precision not null,
  slippage_usd double precision not null,
  pnl_usd double precision,
  mode text not null,
  simulated boolean not null default true,
  signature text,
  created_at timestamptz not null default now()
);
create index if not exists exec_user_idx on trade_executions (user_id, created_at desc);

create table if not exists performance_snapshots (
  id serial primary key,
  user_id text not null,
  bot_id integer not null,
  equity double precision not null,
  cash double precision not null,
  captured_at timestamptz not null default now()
);
create index if not exists perf_user_time on performance_snapshots (user_id, captured_at desc);

create table if not exists notifications (
  id serial primary key,
  user_id text not null,
  title text not null,
  body text not null,
  level text not null default 'info',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications (user_id, created_at desc);

create table if not exists audit_logs (
  id serial primary key,
  actor_id text,
  action text not null,
  target text,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists audit_time_idx on audit_logs (created_at desc);

create table if not exists api_integrations (
  id serial primary key,
  name text not null unique,
  status text not null,
  note text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists chat_messages (
  id serial primary key,
  user_id text not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  source text not null default 'local',
  created_at timestamptz not null default now()
);
create index if not exists chat_user_idx on chat_messages (user_id, created_at desc);

insert into plans (id, code, name, description, billing, price_cents, sort_order)
select 'starter', 'GROKBOT_STARTER', 'Grok Bot Starter',
  'Tableau de bord, scanner, simulation, historique et signaux. Tarif à définir par l’administration — aucun prix n’est figé dans le code.',
  'month', 0, 1
where not exists (select 1 from plans where id = 'starter');

insert into plans (id, code, name, description, billing, price_cents, sort_order)
select 'pro', 'GROKBOT_PRO', 'Grok Bot Pro',
  'Stratégies, agents, alertes et connexion wallet en lecture. Tarif à définir.',
  'month', 0, 2
where not exists (select 1 from plans where id = 'pro');

insert into plans (id, code, name, description, billing, price_cents, sort_order)
select 'premium', 'GROKBOT_PREMIUM', 'Grok Bot Premium',
  'Paramètres avancés, rapports, statistiques, assistant et préparation de l’automatisation. Tarif à définir.',
  'month', 0, 3
where not exists (select 1 from plans where id = 'premium');

insert into plans (id, code, name, description, billing, price_cents, sort_order)
select 'lifetime', 'GROKBOT_LIFETIME', 'Grok Bot Lifetime',
  'Accès unique, périmètre défini par les fonctionnalités de l’offre. Tarif à définir.',
  'lifetime', 0, 4
where not exists (select 1 from plans where id = 'lifetime');

insert into plan_features (plan_id, feature_key)
select p.plan_id, p.feature_key
from (
  values
    ('starter', 'dashboard'),
    ('starter', 'scanner'),
    ('starter', 'simulation'),
    ('starter', 'history'),
    ('starter', 'signals'),
    ('pro', 'dashboard'),
    ('pro', 'scanner'),
    ('pro', 'simulation'),
    ('pro', 'history'),
    ('pro', 'signals'),
    ('pro', 'strategies'),
    ('pro', 'agents'),
    ('pro', 'alerts'),
    ('pro', 'wallet'),
    ('premium', 'dashboard'),
    ('premium', 'scanner'),
    ('premium', 'simulation'),
    ('premium', 'history'),
    ('premium', 'signals'),
    ('premium', 'strategies'),
    ('premium', 'agents'),
    ('premium', 'alerts'),
    ('premium', 'wallet'),
    ('premium', 'advanced_params'),
    ('premium', 'reports'),
    ('premium', 'stats'),
    ('premium', 'assistant'),
    ('premium', 'automation_prep'),
    ('lifetime', 'dashboard'),
    ('lifetime', 'scanner'),
    ('lifetime', 'simulation'),
    ('lifetime', 'history'),
    ('lifetime', 'signals'),
    ('lifetime', 'strategies'),
    ('lifetime', 'agents'),
    ('lifetime', 'alerts'),
    ('lifetime', 'wallet'),
    ('lifetime', 'advanced_params'),
    ('lifetime', 'reports'),
    ('lifetime', 'stats'),
    ('lifetime', 'assistant'),
    ('lifetime', 'automation_prep')
) as p(plan_id, feature_key)
where not exists (
  select 1 from plan_features f where f.plan_id = p.plan_id and f.feature_key = p.feature_key
);

insert into api_integrations (name, status, note)
select v.name, v.status, v.note
from (
  values
    ('DexScreener', 'lecture', 'Prix, volume et liquidité Solana. Aucune clé. Pas un partenariat.'),
    ('Solana RPC public', 'lecture', 'Solde SOL si un wallet est connecté. Aucune clé privée.'),
    ('Phantom', 'navigateur', 'Détection de l’extension. Aucune phrase de récupération.'),
    ('Solflare', 'navigateur', 'Détection de l’extension si elle est présente.'),
    ('Jupiter', 'non connecté', 'Pas d’exécution de swap. Aucun partenariat affiché.'),
    ('xAI', 'serveur', 'Assistant uniquement si la clé plateforme est présente. Jamais exposée au navigateur.'),
    ('Stripe Grok Bot', 'non configuré', 'Compte et Price IDs distincts, préfixe GROKBOT_. Aucun objet du premier site.')
) as v(name, status, note)
where not exists (select 1 from api_integrations i where i.name = v.name);

create table if not exists reference_repos (
  slug text primary key,
  http_status integer,
  state text not null,
  sync text not null,
  license text,
  calls integer not null default 0,
  last_checked timestamptz
);

insert into reference_repos (slug, state, sync, calls)
values
  ('TauricResearch/TradingAgents', 'en attente', 'pas encore sondé', 0),
  ('sendaifun/solana-agent-kit', 'en attente', 'pas encore sondé', 0),
  ('Jackhuang166/ai-memecoin-trading-bot', 'en attente', 'pas encore sondé', 0)
on conflict (slug) do nothing;

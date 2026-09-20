create table if not exists ledgerly_sessions (
  id text primary key,
  data jsonb not null,
  expires_at timestamptz not null default now() + interval '1 day'
);
alter table ledgerly_sessions enable row level security;
alter table ledgerly_sessions force row level security;
drop policy if exists ledgerly_session_scope on ledgerly_sessions;
create policy ledgerly_session_scope on ledgerly_sessions
  using (id = current_setting('ledgerly.session', true))
  with check (id = current_setting('ledgerly.session', true));
create table if not exists ledgerly_ai_usage (
  day date primary key,
  attempts integer not null check (attempts >= 0)
);
alter table ledgerly_ai_usage enable row level security;
-- Backend-only SQL connection. Do not expose either table through a public Data API.
alter table ledgerly_sessions add column if not exists generation integer not null default 0;
create table if not exists ledgerly_intakes (
  id uuid primary key,
  session_id text not null references ledgerly_sessions(id) on delete cascade,
  generation integer not null,
  invoice_id text,
  created_at timestamptz not null default now()
);
create index if not exists ledgerly_intakes_owner on ledgerly_intakes(session_id);
alter table ledgerly_intakes add column if not exists source text not null default '';
alter table ledgerly_intakes enable row level security;
alter table ledgerly_intakes force row level security;
drop policy if exists ledgerly_intake_scope on ledgerly_intakes;
create policy ledgerly_intake_scope on ledgerly_intakes
  using (session_id = current_setting('ledgerly.session', true))
  with check (session_id = current_setting('ledgerly.session', true));

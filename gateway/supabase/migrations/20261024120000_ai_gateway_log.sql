-- AI gateway: log di soli METADATI (nessun contenuto di prompt/risposta: dati sanitari).
-- Accesso riservato al service role: RLS attiva e nessuna policy => anon/authenticated non vedono nulla.
-- NON applicata automaticamente: da applicare manualmente sul progetto Supabase sleep-tracker.

create table if not exists public.ai_gateway_log (
  id                bigint generated always as identity primary key,
  created_at        timestamptz not null default now(),
  request_id        uuid not null,
  endpoint          text not null check (endpoint in ('chat', 'insights')),
  provider_id       text,
  model             text,
  attempt           smallint not null default 1 check (attempt between 1 and 100),
  outcome           text not null check (outcome in ('success', 'error', 'skipped', 'rules_fallback')),
  error_kind        text,
  http_status       smallint,
  latency_ms        integer check (latency_ms is null or latency_ms >= 0),
  prompt_tokens     integer,
  completion_tokens integer,
  total_tokens      integer,
  structured_mode   text check (structured_mode is null or structured_mode in ('json_schema', 'json_object', 'prompt')),
  validation        text check (validation is null or validation in ('ok', 'invalid', 'n/a')),
  source            text check (source is null or source in ('ai', 'rules'))
);

comment on table public.ai_gateway_log is
  'Metadati delle chiamate dell''AI gateway (provider, esito, latenza, token). Mai contenuti. Solo service role.';

create index if not exists ai_gateway_log_created_at_idx on public.ai_gateway_log (created_at desc);
create index if not exists ai_gateway_log_provider_idx on public.ai_gateway_log (provider_id, created_at desc);

alter table public.ai_gateway_log enable row level security;

-- Nessuna policy: solo il service role (che bypassa RLS) puo' leggere/scrivere.
revoke all on table public.ai_gateway_log from anon, authenticated;
revoke all on sequence public.ai_gateway_log_id_seq from anon, authenticated;

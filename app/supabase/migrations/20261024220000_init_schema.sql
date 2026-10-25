-- Schema iniziale Sleep Tracker (Postgres 17, Supabase).
-- App a utente singolo: TUTTI gli accessi passano dal server con service role.
-- Ogni tabella: RLS attiva SENZA policy + revoke a anon/authenticated (nessun accesso diretto).
-- Nessun segreto in questo file.

-- ---------------------------------------------------------------------------
-- Funzione trigger: aggiorna updated_at a ogni UPDATE
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

comment on function public.set_updated_at() is 'Trigger: imposta updated_at = now() prima di ogni UPDATE.';

-- ---------------------------------------------------------------------------
-- events: segnali grezzi (Comandi iOS, app, stime), idempotenti
-- ---------------------------------------------------------------------------
create table if not exists public.events (
  id              bigint generated always as identity primary key,
  idempotency_key text        not null unique,
  type            text        not null
    check (type in ('bedtime_candidate', 'wake', 'nap_start', 'nap_end', 'evening_check', 'app_open')),
  ts              timestamptz not null,
  source          text        not null
    check (source in ('comandi', 'app', 'stima')),
  created_at      timestamptz not null default now()
);

comment on table public.events is 'Segnali grezzi ricevuti da POST /api/events; idempotency_key evita duplicati.';

create index if not exists events_ts_idx on public.events (ts);

-- ---------------------------------------------------------------------------
-- nights: una riga per notte, identificata dalla data locale del risveglio
-- ---------------------------------------------------------------------------
create table if not exists public.nights (
  night_date   date        primary key,
  bed_at       timestamptz,
  bed_prov     text        not null default 'mancante'
    check (bed_prov in ('automatico', 'confermato', 'stimato', 'mancante')),
  wake_at      timestamptz,
  wake_prov    text        not null default 'mancante'
    check (wake_prov in ('automatico', 'confermato', 'stimato', 'mancante')),
  status       text        not null default 'mancante'
    check (status in ('confermata', 'stimata', 'mancante')),
  quality      smallint
    check (quality between 1 and 5),
  quality_prov text        not null default 'mancante'
    check (quality_prov in ('automatico', 'confermato', 'stimato', 'mancante')),
  energy       smallint
    check (energy between 1 and 5),
  energy_prov  text        not null default 'mancante'
    check (energy_prov in ('automatico', 'confermato', 'stimato', 'mancante')),
  is_exception boolean     not null default false,
  factors      text[]      not null default '{}',
  updated_at   timestamptz not null default now(),
  -- Coerenza: valore mancante => provenienza 'mancante'
  constraint nights_bed_coherence     check (bed_at  is not null or bed_prov     = 'mancante'),
  constraint nights_wake_coherence    check (wake_at is not null or wake_prov    = 'mancante'),
  constraint nights_quality_coherence check (quality is not null or quality_prov = 'mancante'),
  constraint nights_energy_coherence  check (energy  is not null or energy_prov  = 'mancante')
);

comment on table public.nights is 'Notti (data locale Europe/Rome del risveglio); una notte confermata non si sovrascrive (regola applicativa).';

create or replace trigger nights_set_updated_at
  before update on public.nights
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- naps: sonnellini
-- ---------------------------------------------------------------------------
create table if not exists public.naps (
  id         bigint generated always as identity primary key,
  date       date        not null,
  start_at   timestamptz not null unique,
  minutes    integer     not null
    check (minutes > 0 and minutes <= 600),
  provenance text        not null
    check (provenance in ('automatico', 'confermato', 'stimato', 'mancante'))
);

comment on table public.naps is 'Sonnellini; start_at univoco per rendere idempotente il salvataggio.';

-- ---------------------------------------------------------------------------
-- evening_checks: check serale (stanchezza, umore, fattori, sonnellino)
-- ---------------------------------------------------------------------------
create table if not exists public.evening_checks (
  date           date        primary key,
  tiredness      smallint
    check (tiredness between 1 and 5),
  tiredness_prov text        not null default 'mancante'
    check (tiredness_prov in ('automatico', 'confermato', 'stimato', 'mancante')),
  mood           smallint
    check (mood between 1 and 5),
  mood_prov      text        not null default 'mancante'
    check (mood_prov in ('automatico', 'confermato', 'stimato', 'mancante')),
  factors        text[]      not null default '{}',
  nap_minutes    integer
    check (nap_minutes >= 0),
  nap_prov       text        not null default 'mancante'
    check (nap_prov in ('automatico', 'confermato', 'stimato', 'mancante')),
  saved_at       timestamptz not null default now()
);

comment on table public.evening_checks is 'Check serale per data locale della sera.';

-- ---------------------------------------------------------------------------
-- exception_types: catalogo dei tipi di giorno-eccezione
-- ---------------------------------------------------------------------------
create table if not exists public.exception_types (
  slug  text    primary key
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  label text    not null,
  uses  integer not null default 0
);

comment on table public.exception_types is 'Tipi di eccezione (slug kebab-case); uses = contatore utilizzi.';

insert into public.exception_types (slug, label) values
  ('malattia',        'malattia'),
  ('viaggio',         'viaggio'),
  ('festa',           'festa'),
  ('notte-in-bianco', 'notte in bianco'),
  ('alcol',           'alcol')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- night_exceptions: eccezioni associate a una notte
-- ---------------------------------------------------------------------------
create table if not exists public.night_exceptions (
  night_date date not null references public.nights (night_date) on delete cascade,
  slug       text not null references public.exception_types (slug),
  primary key (night_date, slug)
);

comment on table public.night_exceptions is 'Associazione notte <-> tipo di eccezione.';

-- ---------------------------------------------------------------------------
-- questions_log: domande poste all'utente (per non ripeterle)
-- ---------------------------------------------------------------------------
create table if not exists public.questions_log (
  id                  bigint generated always as identity primary key,
  date                date        not null,
  kind                text        not null
    check (kind in ('confirm_night', 'energy', 'quality', 'nap_today', 'exception', 'factors')),
  night_date          date,
  answered_or_skipped boolean     not null default false,
  created_at          timestamptz default now()
);

comment on table public.questions_log is 'Registro delle domande mostrate (risposte o saltate).';

create index if not exists questions_log_date_idx on public.questions_log (date);

-- ---------------------------------------------------------------------------
-- settings: impostazioni chiave/valore
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  key        text        primary key,
  value      jsonb       not null,
  updated_at timestamptz not null default now()
);

comment on table public.settings is 'Impostazioni applicative (valori JSON).';

create or replace trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

insert into public.settings (key, value) values
  ('target_sleep_minutes', '450'::jsonb),
  ('timezone',             '"Europe/Rome"'::jsonb)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- insights_cache: insight calcolati (AI o regole)
-- ---------------------------------------------------------------------------
create table if not exists public.insights_cache (
  key        text        primary key,
  payload    jsonb       not null,
  source     text        not null
    check (source in ('ai', 'rules')),
  created_at timestamptz not null default now()
);

comment on table public.insights_cache is 'Cache degli insight; source indica se generati da AI o da regole.';

-- ---------------------------------------------------------------------------
-- api_tokens: token dei Comandi iOS (solo hash, mai il token in chiaro)
-- ---------------------------------------------------------------------------
create table if not exists public.api_tokens (
  id           bigint generated always as identity primary key,
  token_hash   text        not null unique,
  label        text        not null,
  active       boolean     not null default true,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

comment on table public.api_tokens is 'Token API: si salva solo l''hash.';

-- ---------------------------------------------------------------------------
-- Sicurezza: RLS attiva senza policy + nessun privilegio a anon/authenticated
-- ---------------------------------------------------------------------------
alter table public.events           enable row level security;
alter table public.nights           enable row level security;
alter table public.naps             enable row level security;
alter table public.evening_checks   enable row level security;
alter table public.exception_types  enable row level security;
alter table public.night_exceptions enable row level security;
alter table public.questions_log    enable row level security;
alter table public.settings         enable row level security;
alter table public.insights_cache   enable row level security;
alter table public.api_tokens       enable row level security;

revoke all on table
  public.events,
  public.nights,
  public.naps,
  public.evening_checks,
  public.exception_types,
  public.night_exceptions,
  public.questions_log,
  public.settings,
  public.insights_cache,
  public.api_tokens
from anon, authenticated;

-- Sequenze delle colonne identity
revoke all on sequence
  public.events_id_seq,
  public.naps_id_seq,
  public.questions_log_id_seq,
  public.api_tokens_id_seq
from anon, authenticated;

-- La funzione trigger non deve essere invocabile dai ruoli client
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Query di verifica (da eseguire a mano dopo l'applicazione):
--
-- select c.relname                                  as tabella,
--        c.relrowsecurity                           as rls_attiva,
--        (select count(*) from pg_policy p where p.polrelid = c.oid) as n_policy,
--        has_table_privilege('anon', c.oid, 'select')          as anon_select,
--        has_table_privilege('authenticated', c.oid, 'select') as auth_select
--   from pg_class c
--   join pg_namespace n on n.oid = c.relnamespace
--  where n.nspname = 'public' and c.relkind = 'r'
--  order by c.relname;
-- -- Atteso: 10 tabelle, rls_attiva = true, n_policy = 0, anon_select/auth_select = false.
--
-- select (select count(*) from public.exception_types) as n_exception_types, -- atteso 5
--        (select count(*) from public.settings)        as n_settings;        -- atteso 2
-- ---------------------------------------------------------------------------

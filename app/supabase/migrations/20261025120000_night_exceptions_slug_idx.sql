-- Indice sulla chiave esterna night_exceptions.slug (advisor Supabase: unindexed_foreign_keys).
create index if not exists night_exceptions_slug_idx on public.night_exceptions (slug);

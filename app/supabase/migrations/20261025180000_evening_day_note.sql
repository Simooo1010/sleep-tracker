-- Descrizione libera della giornata nel check serale (facoltativa, max 280 caratteri = DAY_NOTE_MAX).
alter table public.evening_checks
  add column if not exists day_note text
  check (day_note is null or char_length(day_note) <= 280);

comment on column public.evening_checks.day_note is 'Nota libera sulla giornata (facoltativa, max 280 caratteri).';

-- Gattlen Flow – Rangliste für Supabase
-- Gleiches Supabase-Projekt wie Iischi Party («Ranglisten der Spiele»), eigene Tabellen gattlen_flow_…
-- Einmal im Supabase-Dashboard unter "SQL Editor" einfügen und auf "Run" klicken.
-- Das Skript kann gefahrlos mehrmals ausgeführt werden.
--
-- Gewertet wird die Reise: Summe der besten Punkte aus den 12 Levels (höchstens 12 × 1000 = 12'000).
--
-- Sicherheit:
-- * Das Spiel darf die Tabelle weder direkt lesen noch direkt beschreiben.
-- * Es ruft nur die zwei Funktionen unten auf.
-- * E-Mail-Adressen verlassen die Datenbank nie. Sichtbar sind sie nur im
--   Supabase-Dashboard (Table Editor -> gattlen_flow_alle_spiele).

-- Tabelle gattlen_flow_alle_spiele: jeder Eintrag mit Name, E-Mail und Punkten.
create table if not exists public.gattlen_flow_alle_spiele (
  id         bigint generated always as identity primary key,
  name       text        not null check (char_length(name) between 1 and 24),
  email      text        not null check (char_length(email) <= 254 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  score      integer     not null check (score between 0 and 12000),
  levels     integer     not null default 0 check (levels between 0 and 12),
  stars      integer     not null default 0 check (stars between 0 and 36),
  created_at timestamptz not null default now(),
  -- Pro geschafftes Level gibt es 100 bis 1000 Punkte und 1 bis 3 Sterne.
  check (score between levels * 100 and levels * 1000),
  check (stars between levels and levels * 3)
);

create index if not exists gattlen_flow_email_idx on public.gattlen_flow_alle_spiele (lower(email));
create index if not exists gattlen_flow_score_idx on public.gattlen_flow_alle_spiele (score desc);

alter table public.gattlen_flow_alle_spiele enable row level security;
revoke all on table public.gattlen_flow_alle_spiele from anon, authenticated;

-- Bestenliste: pro Spieler (E-Mail) zählt nur das beste Ergebnis.
-- Gibt nur Platz, Name und Punkte zurück, nie die E-Mail.
create or replace function public.gattlen_flow_board(p_limit integer default 10)
returns table (rank bigint, name text, score integer)
language sql
stable
security definer
set search_path = public
as $$
  with best as (
    select distinct on (lower(s.email)) s.name, s.score, s.created_at
    from public.gattlen_flow_alle_spiele s
    order by lower(s.email), s.score desc, s.created_at asc
  )
  select rank() over (order by b.score desc) as rank, b.name, b.score
  from best b
  order by b.score desc, b.created_at asc
  limit least(greatest(coalesce(p_limit, 10), 1), 100);
$$;

-- Ergebnis eintragen. Gibt den Platz des Spielers, seine Bestpunktzahl
-- und die Anzahl Spieler auf der Rangliste zurück.
create or replace function public.gattlen_flow_submit(p_name text, p_email text, p_score integer, p_levels integer, p_stars integer)
returns table (rank bigint, best_score integer, total bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name  text := btrim(regexp_replace(coalesce(p_name, ''), '[[:space:]]+', ' ', 'g'));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_best  integer;
begin
  -- Schutz gegen Spam: höchstens 20 Einträge pro E-Mail-Adresse und Stunde.
  if (select count(*) from public.gattlen_flow_alle_spiele s
      where lower(s.email) = v_email and s.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'too_many_entries' using errcode = 'P0001';
  end if;

  insert into public.gattlen_flow_alle_spiele (name, email, score, levels, stars)
  values (v_name, v_email, p_score, coalesce(p_levels, 0), coalesce(p_stars, 0));

  select max(s.score) into v_best from public.gattlen_flow_alle_spiele s where lower(s.email) = v_email;

  -- Der zuletzt eingegebene Name gilt für alle Einträge dieses Spielers.
  update public.gattlen_flow_alle_spiele s set name = v_name where lower(s.email) = v_email and s.name <> v_name;

  return query
    with best as (
      select lower(s.email) as player, max(s.score) as top
      from public.gattlen_flow_alle_spiele s
      group by lower(s.email)
    )
    select (select count(*) from best where top > v_best) + 1,
           v_best,
           (select count(*) from best);
end;
$$;

-- Übersicht für das Supabase-Dashboard (Table Editor -> gattlen_flow_rangliste):
-- bestes Ergebnis pro Spieler mit E-Mail, sortiert nach Platz.
-- Nur im Dashboard sichtbar, das Spiel hat keinen Zugriff.
create or replace view public.gattlen_flow_rangliste with (security_invoker = true) as
  with best as (
    select distinct on (lower(s.email)) s.name, s.email, s.score, s.levels, s.stars, s.created_at
    from public.gattlen_flow_alle_spiele s
    order by lower(s.email), s.score desc, s.created_at asc
  ),
  runs as (
    select lower(s.email) as player, count(*) as eintraege from public.gattlen_flow_alle_spiele s group by lower(s.email)
  )
  select rank() over (order by b.score desc) as platz,
         b.name, b.email, b.score as punkte, b.levels as levels_geschafft,
         b.stars as sterne, r.eintraege, b.created_at as datum
  from best b join runs r on r.player = lower(b.email)
  order by b.score desc, b.created_at asc;

revoke all on table public.gattlen_flow_rangliste from anon, authenticated;
revoke all on function public.gattlen_flow_board(integer) from public;
revoke all on function public.gattlen_flow_submit(text, text, integer, integer, integer) from public;
grant execute on function public.gattlen_flow_board(integer) to anon, authenticated;
grant execute on function public.gattlen_flow_submit(text, text, integer, integer, integer) to anon, authenticated;

-- Gattlen Flow – Rangliste für Supabase
-- Gleiches Supabase-Projekt wie Iischi Party («Ranglisten der Spiele»), eigene Tabellen gattlen_flow_…
-- Einmal im Supabase-Dashboard unter "SQL Editor" einfügen und auf "Run" klicken.
-- Das Skript kann gefahrlos mehrmals ausgeführt werden.
--
-- Gewertet wird die Zeit: Wer ein Level am schnellsten schafft, steht zuoberst.
-- Jeder Tipp zählt 10 Sekunden zur Zeit dazu.
-- Jedes der 12 Levels hat eine eigene Rangliste. Bei gleicher Zeit gewinnt, wer weniger Züge brauchte.
-- Pro Spieler (E-Mail) und Level zählt nur die beste Zeit.
--
-- Sicherheit:
-- * Das Spiel darf die Tabelle weder direkt lesen noch direkt beschreiben.
-- * Es ruft nur die zwei Funktionen unten auf.
-- * E-Mail-Adressen verlassen die Datenbank nie. Sichtbar sind sie nur im
--   Supabase-Dashboard (Table Editor -> gattlen_flow_alle_spiele).

-- Frühere Entwürfe dieses Skripts (Punkte der ganzen Reise bzw. Tageschallenge) werden entfernt.
-- Sie waren nie öffentlich im Spiel.
do $$
begin
  if to_regclass('public.gattlen_flow_alle_spiele') is not null and not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'gattlen_flow_alle_spiele' and column_name = 'time_ms') then
    drop view if exists public.gattlen_flow_rangliste;
    drop function if exists public.gattlen_flow_board(integer);
    drop function if exists public.gattlen_flow_board(integer, integer);
    drop function if exists public.gattlen_flow_submit(text, text, integer, integer, integer);
    drop function if exists public.gattlen_flow_submit(text, text, integer, integer, integer, integer);
    drop function if exists public.gattlen_flow_day(integer);
    drop table public.gattlen_flow_alle_spiele;
  end if;
end $$;

-- Tabelle gattlen_flow_alle_spiele: jedes eingetragene Level mit Name, E-Mail, Zeit und Zügen.
create table if not exists public.gattlen_flow_alle_spiele (
  id         bigint generated always as identity primary key,
  level      integer     not null check (level between 1 and 12),
  name       text        not null check (char_length(name) between 1 and 24),
  email      text        not null check (char_length(email) <= 254 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  time_ms    integer     not null check (time_ms between 1000 and 3600000),
  moves      integer     not null check (moves between 1 and 10000),
  hints      integer     not null default 0 check (hints between 0 and 100),
  created_at timestamptz not null default now(),
  -- Jeder Tipp kostet 10 Sekunden, die Zeit enthält diese Strafzeit schon.
  check (time_ms >= 1000 + hints * 10000)
);

create index if not exists gattlen_flow_level_email_idx on public.gattlen_flow_alle_spiele (level, lower(email));
create index if not exists gattlen_flow_level_time_idx on public.gattlen_flow_alle_spiele (level, time_ms asc, moves asc);

alter table public.gattlen_flow_alle_spiele enable row level security;
revoke all on table public.gattlen_flow_alle_spiele from anon, authenticated;

-- Bestenliste eines Levels: pro Spieler (E-Mail) zählt nur die beste Zeit.
-- Gibt nur Platz, Name, Zeit und Züge zurück, nie die E-Mail.
create or replace function public.gattlen_flow_board(p_level integer, p_limit integer default 10)
returns table (rank bigint, name text, time_ms integer, moves integer)
language sql
stable
security definer
set search_path = public
as $$
  with best as (
    select distinct on (lower(s.email)) s.name, s.time_ms, s.moves, s.created_at
    from public.gattlen_flow_alle_spiele s
    where s.level = p_level
    order by lower(s.email), s.time_ms asc, s.moves asc, s.created_at asc
  )
  select rank() over (order by b.time_ms asc, b.moves asc) as rank, b.name, b.time_ms, b.moves
  from best b
  order by b.time_ms asc, b.moves asc, b.created_at asc
  limit least(greatest(coalesce(p_limit, 10), 1), 100);
$$;

-- Zeit eintragen. Gibt den Platz des Spielers in diesem Level, seine beste Zeit
-- und die Anzahl Spieler auf der Rangliste dieses Levels zurück.
create or replace function public.gattlen_flow_submit(p_name text, p_email text, p_level integer, p_time_ms integer, p_moves integer, p_hints integer)
returns table (rank bigint, best_time_ms integer, best_moves integer, total bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name  text := btrim(regexp_replace(coalesce(p_name, ''), '[[:space:]]+', ' ', 'g'));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_time  integer;
  v_moves integer;
begin
  -- Schutz gegen Spam: höchstens 30 Einträge pro E-Mail-Adresse und Stunde.
  if (select count(*) from public.gattlen_flow_alle_spiele s
      where lower(s.email) = v_email and s.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'too_many_entries' using errcode = 'P0001';
  end if;

  insert into public.gattlen_flow_alle_spiele (level, name, email, time_ms, moves, hints)
  values (p_level, v_name, v_email, p_time_ms, p_moves, coalesce(p_hints, 0));

  select s.time_ms, s.moves into v_time, v_moves
  from public.gattlen_flow_alle_spiele s
  where s.level = p_level and lower(s.email) = v_email
  order by s.time_ms asc, s.moves asc, s.created_at asc
  limit 1;

  -- Der zuletzt eingegebene Name gilt für alle Einträge dieses Spielers.
  update public.gattlen_flow_alle_spiele s set name = v_name where lower(s.email) = v_email and s.name <> v_name;

  return query
    with best as (
      select distinct on (lower(s.email)) s.time_ms, s.moves
      from public.gattlen_flow_alle_spiele s
      where s.level = p_level
      order by lower(s.email), s.time_ms asc, s.moves asc
    )
    select (select count(*) from best b where b.time_ms < v_time or (b.time_ms = v_time and b.moves < v_moves)) + 1,
           v_time,
           v_moves,
           (select count(*) from best);
end;
$$;

-- Übersicht für das Supabase-Dashboard (Table Editor -> gattlen_flow_rangliste):
-- beste Zeit pro Spieler und Level mit E-Mail, sortiert nach Level und Platz.
-- Nur im Dashboard sichtbar, das Spiel hat keinen Zugriff.
create or replace view public.gattlen_flow_rangliste with (security_invoker = true) as
  with best as (
    select distinct on (s.level, lower(s.email)) s.level, s.name, s.email, s.time_ms, s.moves, s.hints, s.created_at
    from public.gattlen_flow_alle_spiele s
    order by s.level, lower(s.email), s.time_ms asc, s.moves asc, s.created_at asc
  ),
  runs as (
    select s.level, lower(s.email) as player, count(*) as eintraege
    from public.gattlen_flow_alle_spiele s group by s.level, lower(s.email)
  )
  select b.level,
         rank() over (partition by b.level order by b.time_ms asc, b.moves asc) as platz,
         b.name, b.email, round(b.time_ms / 1000.0, 1) as sekunden, b.moves as zuege, b.hints as tipps,
         r.eintraege, b.created_at as datum
  from best b join runs r on r.level = b.level and r.player = lower(b.email)
  order by b.level, b.time_ms asc, b.moves asc, b.created_at asc;

revoke all on table public.gattlen_flow_rangliste from anon, authenticated;
revoke all on function public.gattlen_flow_board(integer, integer) from public;
revoke all on function public.gattlen_flow_submit(text, text, integer, integer, integer, integer) from public;
grant execute on function public.gattlen_flow_board(integer, integer) to anon, authenticated;
grant execute on function public.gattlen_flow_submit(text, text, integer, integer, integer, integer) to anon, authenticated;

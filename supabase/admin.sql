-- Tableau de bord des données de Pokhades (src/ui/dashboard.ts, README « Tableau de bord »).
--
-- Demande du 27 novembre 2026 : « dans mes stats, un truc pour voir toutes les stats de jeu, les
-- gens, leur avancement, juste pour améliorer le jeu s'il y a besoin, autour des bugs ».
--
-- À coller dans Supabase → SQL Editor → Run, après schema.sql. Le script se relance sans casse.
--
-- Les règles de schema.sql restent entières : un joueur ne lit que sa ligne. Le tableau de bord
-- ne contourne rien côté jeu (pas de clé service_role) : il appelle admin_stats(), une fonction
-- qui vérifie que l'appelant est dans public.admins, puis rend des chiffres. Elle ne rend ni
-- e-mail ni sauvegarde entière : un identifiant court par joueur et quelques compteurs tirés de
-- sa sauvegarde.
--
-- Pour devenir administrateur (une fois, ici même, avec SON e-mail de connexion au jeu) :
--   insert into public.admins (user_id) select id from auth.users where email = 'ton.e-mail@exemple.fr'
--   on conflict do nothing;

-- ── Les administrateurs ────────────────────────────────────────────────────────────────────────
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.admins enable row level security;
-- Personne ne la lit ni ne l'écrit depuis le jeu : seules les fonctions ci-dessous la consultent.
revoke all on public.admins from anon, authenticated;

-- ── Le journal des erreurs du jeu ──────────────────────────────────────────────────────────────
-- Une ligne par erreur distincte (même message, même première ligne de pile), avec son nombre
-- d'occurrences : pas une ligne par plantage. On ne garde que le message, la pile (tronquée), la
-- version du jeu et le dernier joueur connecté qui l'a vue (null sans compte) : ni adresse IP, ni
-- navigateur.
create table if not exists public.game_errors (
  sig        text primary key,
  message    text not null,
  stack      text,
  version    text,
  count      integer not null default 1,
  first_at   timestamptz not null default now(),
  last_at    timestamptz not null default now(),
  last_user  uuid references auth.users (id) on delete set null
);
alter table public.game_errors enable row level security;
revoke all on public.game_errors from anon, authenticated;

-- Le jeu signale une erreur (src/net/cloud.ts, reportError) : avec ou sans compte. Tailles bornées,
-- et une même erreur ne fait qu'incrémenter son compteur.
create or replace function public.report_error(p_message text, p_stack text, p_version text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m text := left(coalesce(p_message, '?'), 300);
  s text := left(coalesce(p_stack, ''), 1500);
  v text := left(coalesce(p_version, ''), 40);
  k text := md5(m || '|' || split_part(s, E'\n', 1) || '|' || split_part(s, E'\n', 2));
begin
  insert into public.game_errors as g (sig, message, stack, version, last_user)
  values (k, m, s, v, auth.uid())
  on conflict (sig) do update
    set count = g.count + 1, last_at = now(), version = excluded.version, last_user = coalesce(auth.uid(), g.last_user);
end $$;
revoke all on function public.report_error(text, text, text) from public;
grant execute on function public.report_error(text, text, text) to anon, authenticated;

-- ── Les statistiques, pour les administrateurs ─────────────────────────────────────────────────
create or replace function public.admin_stats() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  out jsonb;
begin
  if auth.uid() is null or not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'réservé aux administrateurs' using errcode = '42501';
  end if;
  with p as (
    select
      left(s.user_id::text, 8) as id,
      s.updated_at,
      s.rev,
      coalesce((s.data ->> 'started')::boolean, false) as started,
      coalesce((s.data ->> 'runs')::int, 0) as runs,
      coalesce((s.data ->> 'wins')::int, 0) as wins,
      coalesce((s.data ->> 'bestRoom')::int, 0) as best_room,
      coalesce((s.data ->> 'baies')::int, 0) as baies,
      coalesce((s.data ->> 'shards')::int, 0) as shards,
      case when jsonb_typeof(s.data -> 'beaten') = 'array' then jsonb_array_length(s.data -> 'beaten') else 0 end as beaten,
      case when jsonb_typeof(s.data -> 'built') = 'array' then jsonb_array_length(s.data -> 'built') else 0 end as built,
      case when jsonb_typeof(s.data -> 'seen') = 'array' then jsonb_array_length(s.data -> 'seen') else 0 end as seen,
      case when jsonb_typeof(s.data -> 'mons') = 'object' then (select count(*) from jsonb_object_keys(s.data -> 'mons'))::int else 0 end as mons,
      coalesce((s.data -> 'temple' ->> 'best')::int, 0) as temple
    from public.saves s
  )
  select jsonb_build_object(
    'at', now(),
    'players', coalesce((select jsonb_agg(to_jsonb(p) order by p.updated_at desc) from p), '[]'::jsonb),
    'errors', coalesce((select jsonb_agg(jsonb_build_object('message', g.message, 'stack', g.stack, 'version', g.version, 'count', g.count, 'first_at', g.first_at, 'last_at', g.last_at) order by g.last_at desc)
                        from (select * from public.game_errors order by last_at desc limit 50) g), '[]'::jsonb)
  ) into out;
  return out;
end $$;
revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;

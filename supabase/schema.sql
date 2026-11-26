-- Sauvegarde en ligne de Pokhades (src/net/cloud.ts, README « Compte et sauvegarde en ligne »).
--
-- À coller une fois dans Supabase → SQL Editor → Run. Le script se relance sans casse.
--
-- On garde le strict minimum (demande : « vraiment, on garde le moins de choses possible ») :
--   • l'e-mail, dans auth.users, géré par Supabase : c'est lui qui reçoit le code de connexion ;
--   • une ligne par joueur ici : sa sauvegarde (le même JSON que le localStorage), un numéro de
--     version et la date de la dernière écriture. Ni pseudo à part, ni appareil, ni adresse IP.
--
-- Sécurité : la clé « anon » du projet est publique (elle est dans le jeu). Ce qui protège les
-- données, ce sont les règles RLS ci-dessous : une requête ne voit et ne touche que la ligne dont
-- user_id est celui du jeton de connexion. Sans jeton, rien.

create table if not exists public.saves (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb not null,
  -- Numéro de version : chaque écriture fait +1, et le jeu n'écrit que s'il part de la dernière
  -- version qu'il a vue (PATCH … ?rev=eq.N). Deux appareils qui jouent en même temps ne
  -- s'écrasent donc jamais : le second voit le conflit et demande au joueur laquelle garder.
  rev        integer not null default 1 check (rev > 0),
  updated_at timestamptz not null default now(),
  -- Une sauvegarde fait quelques dizaines de Ko : 512 Ko suffit largement, et borne l'abus.
  constraint saves_data_size check (octet_length(data::text) <= 524288)
);

alter table public.saves enable row level security;

drop policy if exists "saves: lire la sienne" on public.saves;
drop policy if exists "saves: créer la sienne" on public.saves;
drop policy if exists "saves: modifier la sienne" on public.saves;
drop policy if exists "saves: supprimer la sienne" on public.saves;

create policy "saves: lire la sienne" on public.saves
  for select to authenticated using (user_id = auth.uid());
create policy "saves: créer la sienne" on public.saves
  for insert to authenticated with check (user_id = auth.uid());
create policy "saves: modifier la sienne" on public.saves
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "saves: supprimer la sienne" on public.saves
  for delete to authenticated using (user_id = auth.uid());

-- Les visiteurs sans compte (rôle anon) n'ont aucun droit sur la table, même pas de la voir.
revoke all on public.saves from anon;
grant select, insert, update, delete on public.saves to authenticated;

-- La date se pose côté serveur : le jeu ne peut pas l'inventer.
create or replace function public.saves_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists saves_touch on public.saves;
create trigger saves_touch before insert or update on public.saves
  for each row execute function public.saves_touch();

-- « Supprimer mon compte » (bouton du jeu) : efface l'e-mail et, par la cascade, la sauvegarde.
-- security definer : un joueur n'a pas le droit d'écrire dans auth.users ; cette fonction, si,
-- mais seulement pour la ligne de l'appelant (auth.uid()).
create or replace function public.delete_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'non connecté';
  end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;

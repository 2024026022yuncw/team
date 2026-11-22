-- =====================================================================
-- 009: 발표자(역할) 랜덤 뽑기 — 팀별, 결과는 서버에서 정하고 기록
-- 008 까지 실행한 뒤, SQL Editor 에 붙여넣고 실행하세요. (여러 번 실행해도 안전)
-- =====================================================================

create table if not exists public.team_draws (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 30),   -- 예: 발표자
  participants uuid[] not null,
  winners uuid[] not null,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists team_draws_team_idx on public.team_draws (team_id, created_at desc);

alter table public.team_draws enable row level security;
drop policy if exists "draws select" on public.team_draws;
create policy "draws select" on public.team_draws
  for select to authenticated using (public.is_team_member(team_id));
-- 기록 삭제: 뽑은 사람 또는 팀장 (추가는 아래 함수로만)
drop policy if exists "draws delete" on public.team_draws;
create policy "draws delete" on public.team_draws
  for delete to authenticated using (created_by = auth.uid() or public.is_team_owner(team_id));

-- 뽑기: 참가자 중 p_count 명을 서버에서 무작위로 고르고 기록
create or replace function public.run_team_draw(p_team_id uuid, p_title text, p_participants uuid[], p_count int)
returns public.team_draws
language plpgsql
security definer set search_path = public
as $$
declare
  v_people uuid[];
  v_winners uuid[];
  v_row public.team_draws;
begin
  if not public.is_team_member(p_team_id) then raise exception '팀 멤버만 뽑을 수 있어요'; end if;

  -- 실제 팀원만, 중복 제거
  select array_agg(distinct m.user_id) into v_people
  from public.team_members m
  where m.team_id = p_team_id and m.user_id = any(p_participants);

  if v_people is null or cardinality(v_people) = 0 then raise exception '참가자를 골라주세요'; end if;
  if p_count < 1 or p_count > cardinality(v_people) then
    raise exception '뽑을 인원은 1명 이상, 참가자 수 이하로 정해주세요';
  end if;

  select array_agg(u) into v_winners
  from (select unnest(v_people) as u order by random() limit p_count) s;

  insert into public.team_draws (team_id, title, participants, winners, created_by)
  values (p_team_id, coalesce(nullif(trim(p_title), ''), '발표자'), v_people, v_winners, auth.uid())
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.run_team_draw(uuid, text, uuid[], int) from public, anon;
grant execute on function public.run_team_draw(uuid, text, uuid[], int) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'team_draws'
  ) then
    alter publication supabase_realtime add table public.team_draws;
  end if;
end $$;

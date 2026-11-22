-- =====================================================================
-- 016: 게스트(익명 로그인) 지원
-- 015 까지 실행한 뒤, SQL Editor 에 붙여넣고 실행하세요. (여러 번 실행해도 안전)
-- + Supabase > Authentication > Sign In / Providers 에서 "Allow anonymous sign-ins" 를 켜야 함
--  게스트는 이메일이 없으므로 이름이 비면 '게스트' 로 프로필 생성
-- =====================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'display_name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      '게스트'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

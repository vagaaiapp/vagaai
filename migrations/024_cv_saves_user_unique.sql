-- Um usuário deve possuir somente um currículo principal.
-- Mantém o registro mais recente e remove duplicatas legadas antes de criar a restrição.
begin;

with ranked_cv_saves as (
  select
    id,
    row_number() over (
      partition by user_id
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as position
  from public.cv_saves
)
delete from public.cv_saves as cv
using ranked_cv_saves as ranked
where cv.id = ranked.id
  and ranked.position > 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cv_saves_user_id_key'
      and conrelid = 'public.cv_saves'::regclass
  ) then
    alter table public.cv_saves
      add constraint cv_saves_user_id_key unique (user_id);
  end if;
end
$$;

commit;

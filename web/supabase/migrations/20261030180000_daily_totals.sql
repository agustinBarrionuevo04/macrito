-- Totales por día del usuario de la sesión, para la pantalla de progreso.
-- security invoker: corre con los permisos de quien llama, así que la RLS de intake_entries decide qué
-- filas ve; el filtro por auth.uid() es explícito además. Devuelve una fila por día con registros
-- (como mucho una por día del rango), en lugar de traer todas las entradas al servidor de la app.

create function public.daily_totals(p_from date, p_to date)
returns table (
  day date,
  kcal numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  entries bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    e.logged_on as day,
    sum(e.kcal) as kcal,
    sum(e.protein_g) as protein_g,
    sum(e.carbs_g) as carbs_g,
    sum(e.fat_g) as fat_g,
    count(*) as entries
  from public.intake_entries e
  where e.user_id = auth.uid()
    and e.logged_on between p_from and p_to
  group by e.logged_on
  order by e.logged_on
$$;

revoke all on function public.daily_totals(date, date) from public, anon;
grant execute on function public.daily_totals(date, date) to authenticated, service_role;

-- 3-K: meta de agua propia y totales de fibra, azúcares y sodio del día.

-- Meta diaria de agua. `null` = la sugerida por la app (según el peso). La edita el usuario desde el perfil
-- (profiles ya permite actualizar sus propias columnas).
alter table public.profiles
  add column water_goal_ml int check (water_goal_ml between 500 and 10000);

-- Hora de cada toma, para poder deshacer la última (la tabla original no la guardaba).
alter table public.water_logs
  add column created_at timestamptz not null default now();

-- Fibra, azúcares y sodio del día del usuario, sumados desde el alimento de cada entrada
-- (cantidad / 100 × valor por 100 g). Las entradas no guardan estos tres valores (solo kcal y macros), así
-- que si se edita un alimento, el total de días pasados puede cambiar; y las entradas sin alimento (calorías
-- rápidas) o con alimentos que no informan estos datos no suman: `with_data` dice cuántas entradas tenían
-- al menos un dato, para que la pantalla muestre cuán completo es el número.
-- security invoker: la RLS decide qué filas ve y además filtra por auth.uid().
create function public.micro_totals(p_day date)
returns table (
  fiber_g numeric,
  sugar_g numeric,
  sodium_mg numeric,
  entries bigint,
  with_data bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(sum(e.quantity_g / 100 * f.fiber_100g), 0)::numeric as fiber_g,
    coalesce(sum(e.quantity_g / 100 * f.sugar_100g), 0)::numeric as sugar_g,
    coalesce(sum(e.quantity_g / 100 * f.sodium_mg_100g), 0)::numeric as sodium_mg,
    count(e.id) as entries,
    count(e.id) filter (
      where f.fiber_100g is not null or f.sugar_100g is not null or f.sodium_mg_100g is not null
    ) as with_data
  from public.intake_entries e
  left join public.foods f on f.id = e.food_id
  where e.user_id = auth.uid()
    and e.logged_on = p_day
$$;

revoke all on function public.micro_totals(date) from public, anon;
grant execute on function public.micro_totals(date) to authenticated, service_role;

-- Búsqueda de alimentos en el catálogo local (cache de OFF/USDA, ar_seed y alimentos propios).
-- security invoker: corre con los permisos del usuario, así que RLS decide qué filas ve.
-- Devuelve además si es favorito y cuándo lo usó por última vez, para ordenar en el servidor.

create extension if not exists unaccent with schema extensions;

create function public.search_foods(q text, max_results int default 40)
returns table (
  id uuid,
  source text,
  source_id text,
  barcode text,
  name text,
  brand text,
  kcal_100g numeric,
  protein_100g numeric,
  carbs_100g numeric,
  fat_100g numeric,
  fiber_100g numeric,
  sugar_100g numeric,
  sodium_mg_100g numeric,
  portions jsonb,
  created_by uuid,
  is_favorite boolean,
  last_used_on date,
  score real
)
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select
      extensions.unaccent(lower(btrim(q))) as nq,
      -- Escapa los comodines de LIKE para que "50%" o "a_b" se busquen literalmente.
      replace(replace(replace(extensions.unaccent(lower(btrim(q))), '\', '\\'), '%', '\%'), '_', '\_') as pat
  ),
  matches as (
    select f.*, extensions.unaccent(lower(f.name)) as nname
    from public.foods f, params p
    where length(p.nq) >= 2
      and (
        extensions.unaccent(lower(f.name)) like '%' || p.pat || '%'
        or extensions.similarity(extensions.unaccent(lower(f.name)), p.nq) > 0.3
      )
  )
  select
    m.id, m.source, m.source_id, m.barcode, m.name, m.brand,
    m.kcal_100g, m.protein_100g, m.carbs_100g, m.fat_100g,
    m.fiber_100g, m.sugar_100g, m.sodium_mg_100g, m.portions, m.created_by,
    exists (
      select 1 from public.favorite_foods ff
      where ff.food_id = m.id and ff.user_id = auth.uid()
    ) as is_favorite,
    (
      select max(e.logged_on) from public.intake_entries e
      where e.food_id = m.id and e.user_id = auth.uid()
    ) as last_used_on,
    greatest(
      extensions.similarity(m.nname, p.nq),
      case
        when m.nname like p.pat || '%' then 0.9
        when m.nname like '%' || p.pat || '%' then 0.6
        else 0
      end
    )::real as score
  from matches m, params p
  order by score desc, m.name
  limit least(greatest(max_results, 1), 100);
$$;

revoke execute on function public.search_foods(text, int) from public, anon;
grant execute on function public.search_foods(text, int) to authenticated, service_role;

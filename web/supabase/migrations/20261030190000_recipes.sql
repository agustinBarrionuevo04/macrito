-- Recetas y comidas frecuentes (3-J).
--
-- `kind = 'recipe'`: ingredientes + número de porciones; se materializa como un alimento propio
-- (`food_id`) con sus valores por 100 g y una porción "1 porción", así se busca, se elige y se registra
-- igual que cualquier alimento. `kind = 'combo'`: lista de alimentos que se agregan juntos al diario.
--
-- Cada ingrediente guarda un snapshot (nombre y valores por 100 g): editar o borrar el alimento original
-- no cambia la receta, igual que las entradas del diario no cambian al editar un alimento.

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null default 'recipe' check (kind in ('recipe', 'combo')),
  name text not null check (char_length(name) between 1 and 100),
  servings numeric not null default 1 check (servings > 0),
  -- Peso final cocido, si se conoce: cambia los valores por 100 g (cocinar pierde o gana agua).
  final_weight_g numeric check (final_weight_g > 0),
  food_id uuid references public.foods (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recipes_user_kind_idx on public.recipes (user_id, kind);

create table public.recipe_items (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  position int not null,
  food_id uuid references public.foods (id) on delete set null,
  name text not null check (char_length(name) between 1 and 200),
  grams numeric not null check (grams > 0),
  kcal_100g numeric not null check (kcal_100g >= 0),
  protein_100g numeric not null check (protein_100g >= 0),
  carbs_100g numeric not null check (carbs_100g >= 0),
  fat_100g numeric not null check (fat_100g >= 0)
);

create index recipe_items_recipe_idx on public.recipe_items (recipe_id, position);

alter table public.recipes enable row level security;
alter table public.recipe_items enable row level security;

revoke all on public.recipes, public.recipe_items from anon, authenticated;
grant all on public.recipes, public.recipe_items to service_role;
grant select, insert, update, delete on public.recipes, public.recipe_items to authenticated;

create policy recipes_own on public.recipes
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy recipe_items_own on public.recipe_items
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Guarda una receta o combo completo en un solo paso (atómico): la receta, sus ingredientes y, si es una
-- receta, el alimento que la representa. Los valores por 100 g los calcula la aplicación (y los prueba);
-- acá solo se persisten. security invoker: la RLS decide qué se puede tocar.
--   p_recipe: { kind, name, servings, final_weight_g }
--   p_items:  [{ food_id, name, grams, kcal_100g, protein_100g, carbs_100g, fat_100g }]
--   p_food:   { name, kcal_100g, protein_100g, carbs_100g, fat_100g, portions } o null (combos)
create function public.save_recipe(p_id uuid, p_recipe jsonb, p_items jsonb, p_food jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_food uuid;
begin
  if v_user is null then
    raise exception 'sin sesión' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'la receta necesita al menos un ingrediente' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.recipes (user_id, kind, name, servings, final_weight_g)
    values (
      v_user,
      p_recipe ->> 'kind',
      p_recipe ->> 'name',
      (p_recipe ->> 'servings')::numeric,
      nullif(p_recipe ->> 'final_weight_g', '')::numeric
    )
    returning id into v_id;
  else
    select r.food_id into v_food
    from public.recipes r
    where r.id = p_id and r.user_id = v_user
    for update;
    if not found then
      raise exception 'receta inexistente' using errcode = 'P0002';
    end if;
    v_id := p_id;
    update public.recipes
    set kind = p_recipe ->> 'kind',
        name = p_recipe ->> 'name',
        servings = (p_recipe ->> 'servings')::numeric,
        final_weight_g = nullif(p_recipe ->> 'final_weight_g', '')::numeric,
        updated_at = now()
    where id = v_id;
    delete from public.recipe_items where recipe_id = v_id;
  end if;

  if p_food is not null then
    if v_food is null then
      insert into public.foods (source, name, kcal_100g, protein_100g, carbs_100g, fat_100g, portions, created_by)
      values (
        'custom',
        p_food ->> 'name',
        (p_food ->> 'kcal_100g')::numeric,
        (p_food ->> 'protein_100g')::numeric,
        (p_food ->> 'carbs_100g')::numeric,
        (p_food ->> 'fat_100g')::numeric,
        coalesce(p_food -> 'portions', '[]'::jsonb),
        v_user
      )
      returning id into v_food;
      update public.recipes set food_id = v_food where id = v_id;
    else
      update public.foods
      set name = p_food ->> 'name',
          kcal_100g = (p_food ->> 'kcal_100g')::numeric,
          protein_100g = (p_food ->> 'protein_100g')::numeric,
          carbs_100g = (p_food ->> 'carbs_100g')::numeric,
          fat_100g = (p_food ->> 'fat_100g')::numeric,
          portions = coalesce(p_food -> 'portions', '[]'::jsonb)
      where id = v_food and created_by = v_user;
    end if;
  end if;

  insert into public.recipe_items
    (recipe_id, user_id, position, food_id, name, grams, kcal_100g, protein_100g, carbs_100g, fat_100g)
  select
    v_id,
    v_user,
    (t.ord - 1)::int,
    nullif(t.item ->> 'food_id', '')::uuid,
    t.item ->> 'name',
    (t.item ->> 'grams')::numeric,
    (t.item ->> 'kcal_100g')::numeric,
    (t.item ->> 'protein_100g')::numeric,
    (t.item ->> 'carbs_100g')::numeric,
    (t.item ->> 'fat_100g')::numeric
  from jsonb_array_elements(p_items) with ordinality as t (item, ord);

  return v_id;
end;
$$;

-- Borra una receta o combo y el alimento que la representaba (las entradas del diario no cambian:
-- guardan su propio snapshot y solo pierden el vínculo con el alimento).
create function public.delete_recipe(p_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_food uuid;
begin
  if v_user is null then
    raise exception 'sin sesión' using errcode = '42501';
  end if;
  select r.food_id into v_food
  from public.recipes r
  where r.id = p_id and r.user_id = v_user;
  if not found then
    return false;
  end if;
  delete from public.recipes where id = p_id and user_id = v_user;
  if v_food is not null then
    delete from public.foods where id = v_food and created_by = v_user;
  end if;
  return true;
end;
$$;

revoke all on function public.save_recipe(uuid, jsonb, jsonb, jsonb) from public, anon;
revoke all on function public.delete_recipe(uuid) from public, anon;
grant execute on function public.save_recipe(uuid, jsonb, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.delete_recipe(uuid) to authenticated, service_role;

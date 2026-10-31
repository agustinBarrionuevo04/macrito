-- Recetas y combos: guardado atómico, alimento materializado, aislamiento entre usuarios y borrado.

begin;

create extension if not exists pgtap with schema extensions;

select plan(25);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@test.local'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@test.local');

create function public.test_rows_affected(stmt text) returns bigint
language plpgsql
as $fn$
declare
  n bigint;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end;
$fn$;

-- ---------------------------------------------------------------- como A
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

insert into ids
select 'receta', public.save_recipe(
  null,
  '{"kind":"recipe","name":"Tarta de verdura","servings":4,"final_weight_g":null}'::jsonb,
  '[{"food_id":null,"name":"Harina","grams":200,"kcal_100g":364,"protein_100g":10,"carbs_100g":76,"fat_100g":1},
    {"food_id":null,"name":"Huevo","grams":100,"kcal_100g":143,"protein_100g":13,"carbs_100g":1,"fat_100g":10}]'::jsonb,
  '{"name":"Tarta de verdura","kcal_100g":290,"protein_100g":11,"carbs_100g":51,"fat_100g":4,"portions":[{"label":"1 porción","grams":75}]}'::jsonb
);

select is((select count(*) from public.recipes), 1::bigint, 'crea la receta');
select is((select count(*) from public.recipe_items), 2::bigint, 'crea sus ingredientes');
select is((select string_agg(name, ',' order by position) from public.recipe_items), 'Harina,Huevo', 'conserva el orden de los ingredientes');
select isnt((select food_id from public.recipes), null, 'la receta queda vinculada a un alimento');
select is(
  (select f.source || '/' || f.created_by::text from public.foods f join public.recipes r on r.food_id = f.id),
  'custom/aaaaaaaa-0000-0000-0000-000000000001',
  'el alimento es "custom" y del usuario');
select is((select (portions -> 0 ->> 'grams') from public.foods f join public.recipes r on r.food_id = f.id), '75', 'tiene la porción "1 porción"');

-- Editar: reemplaza los ingredientes y actualiza el MISMO alimento (no crea otro).
select public.save_recipe(
  (select id from ids where name = 'receta'),
  '{"kind":"recipe","name":"Tarta grande","servings":6,"final_weight_g":900}'::jsonb,
  '[{"food_id":null,"name":"Harina","grams":300,"kcal_100g":364,"protein_100g":10,"carbs_100g":76,"fat_100g":1}]'::jsonb,
  '{"name":"Tarta grande","kcal_100g":120,"protein_100g":3,"carbs_100g":25,"fat_100g":0.5,"portions":[{"label":"1 porción","grams":150}]}'::jsonb
);
select is((select count(*) from public.recipes), 1::bigint, 'editar no duplica la receta');
select is((select count(*) from public.recipe_items), 1::bigint, 'editar reemplaza los ingredientes');
select is((select count(*) from public.foods where source = 'custom'), 1::bigint, 'editar no duplica el alimento');
select is((select f.name from public.foods f join public.recipes r on r.food_id = f.id), 'Tarta grande', 'el alimento sigue a la receta');
select is((select kcal_100g from public.foods f join public.recipes r on r.food_id = f.id), 120::numeric, 'y sus valores por 100 g');
select is((select final_weight_g from public.recipes), 900::numeric, 'guarda el peso final');

-- Combo: sin alimento.
insert into ids
select 'combo', public.save_recipe(
  null,
  '{"kind":"combo","name":"Desayuno de siempre","servings":1,"final_weight_g":null}'::jsonb,
  '[{"food_id":null,"name":"Café con leche","grams":250,"kcal_100g":30,"protein_100g":2,"carbs_100g":3,"fat_100g":1}]'::jsonb,
  null
);
select is((select food_id from public.recipes where kind = 'combo'), null, 'un combo no crea alimento');

-- Validaciones (lo que la base no deja pasar).
select throws_ok(
  $$select public.save_recipe(null, '{"kind":"recipe","name":"Vacía","servings":1}'::jsonb, '[]'::jsonb, null)$$,
  '22023', null, 'una receta sin ingredientes se rechaza');
select throws_ok(
  $$select public.save_recipe(null, '{"kind":"recipe","name":"x","servings":0}'::jsonb,
    '[{"name":"a","grams":1,"kcal_100g":1,"protein_100g":0,"carbs_100g":0,"fat_100g":0}]'::jsonb, null)$$,
  '23514', null, '0 porciones se rechaza');
select throws_ok(
  $$select public.save_recipe(null, '{"kind":"otro","name":"x","servings":1}'::jsonb,
    '[{"name":"a","grams":1,"kcal_100g":1,"protein_100g":0,"carbs_100g":0,"fat_100g":0}]'::jsonb, null)$$,
  '23514', null, 'un tipo desconocido se rechaza');
select is((select count(*) from public.recipes), 2::bigint, 'los rechazos no dejan filas a medias');

-- ---------------------------------------------------------------- como B
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);

select is((select count(*) from public.recipes), 0::bigint, 'B no ve las recetas de A');
select is((select count(*) from public.recipe_items), 0::bigint, 'ni sus ingredientes');
select throws_ok(
  $$select public.save_recipe((select id from ids where name = 'receta'), '{"kind":"recipe","name":"Robada","servings":1}'::jsonb,
    '[{"name":"a","grams":1,"kcal_100g":1,"protein_100g":0,"carbs_100g":0,"fat_100g":0}]'::jsonb, null)$$,
  'P0002', null, 'B no puede editar la receta de A');
select is((select public.delete_recipe((select id from ids where name = 'receta'))), false, 'B no puede borrar la receta de A');

-- ---------------------------------------------------------------- como A: borrar
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select public.delete_recipe((select id from ids where name = 'receta'))), true, 'A borra su receta');
select is((select count(*) from public.recipe_items), 1::bigint, 'se borran los ingredientes de esa receta (queda el del combo)');
select is((select count(*) from public.foods where source = 'custom'), 0::bigint, 'se borra el alimento que la representaba');

-- ---------------------------------------------------------------- anónimo
set local role anon;
select throws_ok($$select public.delete_recipe(gen_random_uuid())$$, '42501', null, 'un anónimo no puede usar las funciones');

select * from finish();
rollback;

-- micro_totals y meta de agua: suma desde el alimento, informa cuán completo es el dato y respeta la RLS.

begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@test.local'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@test.local');

insert into public.foods (id, source, source_id, name, kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, sugar_100g, sodium_mg_100g, created_by) values
  ('f0000000-0000-0000-0000-000000000001', 'ar_seed', 'avena', 'Avena', 380, 13, 60, 7, 10, 1, 5, null),
  ('f0000000-0000-0000-0000-000000000002', 'ar_seed', 'galletitas', 'Galletitas', 450, 8, 70, 15, null, 20, 600, null),
  ('f0000000-0000-0000-0000-000000000003', 'ar_seed', 'agua', 'Agua saborizada', 20, 0, 5, 0, null, null, null, null);

insert into public.intake_entries (user_id, logged_on, meal_type, food_id, name, quantity_g, kcal, protein_g, carbs_g, fat_g, origin) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '2026-03-10', 'breakfast', 'f0000000-0000-0000-0000-000000000001', 'Avena', 50, 190, 6.5, 30, 3.5, 'search'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '2026-03-10', 'snack', 'f0000000-0000-0000-0000-000000000002', 'Galletitas', 30, 135, 2.4, 21, 4.5, 'search'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '2026-03-10', 'lunch', 'f0000000-0000-0000-0000-000000000003', 'Agua saborizada', 500, 100, 0, 25, 0, 'search'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '2026-03-10', 'dinner', null, 'Calorías rápidas', 0, 300, 0, 0, 0, 'manual'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '2026-03-11', 'lunch', 'f0000000-0000-0000-0000-000000000001', 'Avena', 100, 380, 13, 60, 7, 'search'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '2026-03-10', 'lunch', 'f0000000-0000-0000-0000-000000000001', 'Avena', 1000, 3800, 130, 600, 70, 'search');

insert into public.water_logs (user_id, logged_on, ml)
  values ('bbbbbbbb-0000-0000-0000-000000000002', '2026-03-10', 999);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is((select fiber_g from public.micro_totals('2026-03-10')), 5::numeric, 'fibra: 50 g de avena × 10/100 (los alimentos sin dato no suman)');
select is((select sugar_g from public.micro_totals('2026-03-10')), 6.5::numeric, 'azúcares: 0,5 + 6 (30 g de galletitas × 20/100)');
select is((select sodium_mg from public.micro_totals('2026-03-10')), 182.5::numeric, 'sodio: 2,5 + 180');
select is((select entries from public.micro_totals('2026-03-10')), 4::bigint, 'cuenta todas las entradas del día');
select is((select with_data from public.micro_totals('2026-03-10')), 2::bigint, 'solo 2 tienen algún dato (no el agua saborizada ni las calorías rápidas)');
select is((select fiber_g from public.micro_totals('2026-03-11')), 10::numeric, 'otro día, otra suma');
select is((select entries from public.micro_totals('2026-03-12')), 0::bigint, 'un día sin registros da 0 entradas');
select is((select count(*) from public.micro_totals('2026-03-12')), 1::bigint, 'y siempre una fila (nunca vacío)');
select is((select fiber_g from public.micro_totals('2026-03-10')), 5::numeric, 'no suma los 100 g de fibra del otro usuario');

-- Meta de agua
update public.profiles set water_goal_ml = 2500 where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
select is((select water_goal_ml from public.profiles where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 2500, 'el usuario guarda su meta de agua');
select throws_ok(
  $$update public.profiles set water_goal_ml = 100 where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  '23514', null, 'una meta fuera de rango se rechaza (500–10.000 ml)');
select is((select water_goal_ml from public.profiles where user_id = 'bbbbbbbb-0000-0000-0000-000000000002'), null, 'la meta de B sigue sin definir');

-- Tomas de agua: cada una guarda su hora y solo se ven las propias
insert into public.water_logs (user_id, logged_on, ml)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '2026-03-10', 250);
select isnt((select created_at from public.water_logs where ml = 250), null, 'cada toma de agua guarda su hora');
select is((select count(*) from public.water_logs), 1::bigint, 'y A solo ve las propias');

set local role anon;
select throws_ok($$select * from public.micro_totals('2026-03-10')$$, '42501', null, 'un anónimo no puede llamarla');

select * from finish();
rollback;

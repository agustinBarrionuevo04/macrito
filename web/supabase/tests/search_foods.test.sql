-- search_foods: respeta RLS, ignora acentos y mayúsculas, escapa comodines y marca favoritos/recientes.

begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@test.local'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@test.local');

insert into public.foods (id, source, source_id, name, kcal_100g, protein_100g, carbs_100g, fat_100g, created_by) values
  ('f0000000-0000-0000-0000-000000000001', 'ar_seed', 'milanesa-carne', 'Milanesa de carne', 250, 20, 15, 12, null),
  ('f0000000-0000-0000-0000-000000000002', 'off', '7790070410105', 'Leche entera La Serenísima', 62, 3, 4.7, 3.3, null),
  ('f0000000-0000-0000-0000-000000000003', 'custom', null, 'Milanesa casera de A', 230, 18, 14, 11, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000004', 'off', '1', 'Yogur 100% natural', 60, 4, 5, 3, null),
  ('f0000000-0000-0000-0000-000000000005', 'off', '2', 'Café molido', 2, 0.1, 0, 0, null);

insert into public.favorite_foods (user_id, food_id)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001');

insert into public.intake_entries (user_id, logged_on, meal_type, food_id, name, quantity_g, kcal, protein_g, carbs_g, fat_g, origin)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '2026-01-05', 'lunch', 'f0000000-0000-0000-0000-000000000001', 'Milanesa', 100, 250, 20, 15, 12, 'search'),
         ('aaaaaaaa-0000-0000-0000-000000000001', '2026-01-09', 'dinner', 'f0000000-0000-0000-0000-000000000001', 'Milanesa', 100, 250, 20, 15, 12, 'search');

-- ---------------------------------------------------------------- como A
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is((select count(*) from public.search_foods('milanesa')), 2::bigint, 'A ve la milanesa del catálogo y la propia');
select is((select is_favorite from public.search_foods('milanesa') where id = 'f0000000-0000-0000-0000-000000000001'), true, 'marca el favorito');
select is((select is_favorite from public.search_foods('milanesa') where id = 'f0000000-0000-0000-0000-000000000003'), false, 'no marca lo que no es favorito');
select is((select last_used_on from public.search_foods('milanesa') where id = 'f0000000-0000-0000-0000-000000000001'), '2026-01-09'::date, 'devuelve la última vez que lo usó');
select is((select last_used_on from public.search_foods('milanesa') where id = 'f0000000-0000-0000-0000-000000000003'), null, 'last_used_on es null si nunca lo usó');
select is((select id from public.search_foods('milanesa de carne') limit 1), 'f0000000-0000-0000-0000-000000000001'::uuid, 'ordena por relevancia: el nombre más parecido primero');

-- Acentos y mayúsculas
select is((select count(*) from public.search_foods('LECHE SERENISIMA')), 1::bigint, 'ignora mayúsculas y acentos (consulta sin acento)');
select is((select count(*) from public.search_foods('serenísima')), 1::bigint, 'ignora acentos (consulta con acento)');
select is((select count(*) from public.search_foods('cafe')), 1::bigint, '"cafe" encuentra "Café"');

-- Comodines literales y consultas cortas
select is((select count(*) from public.search_foods('%')), 0::bigint, 'una consulta de un carácter no devuelve nada');
select is((select count(*) from public.search_foods('100%')), 1::bigint, 'el % se busca literalmente');
select is((select count(*) from public.search_foods('milanesa', 1)), 1::bigint, 'respeta max_results');

-- ---------------------------------------------------------------- como B
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.search_foods('milanesa')), 1::bigint, 'B no ve el alimento propio de A');

-- ---------------------------------------------------------------- anon
reset role;
set local role anon;
select throws_ok($$select * from public.search_foods('leche')$$, '42501', null, 'anon no puede ejecutar search_foods');

select * from finish();

rollback;

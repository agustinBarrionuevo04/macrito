-- daily_totals: suma por día solo lo propio, respeta el rango y no lo puede llamar un anónimo.

begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@test.local'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@test.local');

insert into public.intake_entries (user_id, logged_on, meal_type, name, quantity_g, kcal, protein_g, carbs_g, fat_g, origin) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '2026-03-10', 'lunch',     'a1', 100, 500.25, 30, 40.5, 10, 'search'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '2026-03-10', 'dinner',    'a2', 100, 300.50, 10, 20.5,  5, 'search'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '2026-03-12', 'breakfast', 'a3', 100, 200,     5, 30,    2, 'manual'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '2026-03-20', 'lunch',     'a4', 100, 999,     9,  9,    9, 'search'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '2026-03-10', 'lunch',     'b1', 100, 7777,    1,  1,    1, 'search');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is((select count(*) from public.daily_totals('2026-03-01', '2026-03-31')), 3::bigint, 'una fila por día con registros');
select is((select kcal from public.daily_totals('2026-03-01', '2026-03-31') where day = '2026-03-10'), 800.75::numeric, 'suma las kcal del día sin ruido de punto flotante');
select is((select protein_g from public.daily_totals('2026-03-01', '2026-03-31') where day = '2026-03-10'), 40::numeric, 'suma proteínas');
select is((select carbs_g from public.daily_totals('2026-03-01', '2026-03-31') where day = '2026-03-10'), 61::numeric, 'suma carbohidratos');
select is((select entries from public.daily_totals('2026-03-01', '2026-03-31') where day = '2026-03-10'), 2::bigint, 'cuenta las entradas');
select is((select count(*) from public.daily_totals('2026-03-11', '2026-03-13')), 1::bigint, 'respeta el rango (incluye los dos bordes)');
select is((select count(*) from public.daily_totals('2026-03-10', '2026-03-10')), 1::bigint, 'un rango de un solo día');
select is((select max(kcal) from public.daily_totals('2026-03-01', '2026-03-31')), 999::numeric, 'no mezcla datos de otros usuarios (7777 es de B)');
select is((select count(*) from public.daily_totals('2026-04-01', '2026-04-30')), 0::bigint, 'sin registros devuelve vacío');

set local role anon;
select throws_ok(
  $$select * from public.daily_totals('2026-03-01', '2026-03-31')$$,
  '42501', null, 'un anónimo no puede llamarla');

select * from finish();
rollback;

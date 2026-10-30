-- Aislamiento multiusuario: el usuario B no puede leer, insertar ni modificar filas del usuario A.
-- Corre con `supabase test db` (CI) o con supabase/local/run-tests.sh (Postgres sin Docker).

begin;

create extension if not exists pgtap with schema extensions;

select plan(42);

-- Cuenta las filas que afecta un UPDATE/DELETE ejecutado con el rol actual (respeta RLS).
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


-- Dos usuarios. El trigger de auth.users les crea su fila vacía en profiles.
-- A = aaaaaaaa-0000-0000-0000-000000000001, B = bbbbbbbb-0000-0000-0000-000000000002
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@test.local'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@test.local');

select is(
  (select count(*) from public.profiles
    where user_id in ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002')),
  2::bigint,
  'el trigger crea un perfil vacío por usuario'
);

-- Datos del usuario A y un alimento del catálogo compartido.
update public.profiles set display_name = 'Ana'
  where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';

insert into public.weight_logs (user_id, logged_on, weight_kg)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '2026-01-01', 60);

insert into public.foods (id, source, name, kcal_100g, protein_100g, carbs_100g, fat_100g, created_by) values
  ('f0000000-0000-0000-0000-00000000000a', 'custom', 'Receta de A', 100, 1, 1, 1, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-0000000000c1', 'ar_seed', 'Milanesa', 250, 20, 15, 12, null);

insert into public.intake_entries
  (user_id, logged_on, meal_type, food_id, name, quantity_g, kcal, protein_g, carbs_g, fat_g, origin)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '2026-01-01', 'lunch',
          'f0000000-0000-0000-0000-0000000000c1', 'Milanesa', 100, 250, 20, 15, 12, 'search');

insert into public.water_logs (user_id, logged_on, ml)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '2026-01-01', 250);

insert into public.favorite_foods (user_id, food_id)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-0000000000c1');

insert into public.ai_usage (user_id, day, kind, count)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '2026-01-01', 'photo', 3);

insert into public.allowed_emails (email) values ('permitido@test.local');

-- ---------------------------------------------------------------- como B
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);

-- Lectura
select is((select count(*) from public.profiles where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0::bigint, 'B no lee el perfil de A');
select is((select count(*) from public.weight_logs where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0::bigint, 'B no lee weight_logs de A');
select is((select count(*) from public.intake_entries where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0::bigint, 'B no lee intake_entries de A');
select is((select count(*) from public.water_logs where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0::bigint, 'B no lee water_logs de A');
select is((select count(*) from public.favorite_foods where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0::bigint, 'B no lee favorite_foods de A');
select is((select count(*) from public.ai_usage where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0::bigint, 'B no lee ai_usage de A');
select is((select count(*) from public.foods where id = 'f0000000-0000-0000-0000-00000000000a'), 0::bigint, 'B no ve el alimento propio de A');
select is((select count(*) from public.foods where id = 'f0000000-0000-0000-0000-0000000000c1'), 1::bigint, 'B ve el catálogo compartido');

-- Modificación y borrado: 0 filas afectadas
select is(public.test_rows_affected($$update public.profiles set display_name = 'hack' where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$), 0::bigint, 'B no actualiza el perfil de A');
select is(public.test_rows_affected($$delete from public.weight_logs where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$), 0::bigint, 'B no borra weight_logs de A');
select is(public.test_rows_affected($$update public.intake_entries set kcal = 0 where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$), 0::bigint, 'B no actualiza intake_entries de A');
select is(public.test_rows_affected($$delete from public.water_logs where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$), 0::bigint, 'B no borra water_logs de A');
select is(public.test_rows_affected($$delete from public.favorite_foods where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$), 0::bigint, 'B no borra favorite_foods de A');

-- Inserción a nombre de A
select throws_ok($$insert into public.weight_logs (user_id, logged_on, weight_kg) values ('aaaaaaaa-0000-0000-0000-000000000001', '2026-01-02', 50)$$, '42501', null, 'B no inserta weight_logs como A');
select throws_ok($$insert into public.intake_entries (user_id, logged_on, meal_type, name, quantity_g, kcal, protein_g, carbs_g, fat_g, origin) values ('aaaaaaaa-0000-0000-0000-000000000001', '2026-01-02', 'lunch', 'x', 1, 1, 1, 1, 1, 'manual')$$, '42501', null, 'B no inserta intake_entries como A');
select throws_ok($$insert into public.water_logs (user_id, logged_on, ml) values ('aaaaaaaa-0000-0000-0000-000000000001', '2026-01-02', 100)$$, '42501', null, 'B no inserta water_logs como A');
select throws_ok($$insert into public.favorite_foods (user_id, food_id) values ('aaaaaaaa-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-00000000000a')$$, '42501', null, 'B no inserta favorite_foods como A');

-- B inserta una fila propia y no puede reasignarla a A
insert into public.intake_entries (user_id, logged_on, meal_type, name, quantity_g, kcal, protein_g, carbs_g, fat_g, origin)
  values ('bbbbbbbb-0000-0000-0000-000000000002', '2026-01-02', 'dinner', 'Pizza', 100, 270, 11, 33, 10, 'manual');
select throws_ok($$update public.intake_entries set user_id = 'aaaaaaaa-0000-0000-0000-000000000001' where user_id = 'bbbbbbbb-0000-0000-0000-000000000002'$$, '42501', null, 'B no reasigna sus filas a A');

-- foods
select throws_ok($$insert into public.foods (source, name, kcal_100g, protein_100g, carbs_100g, fat_100g, created_by) values ('custom', 'x', 1, 1, 1, 1, 'aaaaaaaa-0000-0000-0000-000000000001')$$, '42501', null, 'B no crea alimentos a nombre de A');
select throws_ok($$insert into public.foods (source, name, kcal_100g, protein_100g, carbs_100g, fat_100g, created_by) values ('custom', 'x', 1, 1, 1, 1, null)$$, '42501', null, 'B no escribe en el catálogo compartido');
select throws_ok($$insert into public.foods (source, source_id, name, kcal_100g, protein_100g, carbs_100g, fat_100g, created_by) values ('off', '123', 'x', 1, 1, 1, 1, 'bbbbbbbb-0000-0000-0000-000000000002')$$, '42501', null, 'B no reserva ids del catálogo (source off)');
select lives_ok($$insert into public.foods (source, name, kcal_100g, protein_100g, carbs_100g, fat_100g, created_by) values ('custom', 'Mi alimento', 1, 1, 1, 1, 'bbbbbbbb-0000-0000-0000-000000000002')$$, 'B crea su alimento propio');
select is(public.test_rows_affected($$update public.foods set name = 'hack' where id = 'f0000000-0000-0000-0000-00000000000a'$$), 0::bigint, 'B no edita el alimento de A');
select is(public.test_rows_affected($$delete from public.foods where id = 'f0000000-0000-0000-0000-0000000000c1'$$), 0::bigint, 'B no borra el catálogo compartido');

-- ai_usage: el cliente no escribe (el límite diario lo aplica el servidor)
select throws_ok($$insert into public.ai_usage (user_id, day, kind, count) values ('bbbbbbbb-0000-0000-0000-000000000002', '2026-01-02', 'photo', 0)$$, '42501', null, 'B no escribe su propio ai_usage');
select throws_ok($$update public.ai_usage set count = 0$$, '42501', null, 'B no actualiza ai_usage');

-- allowlist invisible para usuarios
select throws_ok($$select * from public.allowed_emails$$, '42501', null, 'authenticated no lee allowed_emails');

-- ---------------------------------------------------------------- como anon
reset role;
set local role anon;
select throws_ok($$select * from public.profiles$$, '42501', null, 'anon no lee profiles');
select throws_ok($$select * from public.foods$$, '42501', null, 'anon no lee foods');

-- ---------------------------------------------------------------- datos de A intactos
reset role;
select is((select display_name from public.profiles where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'Ana', 'el perfil de A sigue intacto');
select is((select count(*) from public.weight_logs where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 1::bigint, 'weight_logs de A sigue intacto');

-- ---------------------------------------------------------------- como A
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*) from public.profiles), 1::bigint, 'A ve solo su perfil');
select is((select count(*) from public.intake_entries), 1::bigint, 'A ve solo su diario');
select lives_ok($$update public.profiles set display_name = 'Ana M.' where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'A edita su perfil');
select is((select count(*) from public.ai_usage), 1::bigint, 'A lee su ai_usage');

-- ---------------------------------------------------------------- hook de allowlist
reset role;
select is(public.hook_before_user_created('{"user":{"email":"permitido@test.local"}}'::jsonb), '{}'::jsonb, 'el hook acepta un email permitido');
select is(public.hook_before_user_created('{"user":{"email":"Permitido@Test.Local"}}'::jsonb), '{}'::jsonb, 'el hook ignora mayúsculas');
select is(public.hook_before_user_created('{"user":{"email":"intruso@test.local"}}'::jsonb) -> 'error' ->> 'http_code', '403', 'el hook rechaza un email no permitido');
select is(public.hook_before_user_created('{"user":{}}'::jsonb) -> 'error' ->> 'http_code', '403', 'el hook rechaza un alta sin email');
select is(has_function_privilege('authenticated', 'public.hook_before_user_created(jsonb)', 'execute'), false, 'authenticated no ejecuta el hook');
select is(has_function_privilege('supabase_auth_admin', 'public.hook_before_user_created(jsonb)', 'execute'), true, 'supabase_auth_admin ejecuta el hook');

select * from finish();

rollback;

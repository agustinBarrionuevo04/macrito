-- Las operaciones exactas que hacen las acciones de 2-E (completar onboarding, editar perfil y
-- registrar peso), ejecutadas como usuario autenticado y con las policies de RLS reales.

begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

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


insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@test.local'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@test.local');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- El usuario recién creado tiene el perfil vacío y sin onboarding.
select is((select onboarding_completed_at from public.profiles where user_id = auth.uid()), null, 'el perfil nuevo no tiene onboarding completado');
select is((select kcal_adjustment from public.profiles where user_id = auth.uid()), 0, 'y el ajuste manual arranca en 0');

-- 1) completeOnboarding: primero el peso (upsert por día), después el perfil.
select lives_ok($$
  insert into public.weight_logs (user_id, logged_on, weight_kg)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '2026-03-15', 80)
  on conflict (user_id, logged_on) do update set weight_kg = excluded.weight_kg
$$, 'el usuario registra su primer peso con upsert');

select is(public.test_rows_affected($stmt$
    update public.profiles set
      display_name = 'Ana', sex = 'female', birth_date = '1996-03-15', height_cm = 165, weight_kg = 80,
      target_weight_kg = 58, activity_level = 'low_active', goal = 'lose', weekly_goal_kg = -0.25,
      macro_split = '{"carbs":0.5,"fat":0.3,"protein":0.2}'::jsonb, protein_g_per_kg = null,
      onboarding_completed_at = '2026-03-15T12:00:00Z'
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  $stmt$), 1::bigint, 'completa el perfil y la fila vuelve (el .select() del update funciona con RLS)');

select is((select weekly_goal_kg from public.profiles where user_id = auth.uid()), -0.25, 'el ritmo semanal negativo se guarda');
select is((select macro_split ->> 'protein' from public.profiles where user_id = auth.uid()), '0.2', 'el reparto de macros se guarda como jsonb');

-- 2) logWeight: mismo día dos veces = un solo registro; el perfil toma el más reciente.
select lives_ok($$
  insert into public.weight_logs (user_id, logged_on, weight_kg)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '2026-03-15', 79.5)
  on conflict (user_id, logged_on) do update set weight_kg = excluded.weight_kg
$$, 'registrar el peso del mismo día lo reemplaza');
select is((select count(*) from public.weight_logs where user_id = auth.uid()), 1::bigint, 'queda un solo registro por día');
select is((select weight_kg from public.weight_logs where user_id = auth.uid()), 79.5, 'con el valor nuevo');

insert into public.weight_logs (user_id, logged_on, weight_kg)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '2026-03-16', 79.1);
select is((select weight_kg from public.weight_logs where user_id = auth.uid() order by logged_on desc limit 1), 79.1, 'el último registro por fecha es el más reciente');

-- 3) Lo que el usuario NO puede hacer.
select throws_ok($$
  insert into public.weight_logs (user_id, logged_on, weight_kg) values ('bbbbbbbb-0000-0000-0000-000000000002', '2026-03-15', 70)
$$, '42501', null, 'no registra pesos en nombre de otro usuario');

select is(public.test_rows_affected($stmt$
    update public.profiles set goal = 'gain' where user_id = 'bbbbbbbb-0000-0000-0000-000000000002'
  $stmt$), 0::bigint, 'no edita el perfil de otro usuario');

select throws_ok($$
  update public.profiles set activity_level = 'extremo' where user_id = auth.uid()
$$, '23514', null, 'la base rechaza un nivel de actividad inexistente');

select throws_ok($$
  update public.profiles set weight_kg = -5 where user_id = auth.uid()
$$, '23514', null, 'y un peso no positivo');

select throws_ok($$
  insert into public.weight_logs (user_id, logged_on, weight_kg) values (auth.uid(), '2026-03-17', 0)
$$, '23514', null, 'y un registro de peso en cero');

-- El cliente no puede moverse a otro user_id ni borrar su propio perfil.
select throws_ok($$
  update public.profiles set user_id = 'bbbbbbbb-0000-0000-0000-000000000002' where user_id = auth.uid()
$$, '42501', null, 'no reasigna su perfil a otro usuario');

select throws_ok($$
  delete from public.profiles where user_id = auth.uid()
$$, '42501', null, 'no borra su propio perfil');

select * from finish();

rollback;

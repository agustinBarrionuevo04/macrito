-- ai_usage: el límite diario es atómico, por usuario y por tipo, y solo lo maneja el servidor.

begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@test.local'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@test.local');

-- ---------------------------------------------------------------- como el servidor
set local role service_role;

select is(public.reserve_ai_usage('aaaaaaaa-0000-0000-0000-000000000001', '2026-03-15', 'photo', 2), true, 'primer uso: hay cupo');
select is(public.reserve_ai_usage('aaaaaaaa-0000-0000-0000-000000000001', '2026-03-15', 'photo', 2), true, 'segundo uso: hay cupo');
select is(public.reserve_ai_usage('aaaaaaaa-0000-0000-0000-000000000001', '2026-03-15', 'photo', 2), false, 'tercer uso: se alcanzó el límite');
select is((select count from public.ai_usage where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and kind = 'photo'), 2, 'el contador no pasa del límite');
select is(public.reserve_ai_usage('aaaaaaaa-0000-0000-0000-000000000001', '2026-03-15', 'photo', 2), false, 'sigue rechazando');
select is((select count from public.ai_usage where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and kind = 'photo'), 2, 'rechazar no suma');

select is(public.reserve_ai_usage('aaaaaaaa-0000-0000-0000-000000000001', '2026-03-15', 'text', 2), true, 'el texto cuenta aparte de la foto');
select is(public.reserve_ai_usage('aaaaaaaa-0000-0000-0000-000000000001', '2026-03-16', 'photo', 2), true, 'otro día, contador nuevo');
select is(public.reserve_ai_usage('bbbbbbbb-0000-0000-0000-000000000002', '2026-03-15', 'photo', 2), true, 'otro usuario, contador propio');
select is(public.reserve_ai_usage('bbbbbbbb-0000-0000-0000-000000000002', '2026-03-15', 'photo', 0), false, 'un límite de 0 siempre rechaza');

select public.release_ai_usage('aaaaaaaa-0000-0000-0000-000000000001', '2026-03-15', 'photo');
select is((select count from public.ai_usage where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and kind = 'photo' and day = '2026-03-15'), 1, 'liberar devuelve un uso');
select is(public.reserve_ai_usage('aaaaaaaa-0000-0000-0000-000000000001', '2026-03-15', 'photo', 2), true, 'tras liberar hay cupo de nuevo');

select public.record_ai_tokens('aaaaaaaa-0000-0000-0000-000000000001', '2026-03-15', 'photo', 1200, 300);
select public.record_ai_tokens('aaaaaaaa-0000-0000-0000-000000000001', '2026-03-15', 'photo', 800, 100);
select is((select input_tokens from public.ai_usage where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and kind = 'photo' and day = '2026-03-15'), 2000::bigint, 'suma los tokens de entrada');

-- ---------------------------------------------------------------- como usuario autenticado
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$select public.reserve_ai_usage('aaaaaaaa-0000-0000-0000-000000000001', '2026-03-20', 'photo', 999)$$,
  '42501', null, 'el cliente no puede reservar (ni reiniciar) su contador');
select throws_ok(
  $$select public.release_ai_usage('aaaaaaaa-0000-0000-0000-000000000001', '2026-03-15', 'photo')$$,
  '42501', null, 'el cliente no puede liberar usos');
select is((select count(*) from public.ai_usage), 3::bigint, 'el cliente solo lee lo suyo (3 filas propias, no la de B)');

select * from finish();
rollback;

-- Recordatorios: cada usuario administra solo sus suscripciones y sus horarios; anon no accede a nada.

begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@test.local'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@test.local');

insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values
  ('bbbbbbbb-0000-0000-0000-000000000002', 'https://push.example/ajena', 'k', 'a');
insert into public.reminder_settings (user_id, meal_type, remind_at) values
  ('bbbbbbbb-0000-0000-0000-000000000002', 'lunch', '13:00');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('aaaaaaaa-0000-0000-0000-000000000001', 'https://push.example/mia', 'k', 'a')$$,
  'puede guardar su suscripción'
);
select throws_ok(
  $$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('aaaaaaaa-0000-0000-0000-000000000001', 'https://push.example/mia', 'k2', 'a2')$$,
  '23505', null, 'el mismo dispositivo no se duplica para el mismo usuario'
);
select throws_ok(
  $$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('bbbbbbbb-0000-0000-0000-000000000002', 'https://push.example/robada', 'k', 'a')$$,
  '42501', null, 'no puede guardar una suscripción a nombre de otro'
);
select is((select count(*) from public.push_subscriptions), 1::bigint, 'solo ve su suscripción, no la ajena');
select lives_ok(
  $$insert into public.reminder_settings (user_id, meal_type, remind_at) values ('aaaaaaaa-0000-0000-0000-000000000001', 'dinner', '21:00')$$,
  'puede crear un recordatorio'
);
select throws_ok(
  $$insert into public.reminder_settings (user_id, meal_type, remind_at) values ('aaaaaaaa-0000-0000-0000-000000000001', 'brunch', '11:00')$$,
  '23514', null, 'la comida tiene que ser una de las cuatro'
);
select throws_ok(
  $$insert into public.reminder_settings (user_id, meal_type, remind_at) values ('aaaaaaaa-0000-0000-0000-000000000001', 'dinner', '22:00')$$,
  '23505', null, 'un recordatorio por comida'
);
select is((select count(*) from public.reminder_settings), 1::bigint, 'solo ve sus horarios');

update public.reminder_settings set remind_at = '20:30' where meal_type = 'lunch';
reset role;
select is((select remind_at::text from public.reminder_settings where user_id = 'bbbbbbbb-0000-0000-0000-000000000002'), '13:00:00', 'no puede modificar los horarios de otro');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
delete from public.push_subscriptions;
reset role;
select is((select count(*) from public.push_subscriptions), 1::bigint, 'borrar todo solo borra lo propio (queda la ajena)');

set local role anon;
select throws_ok($$select * from public.push_subscriptions$$, '42501', null, 'anon no lee suscripciones');
select throws_ok($$select * from public.reminder_settings$$, '42501', null, 'anon no lee horarios');
reset role;

set local role service_role;
select is((select count(*) from public.push_subscriptions), 1::bigint, 'el servidor (service_role) lee todo');
select lives_ok(
  $$update public.reminder_settings set last_sent_on = '2026-03-10' where user_id = 'bbbbbbbb-0000-0000-0000-000000000002'$$,
  'el servidor marca el último envío'
);
reset role;

select * from finish();
rollback;

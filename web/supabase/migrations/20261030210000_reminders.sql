-- Recordatorios con Web Push (3-L).
--
-- `push_subscriptions`: una fila por dispositivo y usuario (el endpoint lo da el navegador). `reminder_settings`: un
-- recordatorio por comida y usuario, con la hora LOCAL del usuario (su zona horaria está en profiles.timezone) y el
-- último día en que se envió, para no repetirlo.
-- Los envíos los hace el servidor con service_role (tarea programada); el usuario solo administra lo suyo.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null check (char_length(endpoint) between 10 and 2048),
  p256dh text not null check (char_length(p256dh) between 1 and 512),
  auth text not null check (char_length(auth) between 1 and 512),
  user_agent text check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create table public.reminder_settings (
  user_id uuid not null references auth.users (id) on delete cascade,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'snack', 'dinner')),
  enabled boolean not null default true,
  -- Hora local del usuario ("13:00").
  remind_at time not null,
  -- Último día (local del usuario) en que ya se resolvió este recordatorio.
  last_sent_on date,
  updated_at timestamptz not null default now(),
  primary key (user_id, meal_type)
);

alter table public.push_subscriptions enable row level security;
alter table public.reminder_settings enable row level security;

revoke all on public.push_subscriptions, public.reminder_settings from anon, authenticated;
grant all on public.push_subscriptions, public.reminder_settings to service_role;
grant select, insert, update, delete on public.push_subscriptions, public.reminder_settings to authenticated;

create policy push_subscriptions_own on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reminder_settings_own on public.reminder_settings
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

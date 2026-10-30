-- RLS y permisos (docs/contracts.md, sección 1).
-- anon no tiene acceso a nada; authenticated solo a lo suyo; service_role (servidor) todo.

alter table public.profiles enable row level security;
alter table public.weight_logs enable row level security;
alter table public.foods enable row level security;
alter table public.intake_entries enable row level security;
alter table public.water_logs enable row level security;
alter table public.favorite_foods enable row level security;
alter table public.ai_usage enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant all on all tables in schema public to service_role;

-- profiles: la fila la crea el trigger; el usuario la lee y la edita, no la inserta ni la borra.
grant select, update on public.profiles to authenticated;
create policy profiles_select_own on public.profiles
  for select to authenticated using (user_id = auth.uid());
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Tablas con user_id: acceso total a las filas propias.
grant select, insert, update, delete on
  public.weight_logs, public.intake_entries, public.water_logs, public.favorite_foods
  to authenticated;

create policy weight_logs_own on public.weight_logs
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy intake_entries_own on public.intake_entries
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy water_logs_own on public.water_logs
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy favorite_foods_own on public.favorite_foods
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- foods: lectura del catálogo compartido y de lo propio; escritura solo propia.
-- Un usuario solo crea alimentos 'custom' o 'ai_unverified': si pudiera escribir
-- source = 'off' reservaría (source, source_id) y bloquearía el alta del catálogo compartido.
grant select, insert, update, delete on public.foods to authenticated;
create policy foods_select on public.foods
  for select to authenticated
  using (created_by is null or created_by = auth.uid());
create policy foods_insert_own on public.foods
  for insert to authenticated
  with check (created_by = auth.uid() and source in ('custom', 'ai_unverified'));
create policy foods_update_own on public.foods
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid() and source in ('custom', 'ai_unverified'));
create policy foods_delete_own on public.foods
  for delete to authenticated using (created_by = auth.uid());

-- ai_usage: el usuario solo lee. Escribe el servidor (service_role); si el cliente pudiera
-- escribir, podría reiniciar su contador y saltarse AI_DAILY_PHOTO_LIMIT.
grant select on public.ai_usage to authenticated;
create policy ai_usage_select_own on public.ai_usage
  for select to authenticated using (user_id = auth.uid());

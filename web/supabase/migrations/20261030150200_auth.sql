-- Auth: perfil vacío al crear usuario y allowlist de registro.

-- Trigger: cada usuario nuevo recibe su fila vacía en profiles
-- (onboarding_completed_at null => el proxy redirige al onboarding).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Allowlist: solo estos emails pueden registrarse. Sin policies y sin grants a anon/authenticated:
-- solo la lee el hook (security definer) y se administra con service_role o desde el panel.
create table public.allowed_emails (
  email text primary key check (email = lower(email))
);
alter table public.allowed_emails enable row level security;
revoke all on public.allowed_emails from anon, authenticated;
grant all on public.allowed_emails to service_role;

-- Hook "before user created" de Supabase Auth: rechaza el alta si el email no está en la lista.
-- Se activa en config.toml ([auth.hook.before_user_created]) o en el panel de Supabase.
create function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(event -> 'user' ->> 'email');
begin
  if v_email is null or not exists (select 1 from public.allowed_emails where email = v_email) then
    return jsonb_build_object(
      'error',
      jsonb_build_object('http_code', 403, 'message', 'Este email no está autorizado para registrarse.')
    );
  end if;
  return '{}'::jsonb;
end;
$$;

revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;

-- La función de trigger no se invoca por API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

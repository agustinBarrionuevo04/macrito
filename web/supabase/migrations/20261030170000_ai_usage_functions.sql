-- Límite diario de IA por usuario y tipo. Solo las llama el servidor (service_role): si el cliente
-- pudiera llamarlas, podría reiniciar su contador y saltarse el límite.
--
-- Reservar y liberar son atómicas (un solo statement por fila), así que dos pedidos simultáneos
-- no pueden pasarse del límite.

-- Reserva un uso del día. `true` si había cupo; `false` si ya se alcanzó el límite.
create function public.reserve_ai_usage(p_user uuid, p_day date, p_kind text, p_limit int)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  reserved int;
begin
  if p_limit <= 0 then
    return false;
  end if;

  insert into public.ai_usage as u (user_id, day, kind, count)
  values (p_user, p_day, p_kind, 1)
  on conflict (user_id, day, kind)
  do update set count = u.count + 1
  where u.count < p_limit
  returning u.count into reserved;

  return reserved is not null;
end;
$$;

-- Devuelve el uso reservado cuando el pedido falló por culpa del proveedor (no consume cupo).
create function public.release_ai_usage(p_user uuid, p_day date, p_kind text)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.ai_usage
  set count = greatest(count - 1, 0)
  where user_id = p_user and day = p_day and kind = p_kind;
$$;

-- Suma los tokens del pedido para ver el costo real.
create function public.record_ai_tokens(
  p_user uuid, p_day date, p_kind text, p_input bigint, p_output bigint
)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.ai_usage
  set input_tokens = input_tokens + greatest(p_input, 0),
      output_tokens = output_tokens + greatest(p_output, 0)
  where user_id = p_user and day = p_day and kind = p_kind;
$$;

revoke all on function public.reserve_ai_usage(uuid, date, text, int) from public, anon, authenticated;
revoke all on function public.release_ai_usage(uuid, date, text) from public, anon, authenticated;
revoke all on function public.record_ai_tokens(uuid, date, text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.reserve_ai_usage(uuid, date, text, int) to service_role;
grant execute on function public.release_ai_usage(uuid, date, text) to service_role;
grant execute on function public.record_ai_tokens(uuid, date, text, bigint, bigint) to service_role;

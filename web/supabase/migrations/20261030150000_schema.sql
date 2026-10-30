-- Esquema base de Macritos (docs/contracts.md, sección 1).
-- Pendiente de fases posteriores: recipes / recipe_items (3-J) no tienen columnas definidas en el contrato.

create extension if not exists pg_trgm with schema extensions;

-- profiles: 1 fila por usuario, creada vacía por el trigger de auth.users.
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  sex text check (sex in ('male', 'female')),
  birth_date date,
  height_cm numeric check (height_cm > 0),
  weight_kg numeric check (weight_kg > 0),
  target_weight_kg numeric check (target_weight_kg > 0),
  activity_level text check (activity_level in ('sedentary', 'low_active', 'active', 'very_active')),
  goal text check (goal in ('lose', 'maintain', 'gain')),
  weekly_goal_kg numeric,
  kcal_adjustment int not null default 0,
  protein_g_per_kg numeric check (protein_g_per_kg > 0),
  macro_split jsonb,
  timezone text not null default 'America/Argentina/Cordoba',
  onboarding_completed_at timestamptz
);

create table public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  logged_on date not null,
  weight_kg numeric not null check (weight_kg > 0),
  unique (user_id, logged_on)
);

-- foods: catálogo compartido (created_by is null) + alimentos propios.
create table public.foods (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('off', 'usda', 'ar_seed', 'custom', 'ai_unverified')),
  source_id text,
  barcode text,
  name text not null,
  brand text,
  kcal_100g numeric not null check (kcal_100g >= 0),
  protein_100g numeric not null check (protein_100g >= 0),
  carbs_100g numeric not null check (carbs_100g >= 0),
  fat_100g numeric not null check (fat_100g >= 0),
  fiber_100g numeric check (fiber_100g >= 0),
  sugar_100g numeric check (sugar_100g >= 0),
  sodium_mg_100g numeric check (sodium_mg_100g >= 0),
  portions jsonb not null default '[]',
  created_by uuid references auth.users (id) on delete cascade,
  unique (source, source_id)
);

create index foods_barcode_idx on public.foods (barcode);
create index foods_name_trgm_idx on public.foods using gin (name extensions.gin_trgm_ops);
create index foods_created_by_idx on public.foods (created_by);

-- intake_entries: el diario. Los valores nutricionales son snapshot.
create table public.intake_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  logged_on date not null,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  food_id uuid references public.foods (id) on delete set null,
  name text not null,
  quantity_g numeric not null check (quantity_g >= 0),
  kcal numeric not null check (kcal >= 0),
  protein_g numeric not null check (protein_g >= 0),
  carbs_g numeric not null check (carbs_g >= 0),
  fat_g numeric not null check (fat_g >= 0),
  origin text not null check (
    origin in ('manual', 'barcode', 'search', 'ai_photo', 'ai_text', 'recipe', 'copy')
  ),
  is_estimate boolean not null default false,
  created_at timestamptz not null default now()
);

create index intake_entries_user_day_idx on public.intake_entries (user_id, logged_on);

create table public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  logged_on date not null,
  ml int not null check (ml > 0)
);

create index water_logs_user_day_idx on public.water_logs (user_id, logged_on);

create table public.favorite_foods (
  user_id uuid not null references auth.users (id) on delete cascade,
  food_id uuid not null references public.foods (id) on delete cascade,
  primary key (user_id, food_id)
);

-- ai_usage: contador diario por tipo (el límite lo aplica el servidor).
create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  kind text not null,
  count int not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  primary key (user_id, day, kind)
);

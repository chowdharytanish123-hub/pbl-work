-- Fridge to Fork foundation. Run with `supabase db push` or paste into Supabase SQL Editor.
create extension if not exists pgcrypto;

create type public.storage_location as enum ('refrigerator', 'freezer', 'pantry', 'kitchen');
create type public.diet_type as enum ('vegetarian', 'non_vegetarian', 'eggetarian', 'vegan', 'jain', 'pescatarian', 'unspecified');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  age smallint check (age between 13 and 120),
  sex text check (sex in ('female','male','intersex','prefer_not_to_say')),
  height_cm numeric(5,2) check (height_cm between 50 and 260),
  weight_kg numeric(5,2) check (weight_kg between 10 and 500),
  activity_level text check (activity_level in ('sedentary','light','moderate','active','very_active')),
  fitness_goal text check (fitness_goal in ('weight_loss','muscle_gain','maintenance','general_health')),
  calorie_target integer check (calorie_target between 500 and 10000),
  protein_target_g numeric(6,1) check (protein_target_g between 0 and 1000),
  diet public.diet_type not null default 'unspecified',
  allergies text[] not null default '{}',
  disliked_foods text[] not null default '{}',
  preferred_cuisines text[] not null default '{}',
  cooking_skill text check (cooking_skill in ('beginner','intermediate','confident')),
  max_cooking_minutes smallint check (max_cooking_minutes between 5 and 360),
  household_size smallint not null default 1 check (household_size between 1 and 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null unique,
  category text not null,
  common_units text[] not null default '{g}',
  is_common_in_india boolean not null default true,
  allergen_tags text[] not null default '{}',
  created_at timestamptz not null default now()
);
create table public.ingredient_aliases (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  alias text not null,
  language_code text not null default 'en',
  normalized_alias text generated always as (lower(trim(alias))) stored,
  unique(normalized_alias, language_code)
);
create index ingredient_aliases_lookup_idx on public.ingredient_aliases(normalized_alias);

create table public.nutrition_records (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  food_state text not null default 'raw',
  source_name text not null,
  source_food_id text,
  per_100g jsonb not null check (jsonb_typeof(per_100g) = 'object'),
  source_url text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique(ingredient_id, food_state, source_name, source_food_id)
);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  alternate_names text[] not null default '{}',
  region text not null,
  cuisine text not null default 'Indian',
  meal_type text not null,
  diet public.diet_type not null default 'unspecified',
  prep_minutes smallint not null check (prep_minutes >= 0),
  cook_minutes smallint not null check (cook_minutes >= 0),
  difficulty text not null default 'easy' check (difficulty in ('easy','medium','advanced')),
  servings smallint not null default 2 check (servings > 0),
  instructions jsonb not null default '[]'::jsonb check (jsonb_typeof(instructions) = 'array'),
  tags text[] not null default '{}',
  allergens text[] not null default '{}',
  image_url text,
  source_name text,
  source_url text,
  verification_status text not null default 'seed_unverified' check (verification_status in ('seed_unverified','source_reviewed','expert_verified')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index recipes_region_idx on public.recipes(region);
create index recipes_meal_type_idx on public.recipes(meal_type);
create table public.recipe_ingredients (
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id),
  quantity numeric(10,3) not null check (quantity >= 0),
  unit text not null,
  grams numeric(10,3) check (grams >= 0),
  food_state text not null default 'raw',
  optional boolean not null default false,
  preparation_note text,
  primary key(recipe_id, ingredient_id, food_state)
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ingredient_id uuid references public.ingredients(id),
  ingredient_name text not null,
  quantity numeric(10,3) not null check (quantity >= 0),
  unit text not null,
  purchase_date date,
  expiry_date date,
  opened boolean not null default false,
  storage_location public.storage_location not null default 'refrigerator',
  source text not null default 'manual' check (source in ('manual','scan','import')),
  confidence numeric(4,3) check (confidence between 0 and 1),
  verified boolean not null default false,
  consumed_at timestamptz,
  discarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expiry_date is null or purchase_date is null or expiry_date >= purchase_date)
);
create index inventory_user_active_idx on public.inventory_items(user_id, expiry_date) where consumed_at is null and discarded_at is null;

create table public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_date date not null,
  meal_slot text not null check (meal_slot in ('breakfast','lunch','snack','dinner')),
  recipe_id uuid references public.recipes(id) on delete set null,
  servings numeric(5,2) not null default 1 check (servings > 0),
  status text not null default 'planned' check (status in ('planned','cooked','skipped')),
  created_at timestamptz not null default now(),
  unique(user_id, plan_date, meal_slot)
);
create table public.meal_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe_id uuid references public.recipes(id) on delete set null,
  recipe_name_snapshot text not null,
  cooked_at timestamptz not null default now(),
  servings numeric(5,2) not null default 1 check (servings > 0),
  nutrition_snapshot jsonb,
  ingredients_used jsonb not null default '[]'::jsonb,
  rating smallint check (rating between 1 and 5),
  prep_minutes_actual smallint check (prep_minutes_actual >= 0)
);
create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Shopping list',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create table public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shopping_lists(id) on delete cascade,
  ingredient_id uuid references public.ingredients(id) on delete set null,
  ingredient_name text not null,
  quantity numeric(10,3) not null check (quantity >= 0),
  unit text not null,
  checked boolean not null default false,
  created_at timestamptz not null default now(),
  unique(list_id, ingredient_name, unit)
);
create table public.saved_recipes (
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id, recipe_id)
);
create table public.recipe_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  feedback text not null check (feedback in ('liked','rejected','cooked')),
  created_at timestamptz not null default now()
);
create table public.ai_scan_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  image_storage_path text,
  model_name text,
  status text not null default 'pending' check (status in ('pending','completed','failed','reviewed')),
  created_at timestamptz not null default now()
);
create table public.ai_scan_detections (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.ai_scan_sessions(id) on delete cascade,
  ingredient_id uuid references public.ingredients(id),
  proposed_name text not null,
  estimated_quantity numeric(10,3),
  estimated_unit text,
  confidence numeric(4,3) check (confidence between 0 and 1),
  user_confirmed boolean,
  corrected_name text,
  created_at timestamptz not null default now()
);
create table public.food_waste_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  event_type text not null check (event_type in ('consumed_before_expiry','discarded','saved_estimate')),
  quantity numeric(10,3) not null default 0,
  unit text not null default 'g',
  estimated_value_inr numeric(10,2),
  created_at timestamptz not null default now()
);

-- Automatically create a profile for every new auth user.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- Enable RLS on every user-facing table. Recipe/ingredient reference data is readable by authenticated users.
do $$ declare t text; begin
  foreach t in array array['profiles','inventory_items','meal_plans','meal_history','shopping_lists','saved_recipes','recipe_feedback','ai_scan_sessions','food_waste_events'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
alter table public.shopping_list_items enable row level security;
alter table public.ai_scan_detections enable row level security;

create policy "profiles_select_own" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy "profiles_update_own" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "inventory_select_own" on public.inventory_items for select to authenticated using (user_id = (select auth.uid()));
create policy "inventory_insert_own" on public.inventory_items for insert to authenticated with check (user_id = (select auth.uid()));
create policy "inventory_update_own" on public.inventory_items for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "inventory_delete_own" on public.inventory_items for delete to authenticated using (user_id = (select auth.uid()));
create policy "meal_plans_own" on public.meal_plans for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "meal_history_own" on public.meal_history for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "shopping_lists_own" on public.shopping_lists for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "shopping_items_via_parent" on public.shopping_list_items for all to authenticated using (exists(select 1 from public.shopping_lists l where l.id = list_id and l.user_id = (select auth.uid()))) with check (exists(select 1 from public.shopping_lists l where l.id = list_id and l.user_id = (select auth.uid())));
create policy "saved_recipes_own" on public.saved_recipes for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "recipe_feedback_own" on public.recipe_feedback for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "scan_sessions_own" on public.ai_scan_sessions for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "scan_detections_via_parent" on public.ai_scan_detections for all to authenticated using (exists(select 1 from public.ai_scan_sessions s where s.id = session_id and s.user_id = (select auth.uid()))) with check (exists(select 1 from public.ai_scan_sessions s where s.id = session_id and s.user_id = (select auth.uid())));
create policy "food_waste_own" on public.food_waste_events for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter table public.ingredients enable row level security;
alter table public.ingredient_aliases enable row level security;
alter table public.nutrition_records enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
create policy "ingredients_read_authenticated" on public.ingredients for select to authenticated using (true);
create policy "aliases_read_authenticated" on public.ingredient_aliases for select to authenticated using (true);
create policy "nutrition_read_authenticated" on public.nutrition_records for select to authenticated using (true);
create policy "recipes_read_authenticated" on public.recipes for select to authenticated using (true);
create policy "recipe_ingredients_read_authenticated" on public.recipe_ingredients for select to authenticated using (true);

-- Seed canonical ingredients and aliases only; no fabricated nutrition values or claims of verified recipes.
insert into public.ingredients(canonical_name, category) values
('Tomato','vegetable'),('Onion','vegetable'),('Spinach','vegetable'),('Potato','vegetable'),('Rice','grain'),('Wheat atta','grain'),('Egg','egg'),('Milk','dairy'),('Curd','dairy'),('Chicken','meat'),('Lemon','fruit'),('Green chilli','spice'),('Ginger','spice'),('Garlic','spice'),('Coriander leaves','herb'),('Toor dal','pulse'),('Chickpea flour','pulse'),('Paneer','dairy'),('Carrot','vegetable'),('Cabbage','vegetable'),('Peas','vegetable'),('Cumin seeds','spice'),('Turmeric','spice'),('Cooking oil','oil'),('Poha','grain'),('Suji','grain'),('Moong dal','pulse'),('Urad dal','pulse'),('Rajma','pulse'),('Banana','fruit')
on conflict(canonical_name) do nothing;
insert into public.ingredient_aliases(ingredient_id, alias, language_code)
select id, alias, lang from (values
('Tomato','Tomatoes','en'),('Tomato','Tamatar','hi'),('Onion','Pyaaz','hi'),('Spinach','Palak','hi'),('Coriander leaves','Dhania','hi'),('Coriander leaves','Cilantro','en'),('Potato','Aloo','hi'),('Curd','Dahi','hi'),('Chickpea flour','Besan','hi'),('Wheat atta','Atta','hi'),('Green chilli','Hari mirch','hi'),('Rice','Chawal','hi'),('Egg','Anda','hi'),('Lemon','Nimbu','hi')) v(canonical, alias, lang)
join public.ingredients i on i.canonical_name = v.canonical
on conflict(normalized_alias, language_code) do nothing;

-- Small representative development seed: intentionally marked seed_unverified until source review.
insert into public.recipes(slug,name,region,meal_type,diet,prep_minutes,cook_minutes,difficulty,servings,instructions,tags,verification_status)
values
('batata-poha','Batata Poha','Maharashtra','breakfast','vegan',10,15,'easy',2,'["Rinse poha briefly and let it soften.","Temper cumin and green chilli in a little oil; add onion and potato and cook until tender.","Fold in poha, turmeric and salt; warm through and finish with lemon and coriander if available."]','{quick,vegetarian,breakfast}','seed_unverified'),
('palak-dal','Palak Dal','Pan-Indian','lunch','vegan',10,25,'easy',3,'["Rinse and cook dal until soft.","Cook onion, tomato, ginger and spices until fragrant.","Add chopped spinach and cooked dal; simmer until combined and season to taste."]','{comfort-food,protein,vegetarian}','seed_unverified'),
('anda-bhurji','Anda Bhurji','Pan-Indian','breakfast','eggetarian',8,12,'easy',2,'["Soften onion and green chilli in a little oil.","Add tomato and cook until soft.","Add beaten eggs and stir gently until just set; finish with coriander."]','{quick,high-protein,breakfast}','seed_unverified'),
('tomato-rice','Tomato Rice','South India','lunch','vegan',10,20,'easy',2,'["Cook rice separately if not already cooked.","Cook onion, tomato, ginger and spices until thick and aromatic.","Fold through cooked rice and warm gently; adjust seasoning."]','{rice,vegetarian,quick}','seed_unverified'),
('chicken-spinach-curry','Chicken and Spinach Curry','Pan-Indian','dinner','non_vegetarian',12,28,'medium',2,'["Brown onion with ginger and garlic in a little oil.","Add chicken and cook until the outside is opaque; add tomato and spices.","Add spinach and a splash of water, cover and cook until chicken reaches a safe internal temperature."]','{high-protein,dinner,one-pot}','seed_unverified'),
('besan-chilla','Besan Chilla','North India','breakfast','vegan',8,12,'easy',2,'["Whisk besan with water, chopped onion, tomato, green chilli and spices into a pourable batter.","Pour a thin layer onto a lightly oiled hot pan.","Cook both sides until set and lightly browned."]','{quick,vegetarian,breakfast}','seed_unverified')
on conflict(slug) do nothing;

insert into public.recipe_ingredients(recipe_id,ingredient_id,quantity,unit,grams,food_state,optional)
select r.id, i.id, x.qty, x.unit, x.grams, 'raw', x.optional
from (values
('batata-poha','Poha',160::numeric,'g',160::numeric,false),('batata-poha','Potato',1,'unit',150,false),('batata-poha','Onion',1,'unit',100,false),('batata-poha','Green chilli',1,'unit',5,true),('batata-poha','Cooking oil',10,'g',10,false),('batata-poha','Lemon',1,'unit',40,true),
('palak-dal','Toor dal',150,'g',150,false),('palak-dal','Spinach',150,'g',150,false),('palak-dal','Tomato',2,'unit',200,false),('palak-dal','Onion',1,'unit',100,false),('palak-dal','Ginger',10,'g',10,true),('palak-dal','Cooking oil',10,'g',10,false),
('anda-bhurji','Egg',4,'units',200,false),('anda-bhurji','Onion',1,'unit',100,false),('anda-bhurji','Tomato',1,'unit',100,false),('anda-bhurji','Green chilli',1,'unit',5,true),('anda-bhurji','Cooking oil',5,'g',5,false),('anda-bhurji','Coriander leaves',10,'g',10,true),
('tomato-rice','Rice',160,'g',160,false),('tomato-rice','Tomato',3,'unit',300,false),('tomato-rice','Onion',1,'unit',100,false),('tomato-rice','Ginger',10,'g',10,true),('tomato-rice','Cooking oil',10,'g',10,false),
('chicken-spinach-curry','Chicken',300,'g',300,false),('chicken-spinach-curry','Spinach',150,'g',150,false),('chicken-spinach-curry','Tomato',2,'unit',200,false),('chicken-spinach-curry','Onion',1,'unit',100,false),('chicken-spinach-curry','Ginger',10,'g',10,false),('chicken-spinach-curry','Garlic',10,'g',10,false),('chicken-spinach-curry','Cooking oil',10,'g',10,false),
('besan-chilla','Chickpea flour',120,'g',120,false),('besan-chilla','Onion',1,'unit',100,true),('besan-chilla','Tomato',1,'unit',100,true),('besan-chilla','Green chilli',1,'unit',5,true),('besan-chilla','Cooking oil',10,'g',10,false)
) x(slug, ingredient_name, qty, unit, grams, optional)
join public.recipes r on r.slug=x.slug
join public.ingredients i on i.canonical_name=x.ingredient_name
on conflict(recipe_id,ingredient_id,food_state) do nothing;

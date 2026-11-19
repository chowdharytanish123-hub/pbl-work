import type { SupabaseClient } from '@supabase/supabase-js';

export async function listRecipes(supabase: SupabaseClient) {
  return supabase
    .from('recipes')
    .select('id,name,slug,region,cuisine,meal_type,diet,prep_minutes,cook_minutes,servings,difficulty,allergens,instructions,tags,verification_status,image_url,recipe_ingredients(ingredient_id,quantity,unit,grams,optional,preparation_note,food_state)')
    .order('name', { ascending: true });
}

export async function listIngredients(supabase: SupabaseClient) {
  return supabase
    .from('ingredients')
    .select('id,canonical_name,allergen_tags')
    .order('canonical_name', { ascending: true });
}

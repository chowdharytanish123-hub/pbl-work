import type { SupabaseClient } from '@supabase/supabase-js';

export async function listSavedRecipeIds(supabase: SupabaseClient, userId: string) {
  return supabase
    .from('saved_recipes')
    .select('recipe_id')
    .eq('user_id', userId);
}

export async function saveRecipe(supabase: SupabaseClient, userId: string, recipeId: string) {
  return supabase
    .from('saved_recipes')
    .insert({ user_id: userId, recipe_id: recipeId });
}

export async function unsaveRecipe(supabase: SupabaseClient, userId: string, recipeId: string) {
  return supabase
    .from('saved_recipes')
    .delete()
    .eq('user_id', userId)
    .eq('recipe_id', recipeId);
}

import type { SupabaseClient } from '@supabase/supabase-js';

export type MealPlanRow = {
  id: string;
  plan_date: string;
  meal_slot: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  recipe_id: string | null;
  servings: number;
  status: 'planned' | 'cooked' | 'skipped';
};

export async function listMealPlans(supabase: SupabaseClient, userId: string, startDate: string, endDate: string) {
  return supabase
    .from('meal_plans')
    .select('id,plan_date,meal_slot,recipe_id,servings,status')
    .eq('user_id', userId)
    .gte('plan_date', startDate)
    .lte('plan_date', endDate)
    .order('plan_date', { ascending: true });
}

export async function upsertMealPlan(supabase: SupabaseClient, userId: string, planDate: string, mealSlot: MealPlanRow['meal_slot'], recipeId: string, servings: number) {
  return supabase
    .from('meal_plans')
    .upsert({ user_id: userId, plan_date: planDate, meal_slot: mealSlot, recipe_id: recipeId, servings, status: 'planned' }, { onConflict: 'user_id,plan_date,meal_slot' })
    .select('id,plan_date,meal_slot,recipe_id,servings,status')
    .single();
}

export async function removeMealPlan(supabase: SupabaseClient, userId: string, planDate: string, mealSlot: MealPlanRow['meal_slot']) {
  return supabase
    .from('meal_plans')
    .delete()
    .eq('user_id', userId)
    .eq('plan_date', planDate)
    .eq('meal_slot', mealSlot);
}

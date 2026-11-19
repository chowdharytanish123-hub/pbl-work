export type Nutrients = { calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g?: number; sodium_mg?: number };
export type NutritionIngredient = { grams: number; per100g: Nutrients };
/** Deterministic scaling only. per100g must come from a trusted, mapped food-composition record. */
export function calculateNutrition(items: NutritionIngredient[], servings = 1): Nutrients {
  if (!Number.isFinite(servings) || servings <= 0) throw new Error('Servings must be greater than zero.');
  const total: Nutrients = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sodium_mg: 0 };
  for (const item of items) {
    if (!Number.isFinite(item.grams) || item.grams < 0) throw new Error('Ingredient grams must be a non-negative number.');
    for (const key of Object.keys(total) as (keyof Nutrients)[]) total[key] += (item.per100g[key] ?? 0) * item.grams / 100 / servings;
  }
  for (const key of Object.keys(total) as (keyof Nutrients)[]) total[key] = Math.round((total[key] ?? 0) * 10) / 10;
  return total;
}

import type { InventoryItem, Recipe } from './types';
const normalize = (s: string) => s.toLowerCase().trim().replace(/s$/, '').replace(/[^a-z0-9 ]/g, '');
export function matchRecipes(recipes: Recipe[], inventory: InventoryItem[], limit = 8) {
  const owned = new Set(inventory.map(i => normalize(i.ingredient_name)));
  return recipes.map(recipe => {
    const required = recipe.ingredients.filter(i => !i.optional);
    const available = required.filter(i => [...owned].some(name => name === normalize(i.ingredient_name) || name.includes(normalize(i.ingredient_name)) || normalize(i.ingredient_name).includes(name)));
    const missing = required.filter(i => !available.includes(i));
    const expiring = inventory.filter(i => i.expiry_date && i.expiry_date <= new Date(Date.now() + 3 * 86400000).toISOString().slice(0,10) && required.some(r => normalize(r.ingredient_name) === normalize(i.ingredient_name))).length;
    const coverage = required.length ? available.length / required.length : 0;
    const score = Math.round(coverage * 70 + Math.min(expiring, 3) * 7 - Math.max(0, recipe.prep_minutes + recipe.cook_minutes - 35) * 0.3);
    return { recipe, available: available.map(i => i.ingredient_name), missing: missing.map(i => i.ingredient_name), coverage: Math.round(coverage * 100), expiring, score };
  }).sort((a,b) => b.score - a.score).slice(0, limit);
}

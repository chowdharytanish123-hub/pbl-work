import { describe, expect, it } from 'vitest';
import { calculateNutrition } from '../lib/nutrition';
describe('calculateNutrition', () => {
  it('scales trusted per-100g values and divides by servings deterministically', () => {
    expect(calculateNutrition([{ grams: 200, per100g: { calories: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6 } }, { grams: 100, per100g: { calories: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3 } }], 2)).toMatchObject({ calories: 230, protein_g: 32.4, carbs_g: 14, fat_g: 3.8 });
  });
  it('rejects invalid serving counts', () => { expect(() => calculateNutrition([], 0)).toThrow(); });
  it('rejects negative ingredient weights', () => { expect(() => calculateNutrition([{ grams: -2, per100g: { calories: 1, protein_g: 1, carbs_g: 1, fat_g: 1 } }])).toThrow(); });
});

export const FALLBACK_FOOD_IMAGE = 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Dal_Palak.jpg/1280px-Dal_Palak.jpg';

const DISH_IMAGES: Record<string, string> = {
  'batata poha': 'https://upload.wikimedia.org/wikipedia/commons/f/f4/Poha%2C_a_snack_made_of_flattened_rice.jpg',
  'poha': 'https://upload.wikimedia.org/wikipedia/commons/f/f4/Poha%2C_a_snack_made_of_flattened_rice.jpg',
  'palak dal': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Dal_Palak.jpg/1280px-Dal_Palak.jpg',
  'dal rice': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Dal_Palak.jpg/1280px-Dal_Palak.jpg',
  'anda bhurji': '/recipes/anda-bhurji.jpe',
  'egg bhurji': '/recipes/anda-bhurji.jpe',
  'tomato rice': '/recipes/tomato-rice.jpe',
  'chicken and spinach curry': 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Chicken_Spinach_curry_%284465754837%29.jpg/1280px-Chicken_Spinach_curry_%284465754837%29.jpg',
  'chicken spinach curry': 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Chicken_Spinach_curry_%284465754837%29.jpg/1280px-Chicken_Spinach_curry_%284465754837%29.jpg',
  'besan chilla': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Besan_chilla.jpg/1280px-Besan_chilla.jpg',
  'paneer bhurji': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Homemade_Paneer_Bhurji.jpg/1280px-Homemade_Paneer_Bhurji.jpg',
};

export function getRecipeImage(recipe: { name: string; image_url?: string | null }) {
  if (recipe.image_url?.trim()) return recipe.image_url;
  const name = recipe.name.toLowerCase().trim();
  if (DISH_IMAGES[name]) return DISH_IMAGES[name];
  const partialMatch = Object.keys(DISH_IMAGES).find(key => name.includes(key) || key.includes(name));
  return partialMatch ? DISH_IMAGES[partialMatch] : FALLBACK_FOOD_IMAGE;
}

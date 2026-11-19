import type { SupabaseClient } from '@supabase/supabase-js';

export async function searchIngredients(supabase: SupabaseClient, search: string) {
  const query = supabase
    .from('ingredients')
    .select('id,canonical_name,common_units,category')
    .order('canonical_name', { ascending: true })
    .limit(20);

  if (search.trim()) {
    return query.ilike('canonical_name', `%${search.trim()}%`);
  }
  return query;
}

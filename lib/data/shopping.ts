import type { SupabaseClient } from '@supabase/supabase-js';
import type { ShoppingItem } from '@/lib/types';

export async function getOrCreateShoppingList(supabase: SupabaseClient, userId: string) {
  const existing = await supabase
    .from('shopping_lists')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing.error) return existing;
  if (existing.data) return existing;
  return supabase
    .from('shopping_lists')
    .insert({ user_id: userId, title: 'Shopping list' })
    .select('id')
    .single();
}

export async function listShoppingItems(supabase: SupabaseClient, listId: string) {
  return supabase
    .from('shopping_list_items')
    .select('id,ingredient_name,quantity,unit,checked')
    .eq('list_id', listId)
    .order('created_at', { ascending: true });
}

export async function createShoppingItem(supabase: SupabaseClient, listId: string, item: Omit<ShoppingItem, 'id'>) {
  return supabase
    .from('shopping_list_items')
    .insert({ list_id: listId, ingredient_name: item.ingredient_name, quantity: item.quantity, unit: item.unit, checked: item.checked })
    .select('id,ingredient_name,quantity,unit,checked')
    .single();
}

export async function updateShoppingItem(supabase: SupabaseClient, listId: string, itemId: string, changes: Partial<Omit<ShoppingItem, 'id'>>) {
  return supabase
    .from('shopping_list_items')
    .update(changes)
    .eq('id', itemId)
    .eq('list_id', listId)
    .select('id,ingredient_name,quantity,unit,checked')
    .single();
}

export async function deleteShoppingItem(supabase: SupabaseClient, listId: string, itemId: string) {
  return supabase
    .from('shopping_list_items')
    .delete()
    .eq('id', itemId)
    .eq('list_id', listId);
}

export async function clearPurchasedShoppingItems(supabase: SupabaseClient, listId: string) {
  return supabase
    .from('shopping_list_items')
    .delete()
    .eq('list_id', listId)
    .eq('checked', true);
}

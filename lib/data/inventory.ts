import type { SupabaseClient } from '@supabase/supabase-js';
import type { InventoryItem } from '@/lib/types';

export type InventoryInput = {
  ingredient_name: string;
  quantity: number;
  unit: string;
  storage_location: InventoryItem['storage_location'];
  expiry_date: string | null;
};

export async function listActiveInventory(supabase: SupabaseClient, userId: string) {
  return supabase
    .from('inventory_items')
    .select('*')
    .eq('user_id', userId)
    .is('consumed_at', null)
    .is('discarded_at', null)
    .order('expiry_date', { ascending: true, nullsFirst: false });
}

export async function createInventoryItem(supabase: SupabaseClient, userId: string, input: InventoryInput) {
  return supabase
    .from('inventory_items')
    .insert({
      user_id: userId,
      ingredient_name: input.ingredient_name,
      quantity: input.quantity,
      unit: input.unit,
      expiry_date: input.expiry_date,
      storage_location: input.storage_location,
      source: 'manual',
      verified: true,
    })
    .select('*')
    .single();
}

export async function updateInventoryItem(
  supabase: SupabaseClient,
  userId: string,
  itemId: string,
  input: InventoryInput,
) {
  return supabase
    .from('inventory_items')
    .update({
      ingredient_name: input.ingredient_name,
      quantity: input.quantity,
      unit: input.unit,
      expiry_date: input.expiry_date,
      storage_location: input.storage_location,
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId)
    .eq('user_id', userId)
    .select('*')
    .single();
}

export async function deleteInventoryItem(supabase: SupabaseClient, userId: string, itemId: string) {
  return supabase
    .from('inventory_items')
    .delete()
    .eq('id', itemId)
    .eq('user_id', userId);
}

export type TransferItem = {
  id: string;
  ingredient_name: string;
  quantity: number;
  unit: string;
};

const normalizeName = (value: string) => value
  .toLowerCase()
  .trim()
  .replace(/s$/, '')
  .replace(/[^a-z0-9 ]/g, '');

export function compatibleUnit(a: string, b: string) {
  const left = a.toLowerCase().trim();
  const right = b.toLowerCase().trim();
  if (left === right) return true;
  if (['g', 'kg'].includes(left) && ['g', 'kg'].includes(right)) return true;
  if (['ml', 'millilitre', 'milliliter', 'litre', 'liter', 'l'].includes(left) && ['ml', 'millilitre', 'milliliter', 'litre', 'liter', 'l'].includes(right)) return true;
  if (['unit', 'units', 'piece', 'pieces'].includes(left) && ['unit', 'units', 'piece', 'pieces'].includes(right)) return true;
  return false;
}

export function combineQuantity(existingQuantity: number, existingUnit: string, purchasedQuantity: number, purchasedUnit: string) {
  const existing = existingUnit.toLowerCase().trim();
  const purchased = purchasedUnit.toLowerCase().trim();
  if (['g', 'kg'].includes(existing) && ['g', 'kg'].includes(purchased)) {
    const grams = (existing === 'kg' ? existingQuantity * 1000 : existingQuantity) + (purchased === 'kg' ? purchasedQuantity * 1000 : purchasedQuantity);
    return grams >= 1000 ? { quantity: grams / 1000, unit: 'kg' } : { quantity: grams, unit: 'g' };
  }
  if (['ml', 'millilitre', 'milliliter'].includes(existing) && ['ml', 'millilitre', 'milliliter', 'litre', 'liter', 'l'].includes(purchased)) {
    const millilitres = existingQuantity + (['litre', 'liter', 'l'].includes(purchased) ? purchasedQuantity * 1000 : purchasedQuantity);
    return millilitres >= 1000 ? { quantity: millilitres / 1000, unit: 'litre' } : { quantity: millilitres, unit: 'ml' };
  }
  if (['litre', 'liter', 'l'].includes(existing) && ['ml', 'millilitre', 'milliliter', 'litre', 'liter', 'l'].includes(purchased)) {
    const millilitres = existingQuantity * 1000 + (['litre', 'liter', 'l'].includes(purchased) ? purchasedQuantity * 1000 : purchasedQuantity);
    return millilitres >= 1000 ? { quantity: millilitres / 1000, unit: 'litre' } : { quantity: millilitres, unit: 'ml' };
  }
  if (['unit', 'units', 'piece', 'pieces'].includes(existing) && ['unit', 'units', 'piece', 'pieces'].includes(purchased)) {
    return { quantity: existingQuantity + purchasedQuantity, unit: existingQuantity >= 1 && existingQuantity % 1 === 0 ? 'units' : existing };
  }
  return null;
}

export async function transferPurchasedToInventory(supabase: SupabaseClient, userId: string, purchasedItems: TransferItem[]) {
  const inventoryResult = await listActiveInventory(supabase, userId);
  if (inventoryResult.error) return inventoryResult;
  const inventory = (inventoryResult.data ?? []) as InventoryItem[];
  const originalExisting = new Map<string, InventoryItem>();
  const createdIds: string[] = [];

  const rollback = async () => {
    for (const original of originalExisting.values()) {
      await updateInventoryItem(supabase, userId, original.id, {
        ingredient_name: original.ingredient_name,
        quantity: original.quantity,
        unit: original.unit,
        storage_location: original.storage_location,
        expiry_date: original.expiry_date,
      });
    }
    for (const id of createdIds.reverse()) {
      await deleteInventoryItem(supabase, userId, id);
    }
  };

  for (const purchased of purchasedItems) {
    const purchasedName = normalizeName(purchased.ingredient_name);
    const existing = inventory.find(item => {
      const existingName = normalizeName(item.ingredient_name);
      return existingName === purchasedName || existingName.includes(purchasedName) || purchasedName.includes(existingName);
    });

    if (existing) {
      if (!originalExisting.has(existing.id)) originalExisting.set(existing.id, { ...existing });
      const purchasedQuantity = Number.isFinite(purchased.quantity) && purchased.quantity > 0 ? purchased.quantity : 1;
      const combined = compatibleUnit(existing.unit, purchased.unit)
        ? combineQuantity(existing.quantity, existing.unit, purchasedQuantity, purchased.unit)
        : null;

      if (combined) {
        const result = await updateInventoryItem(supabase, userId, existing.id, {
          ingredient_name: existing.ingredient_name,
          quantity: combined.quantity,
          unit: combined.unit,
          storage_location: existing.storage_location,
          expiry_date: existing.expiry_date,
        });
        if (result.error) { await rollback(); return result; }
        existing.quantity = combined.quantity;
        existing.unit = combined.unit;
      } else {
        const result = await createInventoryItem(supabase, userId, {
          ingredient_name: purchased.ingredient_name,
          quantity: purchasedQuantity,
          unit: purchased.unit,
          storage_location: 'pantry',
          expiry_date: null,
        });
        if (result.error) { await rollback(); return result; }
        if (result.data) { createdIds.push((result.data as InventoryItem).id); inventory.push(result.data as InventoryItem); }
      }
    } else {
      const result = await createInventoryItem(supabase, userId, {
        ingredient_name: purchased.ingredient_name,
        quantity: Number.isFinite(purchased.quantity) && purchased.quantity > 0 ? purchased.quantity : 1,
        unit: purchased.unit || 'units',
        storage_location: 'pantry',
        expiry_date: null,
      });
      if (result.error) { await rollback(); return result; }
      if (result.data) { createdIds.push((result.data as InventoryItem).id); inventory.push(result.data as InventoryItem); }
    }
  }

  return { data: inventory, error: null, rollback };
}

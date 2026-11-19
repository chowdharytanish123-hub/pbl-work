'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { InventoryItem, Recipe, RecipeIngredient, ShoppingItem } from '@/lib/types';
import { matchRecipes } from '@/lib/recipe-match';
import { createInventoryItem, deleteInventoryItem, listActiveInventory, updateInventoryItem, transferPurchasedToInventory } from '@/lib/data/inventory';
import { listIngredients, listRecipes } from '@/lib/data/recipes';
import { searchIngredients } from '@/lib/data/ingredients';
import { FALLBACK_FOOD_IMAGE, getRecipeImage } from '@/lib/food-images';
import { getOrCreateShoppingList, listShoppingItems, createShoppingItem, updateShoppingItem, deleteShoppingItem, clearPurchasedShoppingItems } from '@/lib/data/shopping';
import { listMealPlans, upsertMealPlan, removeMealPlan, type MealPlanRow } from '@/lib/data/meal-plans';
import { listSavedRecipeIds, saveRecipe, unsaveRecipe } from '@/lib/data/saved-recipes';
import { CalendarDays, ChefHat, ChevronLeft, ChevronRight, CookingPot, House, Monitor, Moon, Plus, Refrigerator, Search, Settings as SettingsIcon, ScanLine, ShoppingBasket, Sun, Trash2, Upload, X, type LucideIcon } from 'lucide-react';

type Section = 'home' | 'planner' | 'recipes' | 'kitchen' | 'shopping';
type StorageLocation = 'refrigerator' | 'freezer' | 'pantry' | 'kitchen';
type Profile = { display_name?: string; diet?: string; allergies?: string[]; disliked_foods?: string[]; preferred_cuisines?: string[]; cooking_skill?: string | null; max_cooking_minutes?: number | null; household_size?: number; fitness_goal?: string | null; calorie_target?: number | string | null; protein_target_g?: number | string | null };
type RecipeRow = {
  id: string; name: string; region: string; meal_type: string; diet: string;
  prep_minutes: number; cook_minutes: number; servings: number; difficulty: string; allergens?: string[]; cuisine?: string;
  instructions: string[] | null; tags: string[] | null; verification_status: string;
  recipe_ingredients?: { ingredient_id: string; quantity: number; unit: string; optional: boolean }[];
};
const today = new Date().toISOString().slice(0, 10);
function hasProfilePreferences(value: Profile) {
  return Boolean((value.diet && value.diet !== 'unspecified') || value.allergies?.length || value.disliked_foods?.length || value.preferred_cuisines?.length || value.cooking_skill || value.max_cooking_minutes || value.household_size && value.household_size > 1 || value.fitness_goal);
}

const nav: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: 'home', label: 'Home', icon: House }, { id: 'planner', label: 'Meal Planner', icon: CalendarDays },
  { id: 'recipes', label: 'Recipes', icon: ChefHat }, { id: 'kitchen', label: 'My Kitchen', icon: Refrigerator },
  { id: 'shopping', label: 'Shopping', icon: ShoppingBasket },
];

export default function Home() {
  const [supabase] = useState(() => createClient());
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'forgot' | 'reset'>('login');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [confirmPassword, setConfirmPassword] = useState(''); const [displayName, setDisplayName] = useState('');
  const [authBusy, setAuthBusy] = useState(false); const [authError, setAuthError] = useState(''); const [notice, setNotice] = useState('');
  const [section, setSection] = useState<Section>('home'); const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]); const [recipeLoading, setRecipeLoading] = useState(true); const [recipeError, setRecipeError] = useState(''); const [profile, setProfile] = useState<Profile>({});
  const [shopping, setShopping] = useState<ShoppingItem[]>([]); const [loading, setLoading] = useState(false);
  const [shoppingListId, setShoppingListId] = useState<string | null>(null);
  const [shoppingSearch, setShoppingSearch] = useState(''); const [shoppingDraft, setShoppingDraft] = useState('');
  const [shoppingLoading, setShoppingLoading] = useState(false); const [shoppingBusy, setShoppingBusy] = useState(false);
  const [mealPlans, setMealPlans] = useState<MealPlanRow[]>([]); const [mealPlanLoading, setMealPlanLoading] = useState(true); const [mealPlanBusy, setMealPlanBusy] = useState(false);
  const [savedRecipeIds, setSavedRecipeIds] = useState<Set<string>>(new Set());
  const [savedRecipeCount, setSavedRecipeCount] = useState(0);
  const [savedRecipeBusy, setSavedRecipeBusy] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null); const [recipeSearch, setRecipeSearch] = useState('');
  const [profilePanelOpen, setProfilePanelOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  type ThemeChoice = 'light' | 'dark' | 'system';
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(() => {
    if (typeof window === 'undefined') return 'light';
    const stored = window.localStorage.getItem('fridge-to-fork:theme');
    return stored === 'dark' || stored === 'system' ? stored : 'light';
  });
  const [onboarding, setOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [showScanner, setShowScanner] = useState(false);
  const [showAdd, setShowAdd] = useState(false); const [ingredientName, setIngredientName] = useState('');
  const [quantity, setQuantity] = useState('1'); const [unit, setUnit] = useState('units');
  const [expiry, setExpiry] = useState(''); const [storage, setStorage] = useState<StorageLocation>('refrigerator'); const [search, setSearch] = useState('');
  const [editingIngredient, setEditingIngredient] = useState<InventoryItem | null>(null);
  const [inventoryBusy, setInventoryBusy] = useState(false);

  useEffect(() => {
    let mounted = true;

    const timeoutId = window.setTimeout(() => {
      if (mounted) {
        setSession(null);
        setAuthError('Session check timed out. Please sign in again.');
        setAuthLoading(false);
      }
    }, 8000);

    const finishSessionCheck = (nextSession: Session | null) => {
      if (!mounted) return;
      window.clearTimeout(timeoutId);
      setSession(nextSession);
      setAuthLoading(false);
    };

    void supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error) {
          setAuthError('We could not verify your session. Please sign in again.');
          finishSessionCheck(null);
        } else {
          finishSessionCheck(data.session);
        }
      })
      .catch(() => {
        if (mounted) {
          setAuthError('We could not verify your session. Please sign in again.');
          finishSessionCheck(null);
        }
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      if (!mounted) return;
      finishSessionCheck(next);
      if (event === 'PASSWORD_RECOVERY') setAuthMode('reset');
    });

    return () => {
      mounted = false;
      window.clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (window.location.hash.includes('type=recovery')) setAuthMode('reset');
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const dark = themeChoice === 'dark' || (themeChoice === 'system' && media.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    };
    applyTheme();
    window.localStorage.setItem('fridge-to-fork:theme', themeChoice);
    media.addEventListener?.('change', applyTheme);
    return () => media.removeEventListener?.('change', applyTheme);
  }, [themeChoice]);

  useEffect(() => { if (session?.user) void loadData(); else { setInventory([]); setRecipes([]); } }, [session?.user?.id]);

  async function loadData() {
    setLoading(true); setRecipeLoading(true); setRecipeError(''); setNotice('');
    const userId = session?.user?.id;
    const [inv, rec, ing, saved, prof] = await Promise.all([
      userId ? listActiveInventory(supabase, userId) : Promise.resolve({ data: [] as InventoryItem[], error: null }),
      listRecipes(supabase),
      listIngredients(supabase),
      userId ? listSavedRecipeIds(supabase, userId) : Promise.resolve({ data: [] as { recipe_id: string }[], error: null }),
      supabase.from('profiles').select('*').single(),
    ]);
    if (inv.error) setNotice(`Could not load kitchen: ${inv.error.message}`); else setInventory((inv.data ?? []) as InventoryItem[]);
    if (saved.error) setNotice(`Could not load saved recipes: ${saved.error.message}`);
    else {
      const ids = new Set((saved.data ?? []).map(row => row.recipe_id));
      setSavedRecipeIds(ids);
      setSavedRecipeCount(ids.size);
    }
    if (rec.error) {
      const message = 'We could not load the recipe library. Please try again.';
      setRecipeError(message);
      setRecipes([]);
    } else {
      if (ing.error) {
        setRecipeError('We could not load the ingredient names for the recipe library. Please try again.');
        setRecipes([]);
      } else {
        const ingredientNames = new Map((ing.data ?? []).map((ingredient: { id: string; canonical_name: string }) => [ingredient.id, ingredient.canonical_name]));
        const unmappedCount = (rec.data as RecipeRow[] ?? []).reduce((count, recipe) => count + (recipe.recipe_ingredients ?? []).filter(link => !ingredientNames.has(link.ingredient_id)).length, 0);
        if (unmappedCount > 0) setNotice(`${unmappedCount} recipe ingredient link${unmappedCount === 1 ? '' : 's'} could not be resolved to ingredient names.`);
        setRecipes((rec.data as RecipeRow[] ?? []).map(r => ({
          ...r,
          instructions: r.instructions ?? [],
          tags: r.tags ?? [],
          allergens: r.allergens ?? [],
          source_status: r.verification_status,
          ingredients: (r.recipe_ingredients ?? []).flatMap(x => {
            const ingredientName = ingredientNames.get(x.ingredient_id);
            return ingredientName ? [{ ingredient_id: x.ingredient_id, ingredient_name: ingredientName, quantity: Number(x.quantity), unit: x.unit, optional: x.optional }] : [];
          }),
        })));
      }
    }
    setRecipeLoading(false);
    if (!prof.error) {
      const nextProfile = prof.data ?? {};
      setProfile(nextProfile);
      if (!localStorage.getItem(`fridge-to-fork:onboarding:${session?.user?.id}`) && !hasProfilePreferences(nextProfile)) setOnboarding(true);
    }
    setShoppingLoading(true);
    if (userId) {
      const listResult = await getOrCreateShoppingList(supabase, userId);
      if (listResult.error) {
        setNotice(`Could not load shopping list: ${listResult.error.message}`);
      } else if (listResult.data) {
        setShoppingListId(listResult.data.id);
        const itemsResult = await listShoppingItems(supabase, listResult.data.id);
        if (itemsResult.error) setNotice(`Could not load shopping items: ${itemsResult.error.message}`);
        else setShopping((itemsResult.data ?? []) as ShoppingItem[]);
      }
    }
    setShoppingLoading(false);

    const todayDate = new Date();
    const startDate = todayDate.toISOString().slice(0, 10);
    const end = new Date(todayDate);
    end.setDate(end.getDate() + 6);
    const endDate = end.toISOString().slice(0, 10);
    setMealPlanLoading(true);
    if (userId) {
      const planResult = await listMealPlans(supabase, userId, startDate, endDate);
      if (planResult.error) setNotice(`Could not load meal plans: ${planResult.error.message}`);
      else setMealPlans((planResult.data ?? []) as MealPlanRow[]);
    } else {
      setMealPlans([]);
    }
    setMealPlanLoading(false);
    setLoading(false);
  }

  async function authenticate(event: React.FormEvent) {
    event.preventDefault(); setAuthBusy(true); setAuthError(''); setNotice('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setAuthError('Enter a valid email address.'); setAuthBusy(false); return; }
    if (authMode === 'signup' && displayName.trim().length < 2) { setAuthError('Enter a name with at least 2 characters.'); setAuthBusy(false); return; }
    if (password.length < 8) { setAuthError('Password must be at least 8 characters.'); setAuthBusy(false); return; }
    if (authMode === 'signup' && password !== confirmPassword) { setAuthError('Passwords do not match.'); setAuthBusy(false); return; }
    try {
      const result = authMode === 'signup'
        ? await supabase.auth.signUp({ email: email.trim().toLowerCase(), password, options: { data: { display_name: displayName.trim() } } })
        : await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (result.error) throw result.error;
      if (authMode === 'signup' && !result.data.session) { setNotice('Account created. Check your email to confirm your account, then sign in.'); setAuthMode('login'); setPassword(''); setConfirmPassword(''); }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication failed. Please try again.';
      setAuthError(/rate limit|too many requests/i.test(message) ? 'Too many authentication attempts. Please wait a moment before trying again.' : /invalid login credentials/i.test(message) ? 'That email or password is not correct.' : /email not confirmed/i.test(message) ? 'Please confirm your email address before signing in.' : /already registered|already exists/i.test(message) ? 'An account with this email already exists. Try signing in instead.' : message);
    } finally { setAuthBusy(false); }
  }

  async function requestPasswordReset(event: React.FormEvent) {
    event.preventDefault(); setAuthBusy(true); setAuthError(''); setNotice('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setAuthError('Enter a valid email address.'); setAuthBusy(false); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: `${window.location.origin}/` });
    if (error) setAuthError(/rate limit|too many requests/i.test(error.message) ? 'Too many requests. Please wait a moment before trying again.' : 'We could not send the reset email. Please try again.');
    else setNotice('If an account exists for this email, you will receive a password reset link shortly.');
    setAuthBusy(false);
  }

  async function resetPassword(event: React.FormEvent) {
    event.preventDefault(); setAuthBusy(true); setAuthError(''); setNotice('');
    if (password.length < 8) { setAuthError('Password must be at least 8 characters.'); setAuthBusy(false); return; }
    if (password !== confirmPassword) { setAuthError('Passwords do not match.'); setAuthBusy(false); return; }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setAuthError(/expired|invalid/i.test(error.message) ? 'This reset link has expired. Request a new one and try again.' : 'We could not update your password. Please request a new reset link.');
    else { setNotice('Your password has been updated. You can now continue to your kitchen.'); setPassword(''); setConfirmPassword(''); setAuthMode('login'); await supabase.auth.signOut(); }
    setAuthBusy(false);
  }

  async function saveIngredient(event: React.FormEvent) {
    event.preventDefault();
    if (inventoryBusy) return;
    const parsedQuantity = Number(quantity);
    if (!ingredientName.trim() || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setNotice('Enter an ingredient name and a positive quantity.');
      return;
    }
    if (!session?.user) { setNotice('Your session has expired. Please sign in again.'); return; }

    setInventoryBusy(true);
    const input = {
      ingredient_name: ingredientName.trim(),
      quantity: parsedQuantity,
      unit,
      expiry_date: expiry || null,
      storage_location: storage,
    };
    const result = editingIngredient
      ? await updateInventoryItem(supabase, session.user.id, editingIngredient.id, input)
      : await createInventoryItem(supabase, session.user.id, input);

    setInventoryBusy(false);
    if (result.error) {
      setNotice(`Could not ${editingIngredient ? 'update' : 'add'} ingredient: ${result.error.message}`);
      return;
    }
    setNotice(editingIngredient ? `${ingredientName.trim()} updated.` : `${ingredientName.trim()} added.`);
    setShowAdd(false);
    resetIngredientForm();
    await loadData();
  }

  function resetIngredientForm() {
    setIngredientName(''); setQuantity('1'); setUnit('units'); setExpiry(''); setStorage('refrigerator'); setEditingIngredient(null);
  }
  function startEditingIngredient(item: InventoryItem) {
    setEditingIngredient(item);
    setIngredientName(item.ingredient_name);
    setQuantity(String(item.quantity));
    setUnit(item.unit);
    setStorage(item.storage_location);
    setExpiry(item.expiry_date ?? '');
    setShowAdd(true);
  }
  async function removeIngredient(item: InventoryItem) {
    if (!window.confirm(`Remove ${item.ingredient_name} from your kitchen?`)) return;
    if (!session?.user) { setNotice('Your session has expired. Please sign in again.'); return; }
    if (inventoryBusy) return;
    setInventoryBusy(true);
    const { error } = await deleteInventoryItem(supabase, session.user.id, item.id);
    setInventoryBusy(false);
    if (error) setNotice(`Could not remove item: ${error.message}`);
    else { setInventory(items => items.filter(x => x.id !== item.id)); setNotice(`${item.ingredient_name} removed.`); }
  }

  async function requestPasswordResetFromSettings() {
    if (!currentUser?.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(currentUser.email, { redirectTo: `${window.location.origin}/` });
    setNotice(error ? 'Could not send the password reset email. Please try again.' : 'A password reset link has been sent to your email.');
  }

  async function signOut() {
    setLogoutConfirmOpen(false);
    setProfilePanelOpen(false);
    setSettingsOpen(false);
    const { error } = await supabase.auth.signOut();
    if (error) setNotice(`Could not sign out: ${error.message}`);
    else {
      setSession(null);
      setSection('home');
      setNotice('');
    }
  }
  async function completeOnboarding(preferences: Profile) {
    const nextProfile = { ...profile, ...preferences };
    if (session?.user) {
      const { error } = await supabase.from('profiles').update(preferences).eq('id', session.user.id);
      if (error) { setNotice(`Could not save preferences: ${error.message}`); return; }
      localStorage.setItem(`fridge-to-fork:onboarding:${session.user.id}`, 'complete');
    }
    setProfile(nextProfile); setOnboarding(false); setOnboardingStep(0); setNotice('Your preferences are saved and recipe recommendations are personalized.');
  }

  const expiring = inventory.filter(i => i.expiry_date && i.expiry_date <= new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10));
  const matches = useMemo(() => matchRecipes(recipes.filter(recipe => {
    const diet = profile.diet ?? 'unspecified';
    const allergyTerms = (profile.allergies ?? []).concat(profile.disliked_foods ?? []).map(value => value.toLowerCase());
    const recipeText = [recipe.name, ...(recipe.allergens ?? []), ...recipe.ingredients.map(item => item.ingredient_name)].join(' ').toLowerCase();
    const dietAllowed = diet === 'unspecified' || diet === 'non_vegetarian' || recipe.diet === diet || (diet === 'vegetarian' && recipe.diet === 'vegan');
    return dietAllowed && !allergyTerms.some(term => recipeText.includes(term));
  }), inventory, 100), [recipes, inventory, profile]);
  const filteredInventory = inventory.filter(i => i.ingredient_name.toLowerCase().includes(search.toLowerCase()));
  const filteredRecipes = matches.filter(({ recipe }) => recipe.name.toLowerCase().includes(recipeSearch.toLowerCase()) || recipe.tags.some(tag => tag.toLowerCase().includes(recipeSearch.toLowerCase())));
  const currentUser = session?.user;
  async function ensureShoppingList() {
    if (!session?.user) return null;
    if (shoppingListId) return shoppingListId;
    const result = await getOrCreateShoppingList(supabase, session.user.id);
    if (result.error) { setNotice(`Could not open shopping list: ${result.error.message}`); return null; }
    if (result.data) setShoppingListId(result.data.id);
    return result.data?.id ?? null;
  }
  async function addShoppingItem(name: string, quantity = 1, unit = 'units') {
    const trimmed = name.trim();
    if (!trimmed) { setNotice('Enter an item name before adding it.'); return false; }
    if (shoppingBusy) return false;
    if (shopping.some(item => item.ingredient_name.toLowerCase() === trimmed.toLowerCase() && !item.checked)) {
      setNotice(`${trimmed} is already on your shopping list.`); return false;
    }
    const listId = await ensureShoppingList();
    if (!listId) return false;
    setShoppingBusy(true);
    const result = await createShoppingItem(supabase, listId, { ingredient_name: trimmed, quantity, unit, checked: false });
    setShoppingBusy(false);
    if (result.error) { setNotice(`Could not add ${trimmed}: ${result.error.message}`); return false; }
    if (result.data) setShopping(items => [...items, result.data as ShoppingItem]);
    setNotice(`${trimmed} added to your shopping list.`);
    return true;
  }
  async function updateShoppingItemField(item: ShoppingItem, changes: Partial<Omit<ShoppingItem, 'id'>>) {
    if (!shoppingListId || shoppingBusy) return;
    setShoppingBusy(true);
    const result = await updateShoppingItem(supabase, shoppingListId, item.id, changes);
    setShoppingBusy(false);
    if (result.error) { setNotice(`Could not update ${item.ingredient_name}: ${result.error.message}`); return; }
    if (result.data) setShopping(items => items.map(current => current.id === item.id ? result.data as ShoppingItem : current));
  }
  async function removeShoppingItem(item: ShoppingItem) {
    if (!shoppingListId || shoppingBusy) return;
    setShoppingBusy(true);
    const result = await deleteShoppingItem(supabase, shoppingListId, item.id);
    setShoppingBusy(false);
    if (result.error) { setNotice(`Could not remove ${item.ingredient_name}: ${result.error.message}`); return; }
    setShopping(items => items.filter(current => current.id !== item.id));
  }
  async function toggleSavedRecipe(recipeId: string) {
    if (!session?.user || savedRecipeBusy) return;
    setSavedRecipeBusy(true);
    const isSaved = savedRecipeIds.has(recipeId);
    const result = isSaved
      ? await unsaveRecipe(supabase, session.user.id, recipeId)
      : await saveRecipe(supabase, session.user.id, recipeId);
    setSavedRecipeBusy(false);
    if (result.error) { setNotice(`Could not ${isSaved ? 'remove' : 'save'} recipe: ${result.error.message}`); return; }
    setSavedRecipeIds(current => {
      const next = new Set(current);
      if (isSaved) next.delete(recipeId); else next.add(recipeId);
      setSavedRecipeCount(next.size);
      return next;
    });
    setNotice(isSaved ? 'Recipe removed from saved recipes.' : 'Recipe saved.');
  }

  async function clearPurchasedItems() {
    if (!shoppingListId || shoppingBusy || !session?.user) return;
    const purchased = shopping.filter(item => item.checked);
    if (!purchased.length) { setNotice('No purchased items to transfer.'); return; }

    setShoppingBusy(true);
    const transfer = await transferPurchasedToInventory(supabase, session.user.id, purchased);
    if (transfer.error) {
      setShoppingBusy(false);
      setNotice(`Could not transfer purchased items: ${transfer.error.message}`);
      return;
    }

    const clearResult = await clearPurchasedShoppingItems(supabase, shoppingListId);
    if (clearResult.error) {
      if ('rollback' in transfer && typeof transfer.rollback === 'function') await transfer.rollback();
      setShoppingBusy(false);
      setNotice(`Purchased items could not be cleared, so inventory changes were reversed: ${clearResult.error.message}`);
      await loadData();
      return;
    }

    setShopping(items => items.filter(item => !item.checked));
    setShoppingBusy(false);
    await loadData();
    setNotice(`${purchased.length} purchased item${purchased.length === 1 ? '' : 's'} added to My Kitchen.`);
  }

  async function saveMealPlan(planDate: string, mealSlot: MealPlanRow['meal_slot'], recipeId: string) {
    if (!session?.user || mealPlanBusy) return;
    setMealPlanBusy(true);
    const result = await upsertMealPlan(supabase, session.user.id, planDate, mealSlot, recipeId, profile.household_size ?? 1);
    setMealPlanBusy(false);
    if (result.error) { setNotice(`Could not save planned meal: ${result.error.message}`); return; }
    if (result.data) {
      setMealPlans(plans => {
        const next = plans.filter(plan => !(plan.plan_date === planDate && plan.meal_slot === mealSlot));
        return [...next, result.data as MealPlanRow];
      });
      setNotice('Meal plan saved.');
    }
  }

  async function deleteMealPlan(planDate: string, mealSlot: MealPlanRow['meal_slot']) {
    if (!session?.user || mealPlanBusy) return;
    setMealPlanBusy(true);
    const result = await removeMealPlan(supabase, session.user.id, planDate, mealSlot);
    setMealPlanBusy(false);
    if (result.error) { setNotice(`Could not remove planned meal: ${result.error.message}`); return; }
    setMealPlans(plans => plans.filter(plan => !(plan.plan_date === planDate && plan.meal_slot === mealSlot)));
    setNotice('Planned meal removed.');
  }

  if (authLoading) return <main className="auth-page"><div className="auth-form-wrap"><p className="muted">Checking your session…</p></div></main>;
  if (authMode === 'reset') return <AuthScreen {...{ authMode, setAuthMode, email, setEmail, password, setPassword, confirmPassword, setConfirmPassword, displayName, setDisplayName, authBusy, authError, notice, authenticate, requestPasswordReset, resetPassword }} />;
  if (!session) return <AuthScreen {...{ authMode, setAuthMode, email, setEmail, password, setPassword, confirmPassword, setConfirmPassword, displayName, setDisplayName, authBusy, authError, notice, authenticate, requestPasswordReset, resetPassword }} />;
  if (onboarding) return <Onboarding profile={profile} step={onboardingStep} setStep={setOnboardingStep} onComplete={completeOnboarding} />;

  return <div className="app-shell">
    <main className="main-area">
      <header className="topbar"><div className="brand"><span className="brand-mark"><CookingPot size={20} /></span><span>fridge <i>to</i> fork</span></div><div className="page-context">{nav.find(item => item.id === section)?.label}</div><div className="profile-control"><button className="profile-trigger" onClick={() => { setProfilePanelOpen(true); }} aria-expanded={profilePanelOpen}><span className="avatar">{(profile.display_name || currentUser?.email || 'Y').slice(0, 1).toUpperCase()}</span><span className="profile-name">{profile.display_name || currentUser?.email?.split('@')[0]}</span></button></div></header>
      <div className="content-area">
        {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X size={15} /></button></div>}
        {section === 'home' && <HomeView {...{ profile, inventory, expiring, matches, mealPlans, shopping, savedRecipeCount, savedRecipeIds, savedRecipeBusy, toggleSavedRecipe, loading, shoppingLoading, mealPlanLoading, setSection, setSelectedRecipe, setShowScanner }} />}
        {section === 'planner' && <PlannerView {...{ matches, mealPlans, mealPlanLoading, mealPlanBusy, saveMealPlan, deleteMealPlan, setSelectedRecipe }} />}
        {section === 'recipes' && <RecipesView {...{ filteredRecipes, recipeSearch, setRecipeSearch, setSelectedRecipe, savedRecipeIds, savedRecipeBusy, toggleSavedRecipe, recipeLoading, recipeError, onRetry: () => void loadData() }} />}
        {section === 'kitchen' && <KitchenView {...{ filteredInventory, search, setSearch, setShowAdd, startEditingIngredient, removeIngredient, loading, inventoryBusy }} />}
        {section === 'shopping' && <ShoppingView shopping={shopping} search={shoppingSearch} setSearch={setShoppingSearch} draft={shoppingDraft} setDraft={setShoppingDraft} onAdd={addShoppingItem} onUpdateItem={updateShoppingItemField} onDeleteItem={removeShoppingItem} onClearPurchased={clearPurchasedItems} loading={shoppingLoading} busy={shoppingBusy} setNotice={setNotice} />}
        {selectedRecipe && <RecipeDetail recipe={selectedRecipe} inventory={inventory} saved={savedRecipeIds.has(selectedRecipe.id)} savedBusy={savedRecipeBusy} onToggleSaved={() => void toggleSavedRecipe(selectedRecipe.id)} onClose={() => setSelectedRecipe(null)} onAddMissing={(item) => { void addShoppingItem(item.ingredient_name, item.quantity, item.unit); }} />}
      </div>
    </main>
    <nav className="bottom-nav">{nav.map(item => <button key={item.id} className={section === item.id ? 'active' : ''} onClick={() => { setSection(item.id); setSelectedRecipe(null); }}><item.icon size={18} /><span>{item.label}</span></button>)}</nav>
    {profilePanelOpen && <ProfileSettingsModal mode="profile" profile={profile} email={currentUser?.email ?? ''} themeChoice={themeChoice} setThemeChoice={setThemeChoice} onEditPreferences={() => { setProfilePanelOpen(false); setOnboarding(true); }} onOpenSettings={() => { setProfilePanelOpen(false); setSettingsOpen(true); }} onClose={() => setProfilePanelOpen(false)} />}
    {settingsOpen && <ProfileSettingsModal mode="settings" profile={profile} email={currentUser?.email ?? ''} themeChoice={themeChoice} setThemeChoice={setThemeChoice} onEditPreferences={() => { setSettingsOpen(false); setOnboarding(true); }} onPasswordReset={() => void requestPasswordResetFromSettings()} onOpenSettings={() => undefined} onClose={() => setSettingsOpen(false)} onLogout={() => setLogoutConfirmOpen(true)} />}
    {logoutConfirmOpen && <LogoutConfirmModal onCancel={() => setLogoutConfirmOpen(false)} onConfirm={() => void signOut()} />}
    {showAdd && <AddIngredientModal {...{ ingredientName, setIngredientName, quantity, setQuantity, unit, setUnit, expiry, setExpiry, storage, setStorage, saveIngredient, setShowAdd, editingIngredient, inventoryBusy, resetIngredientForm }} />}
    {showScanner && <ScannerModal supabase={supabase} onClose={() => setShowScanner(false)} onConfirm={async detections => {
      if (!session?.user) { setNotice('Your session has expired. Please sign in again.'); return false; }
      let failures = 0;
      for (const item of detections) {
        const result = await createInventoryItem(supabase, session.user.id, { ingredient_name: item.name, quantity: item.quantity, unit: item.unit, storage_location: 'refrigerator', expiry_date: null });
        if (result.error) failures += 1;
      }
      if (failures) { setNotice(`${failures} scanned ingredient${failures === 1 ? '' : 's'} could not be added. Please try again.`); return false; }
      await loadData();
      setNotice(`${detections.length} scanned ingredient${detections.length === 1 ? '' : 's'} added to My Kitchen.`);
      setShowScanner(false);
      setSection('kitchen');
      return true;
    }} /> }
  </div>;
}

function AuthScreen(props: {
  authMode: 'login' | 'signup' | 'forgot' | 'reset';
  setAuthMode: (mode: 'login' | 'signup' | 'forgot' | 'reset') => void;
  email: string; setEmail: (value: string) => void;
  password: string; setPassword: (value: string) => void;
  confirmPassword: string; setConfirmPassword: (value: string) => void;
  displayName: string; setDisplayName: (value: string) => void;
  authBusy: boolean; authError: string; notice: string;
  authenticate: (event: React.FormEvent) => void;
  requestPasswordReset: (event: React.FormEvent) => void;
  resetPassword: (event: React.FormEvent) => void;
}) {
  const isForgot = props.authMode === 'forgot';
  const isReset = props.authMode === 'reset';
  const isSignup = props.authMode === 'signup';
  const submit = isForgot ? props.requestPasswordReset : isReset ? props.resetPassword : props.authenticate;
  return <main className="auth-page"><div className="auth-aside"><div className="brand brand-light"><span className="brand-mark"><CookingPot size={22} /></span><span>fridge <i>to</i> fork</span></div><div className="auth-hero"><p className="eyebrow light-eyebrow">A LITTLE MORE INTENTION. A LOT LESS WASTE.</p><h1>Your kitchen<br />has a story.<br /><em>Let’s cook it.</em></h1><p>Make something lovely with what you already have.</p></div></div><div className="auth-form-wrap"><form className="auth-form" onSubmit={submit}><p className="eyebrow">YOUR KITCHEN, REIMAGINED</p><h2>{isForgot ? 'Reset your password.' : isReset ? 'Choose a new password.' : props.authMode === 'login' ? 'Welcome back.' : 'Make yourself at home.'}</h2><p className="muted">{isForgot ? 'Enter your email and we’ll send you a secure reset link.' : isReset ? 'Use at least 8 characters for your new password.' : props.authMode === 'login' ? 'Sign in to pick up where you left off.' : 'Create an account to start making more of what you have.'}</p>{props.notice && <p className="form-notice role-status">{props.notice}</p>}{!isReset && <label>Email address<input type="email" value={props.email} onChange={event => props.setEmail(event.target.value)} autoComplete="email" required /></label>}{isSignup && <label>Your name<input value={props.displayName} onChange={event => props.setDisplayName(event.target.value)} autoComplete="name" required /></label>}{(!isForgot) && <label>Password<input type="password" value={props.password} onChange={event => props.setPassword(event.target.value)} minLength={8} autoComplete={isReset || isSignup ? 'new-password' : 'current-password'} required /></label>}{(isSignup || isReset) && <label>Confirm password<input type="password" value={props.confirmPassword} onChange={event => props.setConfirmPassword(event.target.value)} minLength={8} autoComplete="new-password" required /></label>}{props.authError && <p className="form-error" role="alert">{props.authError}</p>}<button className="primary-btn full-btn" disabled={props.authBusy}>{props.authBusy ? 'Please wait…' : isForgot ? 'Send reset link' : isReset ? 'Update password' : isSignup ? 'Create account' : 'Sign in'}</button>{!isReset && <p className="switch-auth">{isForgot ? '' : props.authMode === 'login' ? 'New to Fridge to Fork?' : 'Already have an account?'} <button type="button" className="text-btn" onClick={() => props.setAuthMode(isForgot ? 'login' : props.authMode === 'login' ? 'signup' : 'login')}>{isForgot ? 'Back to sign in' : props.authMode === 'login' ? 'Create an account' : 'Sign in'}</button></p>}{props.authMode === 'login' && <button type="button" className="text-btn" onClick={() => props.setAuthMode('forgot')}>Forgot password?</button>}{isReset && <button type="button" className="text-btn" onClick={() => props.setAuthMode('forgot')}>Request a new reset link</button>}<p className="security-note">Your account and kitchen data are private to you.</p></form></div></main>;
}
function Onboarding({ profile, step, setStep, onComplete }: { profile: Profile; step: number; setStep: (value: number) => void; onComplete: (value: Profile) => Promise<void> }) {
  const [diet, setDiet] = useState(profile.diet ?? 'unspecified');
  const [allergies, setAllergies] = useState<string[]>(profile.allergies ?? []);
  const [customAllergy, setCustomAllergy] = useState('');
  const [cuisines, setCuisines] = useState<string[]>(profile.preferred_cuisines ?? []);
  const [skill, setSkill] = useState(profile.cooking_skill ?? 'beginner');
  const [time, setTime] = useState(String(profile.max_cooking_minutes ?? ''));
  const [household, setHousehold] = useState(String(profile.household_size ?? 1));
  const [goal, setGoal] = useState(profile.fitness_goal ?? 'general_health');
  const [displayName, setDisplayName] = useState(profile.display_name ?? '');
  const [busy, setBusy] = useState(false);
  const steps = ['Welcome', 'Diet', 'Allergies', 'Preferences', 'Lifestyle', 'Goals', 'Ready'];
  const allergyOptions = ['Peanuts', 'Tree nuts', 'Dairy', 'Eggs', 'Soy', 'Gluten/wheat', 'Shellfish', 'Fish'];
  const cuisineOptions = ['Indian', 'South Indian', 'North Indian', 'Italian', 'Asian', 'Quick meals'];
  function toggle(value: string, values: string[], setter: (next: string[]) => void) { setter(values.includes(value) ? values.filter(item => item !== value) : [...values, value]); }
  async function finish() { setBusy(true); await onComplete({ display_name: displayName.trim(), diet, allergies: customAllergy.trim() ? [...allergies, customAllergy.trim()] : allergies, preferred_cuisines: cuisines, cooking_skill: skill, max_cooking_minutes: time ? Number(time) : null, household_size: Math.max(1, Number(household) || 1), fitness_goal: goal }); setBusy(false); }
  return <main className="onboarding-page"><section className="onboarding-card"><div className="onboarding-brand"><span className="brand-mark"><CookingPot size={20} /></span><span>fridge <i>to</i> fork</span></div><div className="onboarding-progress" aria-label={`Step ${step + 1} of ${steps.length}`}>{steps.map((label, index) => <span className={index <= step ? 'active' : ''} key={label} title={label} />)}</div><p className="eyebrow">PERSONALIZE YOUR KITCHEN</p>{step === 0 && <><h1>{profile.display_name ? `Welcome, ${profile.display_name.split(' ')[0]}.` : 'Welcome to Fridge to Fork.'}</h1><p className="onboarding-copy">A few thoughtful choices help us surface recipes and kitchen ideas that fit the way you eat and cook.</p><label className="onboarding-label">Display name<input value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={80} placeholder="Your name" /></label><div className="onboarding-note">Allergy restrictions will be treated as exclusions wherever recipe ingredient data is available.</div></>}{step === 1 && <ChoiceStep title="How do you like to eat?" options={[['vegetarian', 'Vegetarian'], ['vegan', 'Vegan'], ['eggetarian', 'Eggetarian'], ['non_vegetarian', 'Non-vegetarian'], ['unspecified', 'No specific preference']]} value={diet} onChange={setDiet} />}{step === 2 && <><h1>Anything to avoid?</h1><p className="onboarding-copy">Select allergies and restrictions. We will prioritize these over recipe matches.</p><div className="choice-grid">{allergyOptions.map(option => <button type="button" className={allergies.includes(option) ? 'choice active' : 'choice'} onClick={() => toggle(option, allergies, setAllergies)} key={option}>{option}</button>)}</div><label className="onboarding-label">Other restriction<input value={customAllergy} onChange={event => setCustomAllergy(event.target.value)} placeholder="e.g. sesame" /></label></>}{step === 3 && <><h1>What sounds good?</h1><p className="onboarding-copy">Choose cuisines you love. You can change these later.</p><div className="choice-grid">{cuisineOptions.map(option => <button type="button" className={cuisines.includes(option) ? 'choice active' : 'choice'} onClick={() => toggle(option, cuisines, setCuisines)} key={option}>{option}</button>)}</div></>}{step === 4 && <><h1>How do you cook?</h1><div className="onboarding-fields"><label className="onboarding-label">Cooking skill<select value={skill} onChange={event => setSkill(event.target.value)}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="confident">Advanced</option></select></label><label className="onboarding-label">Typical cooking time<select value={time} onChange={event => setTime(event.target.value)}><option value="">Flexible</option><option value="15">Under 15 minutes</option><option value="30">15–30 minutes</option><option value="60">30–60 minutes</option></select></label><label className="onboarding-label">Household size<input type="number" min="1" max="30" value={household} onChange={event => setHousehold(event.target.value)} /></label></div></>}{step === 5 && <><h1>Any goals to keep in mind?</h1><p className="onboarding-copy">This is optional and can be skipped.</p><ChoiceStep title="" options={[['general_health', 'General health'], ['maintenance', 'Balanced eating'], ['weight_loss', 'Weight loss'], ['muscle_gain', 'Muscle gain']]} value={goal} onChange={setGoal} /></>}{step === 6 && <><h1>Your kitchen, your preferences, your way.</h1><p className="onboarding-copy">Your recommendations will now prioritize your diet, restrictions, cooking time, and goals.</p><div className="onboarding-note">You can revisit these preferences anytime from your profile menu.</div></>}<div className="onboarding-actions">{step > 0 && <button className="outline-btn" onClick={() => setStep(step - 1)}><ChevronLeft size={16} /> Back</button>}<span />{step < steps.length - 1 ? <button className="primary-btn" onClick={() => setStep(step + 1)}>{step === 0 ? "Let's personalize" : 'Continue'} <ChevronRight size={16} /></button> : <button className="primary-btn" disabled={busy} onClick={() => void finish()}>{busy ? 'Saving…' : 'Explore my kitchen'}</button>}</div></section></main>;
}
function ProfileSettingsModal({ mode, profile, email, themeChoice, setThemeChoice, onEditPreferences, onPasswordReset, onOpenSettings, onClose, onLogout }: { mode: 'profile' | 'settings'; profile: Profile; email: string; themeChoice: 'light' | 'dark' | 'system'; setThemeChoice: (theme: 'light' | 'dark' | 'system') => void; onEditPreferences: () => void; onPasswordReset?: () => void; onOpenSettings: () => void; onClose: () => void; onLogout?: () => void }) {
  const preferenceLabels = (values?: string[]) => values?.length ? values.join(', ') : 'Not specified';
  return <div className="detail-backdrop" role="dialog" aria-modal="true" aria-labelledby="profile-settings-title"><article className="profile-settings-panel"><button className="icon-btn profile-panel-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
    {mode === 'profile' ? <><div className="profile-panel-header"><span className="profile-panel-avatar">{(profile.display_name || email || 'U').slice(0, 1).toUpperCase()}</span><div><p className="eyebrow">YOUR ACCOUNT</p><h2 id="profile-settings-title">{profile.display_name || 'Kitchen profile'}</h2><span>{email}</span></div></div><section className="settings-section"><div className="settings-section-heading"><div><p className="eyebrow">MY PREFERENCES</p><h3>Saved food choices</h3></div><button className="outline-btn" onClick={onEditPreferences}>Edit preferences</button></div><div className="preference-grid"><div><span>Diet</span><strong>{profile.diet?.replace('_', ' ') || 'Not specified'}</strong></div><div><span>Cooking skill</span><strong>{profile.cooking_skill || 'Not specified'}</strong></div><div><span>Cooking time</span><strong>{profile.max_cooking_minutes ? `${profile.max_cooking_minutes} minutes` : 'Flexible'}</strong></div><div><span>Household size</span><strong>{profile.household_size || 1} {profile.household_size === 1 ? 'person' : 'people'}</strong></div><div><span>Allergies</span><strong>{preferenceLabels(profile.allergies)}</strong></div><div><span>Disliked foods</span><strong>{preferenceLabels(profile.disliked_foods)}</strong></div><div><span>Cuisines</span><strong>{preferenceLabels(profile.preferred_cuisines)}</strong></div><div><span>Goal</span><strong>{profile.fitness_goal?.replace('_', ' ') || 'Not specified'}</strong></div></div></section><button className="settings-row settings-row-button" onClick={onOpenSettings}><span><strong>Settings</strong><small>Appearance, account, and app information</small></span><ChevronRight size={18} /></button></> : <><div className="profile-panel-header settings-panel-header"><span className="settings-panel-icon"><SettingsIcon size={20} /></span><div><p className="eyebrow">FRIDGE TO FORK</p><h2 id="profile-settings-title">Settings</h2></div></div><section className="settings-section"><h3>Appearance</h3><div className="theme-options">{(['light', 'dark', 'system'] as const).map(theme => <button type="button" key={theme} className={themeChoice === theme ? 'theme-option active' : 'theme-option'} onClick={() => setThemeChoice(theme)}><span className={`theme-preview ${theme}`}>{theme === 'light' ? <Sun size={18} /> : theme === 'dark' ? <Moon size={18} /> : <Monitor size={18} />}</span><strong>{theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System'}</strong></button>)}</div></section><section className="settings-section"><h3>Account</h3><div className="settings-info-row"><span>Email</span><strong>{email}</strong></div><button className="settings-row settings-row-button" onClick={onPasswordReset}><span><strong>Password</strong><small>Use a reset link to change your password</small></span><ChevronRight size={18} /></button></section><section className="settings-section"><h3>Information</h3><button className="settings-row" onClick={() => window.alert('Privacy Policy: Fridge to Fork stores only the information needed to provide your personal kitchen experience.') }><span><strong>Privacy Policy</strong><small>How your data is used</small></span></button><button className="settings-row" onClick={() => window.alert('Terms of Service: Use Fridge to Fork responsibly. Recipe and nutrition information may require verification.') }><span><strong>Terms of Service</strong><small>App terms and usage</small></span></button><div className="settings-info-row"><span>About</span><strong>Fridge to Fork · Version 1.0</strong></div></section><button className="danger-settings-button" onClick={onLogout}>Sign out</button></>}
  </article></div>;
}

function LogoutConfirmModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return <div className="detail-backdrop" role="dialog" aria-modal="true" aria-labelledby="logout-title"><article className="confirm-modal"><p className="eyebrow">ACCOUNT</p><h2 id="logout-title">Sign out of Fridge to Fork?</h2><p className="muted">Your saved kitchen data, preferences, and plans will remain on your account.</p><div className="modal-actions"><button className="outline-btn" onClick={onCancel}>Cancel</button><button className="primary-btn" onClick={onConfirm}>Sign out</button></div></article></div>;
}

function ChoiceStep({ title, options, value, onChange }: { title: string; options: [string, string][]; value: string; onChange: (value: string) => void }) {
  return <><h1>{title}</h1><p className="onboarding-copy">Choose the option that feels most like you.</p><div className="choice-grid">{options.map(([key, label]) => <button type="button" className={value === key ? 'choice active' : 'choice'} onClick={() => onChange(key)} key={key}>{label}</button>)}</div></>;
}

function HomeView({ profile, inventory, expiring, matches, mealPlans, shopping, savedRecipeCount, savedRecipeIds, savedRecipeBusy, toggleSavedRecipe, loading, shoppingLoading, mealPlanLoading, setSection, setSelectedRecipe, setShowScanner }: { profile: Profile; inventory: InventoryItem[]; expiring: InventoryItem[]; matches: ReturnType<typeof matchRecipes>; mealPlans: MealPlanRow[]; shopping: ShoppingItem[]; savedRecipeCount: number; savedRecipeIds: Set<string>; savedRecipeBusy: boolean; toggleSavedRecipe: (recipeId: string) => void; loading: boolean; shoppingLoading: boolean; mealPlanLoading: boolean; setSection: (section: Section) => void; setSelectedRecipe: (recipe: Recipe) => void; setShowScanner: (value: boolean) => void }) {
  const todayDate = new Date().toISOString().slice(0, 10);
  const todayMeals = mealPlans.filter(plan => plan.plan_date === todayDate).length;
  const remainingShopping = shopping.filter(item => !item.checked).length;
  const dataLoading = loading || shoppingLoading || mealPlanLoading;
  return <><section className="welcome-row"><div><p className="eyebrow">YOUR KITCHEN, AT A GLANCE</p><h1>{profile.display_name ? `Hello, ${profile.display_name.split(' ')[0]}.` : 'Welcome to your kitchen.'}</h1><p className="welcome-sub">{dataLoading ? 'Checking today’s kitchen details…' : `${inventory.length} ingredients on hand · ${todayMeals} planned today · ${remainingShopping} shopping items remaining · ${savedRecipeCount} saved recipes · ${matches.length} recipe ideas matched.`}</p></div><div className="header-actions"><button className="primary-btn" onClick={() => setShowScanner(true)}><ScanLine size={17} /> Scan ingredients</button><button className="outline-btn" onClick={() => setSection('recipes')}>Find something to cook</button></div></section><section className="hero-banner"><div className="hero-copy"><span className="hero-kicker">COOK WHAT YOU HAVE</span><h2>Good food is<br /><em>closer than you think.</em></h2><p>Use your kitchen first. We’ll help with the rest.</p><button className="cream-btn" onClick={() => setSection('recipes')}>Explore recipes <span>↗</span></button></div><div className="hero-illustration" aria-hidden="true">{matches[0] ? <FoodImage recipe={matches[0].recipe} className="hero-food-image" /> : <div className="hero-photo-fallback" />}</div></section><section className="stats-grid"><Stat label="In your kitchen" value={inventory.length} /><Stat label="Use soon" value={expiring.length} /><Stat label="Recipe matches" value={matches.length} /></section><section className="section-heading"><div><p className="eyebrow">USE SOON</p><h2>Ingredients that need attention</h2></div><button className="inline-link" onClick={() => setSection('kitchen')}>Manage kitchen →</button></section>{loading ? <div className="empty-state">Checking your kitchen…</div> : <div className="expiry-grid">{expiring.slice(0, 4).map(item => <div className="expiry-item" key={item.id}><strong>{item.ingredient_name}</strong><span>{item.quantity} {item.unit}</span><small>{item.expiry_date === today ? 'Expires today' : `Use by ${item.expiry_date}`}</small></div>)}{!expiring.length && <div className="gentle-empty">Nothing is approaching expiry.</div>}</div>}<section className="section-heading recipe-heading"><div><p className="eyebrow">MATCHED TO YOUR KITCHEN</p><h2>Meal inspiration</h2></div><button className="inline-link" onClick={() => setSection('recipes')}>Explore all recipes →</button></section><RecipeCards matches={matches.slice(0, 4)} savedRecipeIds={savedRecipeIds} savedRecipeBusy={savedRecipeBusy} toggleSavedRecipe={toggleSavedRecipe} onSelect={setSelectedRecipe} /></>;
}

function Stat({ label, value }: { label: string; value: number }) { return <div className="stat-card"><span>{label}</span><strong>{value.toString().padStart(2, '0')}</strong></div>; }
function RecipesView({ filteredRecipes, recipeSearch, setRecipeSearch, setSelectedRecipe, savedRecipeIds, savedRecipeBusy, toggleSavedRecipe, recipeLoading, recipeError, onRetry }: { filteredRecipes: ReturnType<typeof matchRecipes>; recipeSearch: string; setRecipeSearch: (value: string) => void; setSelectedRecipe: (recipe: Recipe) => void; savedRecipeIds: Set<string>; savedRecipeBusy: boolean; toggleSavedRecipe: (recipeId: string) => void; recipeLoading: boolean; recipeError: string; onRetry: () => void }) {
  return <><section className="page-intro"><div><p className="eyebrow">FROM YOUR RECIPE LIBRARY</p><h1>Recipes</h1><p className="welcome-sub">Search the recipes available in your Supabase recipe library.</p></div></section><div className="search-box wide"><Search size={17} /><input value={recipeSearch} onChange={event => setRecipeSearch(event.target.value)} placeholder="Search recipes or tags…" /></div>{recipeLoading ? <div className="empty-state">Loading recipes…</div> : recipeError ? <div className="empty-state"><h3>Couldn’t load recipes</h3><p>{recipeError}</p><button className="outline-btn" onClick={onRetry}>Try again</button></div> : !filteredRecipes.length ? <div className="empty-state"><ChefHat size={28} /><h3>{recipeSearch ? 'No matching recipes' : 'No recipes available yet'}</h3><p>{recipeSearch ? 'Try a different recipe name or tag.' : 'Your recipe library is empty.'}</p></div> : <RecipeCards matches={filteredRecipes} savedRecipeIds={savedRecipeIds} savedRecipeBusy={savedRecipeBusy} toggleSavedRecipe={toggleSavedRecipe} onSelect={setSelectedRecipe} />}</>;
}
function FoodImage({ recipe, className = '' }: { recipe: { name: string; image_url?: string | null }; className?: string }) {
  const primary = getRecipeImage(recipe);
  return <img className={className} src={primary} alt={recipe.name} loading="lazy" onError={event => { const image = event.currentTarget; if (image.src !== FALLBACK_FOOD_IMAGE) { image.src = FALLBACK_FOOD_IMAGE; } }} />;
}

function RecipeCards({ matches, savedRecipeIds, savedRecipeBusy, toggleSavedRecipe, onSelect }: { matches: ReturnType<typeof matchRecipes>; savedRecipeIds: Set<string>; savedRecipeBusy: boolean; toggleSavedRecipe: (recipeId: string) => void; onSelect: (recipe: Recipe) => void }) { if (!matches.length) return <div className="empty-state"><ChefHat size={28} /><h3>No recipes found</h3><p>Try another search or add ingredients to your kitchen.</p></div>; return <div className="recipe-grid">{matches.map(({ recipe, available, missing, coverage }) => <article className="recipe-card" key={recipe.id} tabIndex={0} onClick={() => onSelect(recipe)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') onSelect(recipe); }}><div className="recipe-image"><FoodImage recipe={recipe} className="recipe-card-image" /><span className="recipe-image-region">{recipe.region}</span></div><div className="recipe-body"><div className="recipe-title-row"><h3>{recipe.name}</h3><div className="recipe-card-actions"><b>{coverage}%</b><button type="button" className={savedRecipeIds.has(recipe.id) ? 'text-btn saved-recipe active' : 'text-btn saved-recipe'} disabled={savedRecipeBusy} onClick={event => { event.stopPropagation(); toggleSavedRecipe(recipe.id); }}>{savedRecipeIds.has(recipe.id) ? 'Saved' : 'Save'}</button></div></div><div className="recipe-meta"><span>{recipe.prep_minutes + recipe.cook_minutes} min</span><span>{recipe.difficulty}</span><span>{recipe.diet.replace('_', ' ')}</span></div><p>{available.length} available · {missing.length} missing</p><button className="inline-link" onClick={event => { event.stopPropagation(); onSelect(recipe); }}>View recipe →</button></div></article>)}</div>; }
function RecipeDetail({ recipe, inventory, saved, savedBusy, onToggleSaved, onClose, onAddMissing }: { recipe: Recipe; inventory: InventoryItem[]; saved: boolean; savedBusy: boolean; onToggleSaved: () => void; onClose: () => void; onAddMissing: (item: RecipeIngredient) => void }) {
  const owned = new Set(inventory.map(item => item.ingredient_name.toLowerCase()));
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [cookMode, setCookMode] = useState(false);
  const [step, setStep] = useState(0);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onClose]);
  function toggleIngredient(name: string) { setChecked(current => { const next = new Set(current); if (next.has(name)) next.delete(name); else next.add(name); return next; }); }
  const instructions = recipe.instructions ?? [];
  return <div className="detail-backdrop" role="dialog" aria-modal="true" aria-labelledby="recipe-detail-title"><article className={cookMode ? 'recipe-detail cook-mode' : 'recipe-detail'}><button className="icon-btn" onClick={onClose} aria-label="Close recipe"><X size={19} /></button>{cookMode ? <><p className="eyebrow">COOK MODE · STEP {step + 1} OF {instructions.length}</p><h2 id="recipe-detail-title">{recipe.name}</h2><div className="cook-progress"><span style={{ width: `${instructions.length ? ((step + 1) / instructions.length) * 100 : 0}%` }} /></div>{instructions.length ? <p className="cook-step">{instructions[step]}</p> : <p className="muted">Instructions are not available for this recipe.</p>}<div className="modal-actions"><button className="outline-btn" disabled={step === 0} onClick={() => setStep(value => value - 1)}><ChevronLeft size={16} /> Previous</button><button className="primary-btn" disabled={!instructions.length || step === instructions.length - 1} onClick={() => setStep(value => value + 1)}>Next <ChevronRight size={16} /></button></div><button className="text-btn" onClick={() => setCookMode(false)}>Exit Cook Mode</button></> : <><p className="eyebrow">{recipe.region} · {recipe.diet.replace('_', ' ')}</p><FoodImage recipe={recipe} className="recipe-detail-image" /><h2 id="recipe-detail-title">{recipe.name}</h2><p className="recipe-meta">{recipe.prep_minutes} min prep · {recipe.cook_minutes} min cook · Serves {recipe.servings}</p><div className="recipe-detail-actions"><button className="primary-btn cook-launch" onClick={() => { setStep(0); setCookMode(true); }} disabled={!instructions.length}>Start Cook Mode</button><button className="outline-btn" disabled={savedBusy} onClick={onToggleSaved}>{saved ? 'Unsave recipe' : 'Save recipe'}</button></div><h3>Ingredients <span className="detail-count">{checked.size}/{recipe.ingredients.length} ready</span></h3><ul>{recipe.ingredients.map((item, ingredientIndex) => <li key={item.ingredient_id ? `ingredient-${item.ingredient_id}` : `ingredient-row-${recipe.id}-${ingredientIndex}`}><label className={checked.has(item.ingredient_name) ? 'ingredient-check checked' : 'ingredient-check'}><input type="checkbox" checked={checked.has(item.ingredient_name)} onChange={() => toggleIngredient(item.ingredient_name)} /><span>{item.quantity} {item.unit} {item.ingredient_name}</span></label>{owned.has(item.ingredient_name.toLowerCase()) ? <small className="have-pill">In your kitchen</small> : <button className="inline-link" onClick={() => onAddMissing(item)}>Add to shopping</button>}</li>)}</ul><h3>Instructions</h3>{instructions.length ? <ol>{instructions.map((instruction, index) => <li key={`${instruction}-${index}`}>{instruction}</li>)}</ol> : <p className="muted">Instructions are not available for this recipe.</p>}<p className="recipe-disclaimer">Source status: {recipe.source_status === 'expert_verified' ? 'Reviewed recipe' : 'Seed recipe · needs source review'}</p></>}</article></div>;
}
function KitchenView({ filteredInventory, search, setSearch, setShowAdd, startEditingIngredient, removeIngredient, loading, inventoryBusy }: { filteredInventory: InventoryItem[]; search: string; setSearch: (value: string) => void; setShowAdd: (value: boolean) => void; startEditingIngredient: (item: InventoryItem) => void; removeIngredient: (item: InventoryItem) => Promise<void>; loading: boolean; inventoryBusy: boolean }) {
  return <><section className="page-intro"><div><p className="eyebrow">KNOW WHAT YOU HAVE</p><h1>My kitchen</h1></div><button className="primary-btn" onClick={() => setShowAdd(true)}><Plus size={17} /> Add ingredient</button></section><div className="search-box wide"><Search size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search your ingredients…" /></div>{loading ? <div className="empty-state">Loading ingredients…</div> : filteredInventory.length ? <div className="inventory-list">{filteredInventory.map(item => <div className="inventory-row" key={item.id}><div><strong>{item.ingredient_name}</strong><span>{item.quantity} {item.unit} · {item.storage_location}</span></div><small>{item.expiry_date ? `Expiry ${item.expiry_date}` : 'No expiry date'}</small><div className="inventory-actions"><button className="text-btn" disabled={inventoryBusy} onClick={() => startEditingIngredient(item)}>Edit</button><button className="icon-btn danger-hover" disabled={inventoryBusy} onClick={() => void removeIngredient(item)} aria-label={`Remove ${item.ingredient_name}`}><Trash2 size={17} /></button></div></div>)}</div> : <div className="empty-state"><h3>Your kitchen starts here.</h3><p>{search ? 'No ingredients match your search.' : 'Add ingredients to get useful matches.'}</p></div>}</>;
}
function PlannerView({ matches, mealPlans, mealPlanLoading, mealPlanBusy, saveMealPlan, deleteMealPlan, setSelectedRecipe }: { matches: ReturnType<typeof matchRecipes>; mealPlans: MealPlanRow[]; mealPlanLoading: boolean; mealPlanBusy: boolean; saveMealPlan: (date: string, slot: MealPlanRow['meal_slot'], recipeId: string) => Promise<void>; deleteMealPlan: (date: string, slot: MealPlanRow['meal_slot']) => Promise<void>; setSelectedRecipe: (recipe: Recipe) => void }) {
  const [selectedDay, setSelectedDay] = useState(0);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + index);
    return { key: date.toISOString().slice(0, 10), weekday: date.toLocaleDateString(undefined, { weekday: 'short' }), label: date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) };
  });
  const slots: MealPlanRow['meal_slot'][] = ['breakfast', 'lunch', 'dinner', 'snack'];
  const slotLabels: Record<MealPlanRow['meal_slot'], string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };
  const activeDay = days[selectedDay];
  return <><section className="page-intro"><div><p className="eyebrow">MAKE THE WEEK EASIER</p><h1>Meal planner</h1><p className="welcome-sub">Build a simple week around the recipes you already have.</p></div><span className="planner-save-note">Saved to your account</span></section><div className="planner-week" aria-label="Choose a day">{days.map((day, index) => <button key={day.key} className={index === selectedDay ? 'planner-day active' : 'planner-day'} onClick={() => setSelectedDay(index)}><span>{index === 0 ? 'Today' : day.weekday}</span><strong>{day.label.split(' ')[0]}</strong><small>{day.label.slice(day.label.indexOf(' ') + 1)}</small></button>)}</div><section className="planner-board"><div className="planner-board-heading"><div><p className="eyebrow">YOUR PLAN</p><h2>{selectedDay === 0 ? 'Today' : `${activeDay.weekday}, ${activeDay.label}`}</h2></div><span className="muted">Select a recipe to add a meal</span></div>{mealPlanLoading ? <div className="empty-state">Loading your meal plan…</div> : <div className="meal-slots">{slots.map(slot => { const plan = mealPlans.find(item => item.plan_date === activeDay.key && item.meal_slot === slot); const match = matches.find(item => item.recipe.id === plan?.recipe_id); return <article className={match ? 'meal-slot planned' : 'meal-slot'} key={slot}><div className="meal-slot-label"><span>{slotLabels[slot]}</span>{plan && <button className="text-btn" disabled={mealPlanBusy} onClick={() => void deleteMealPlan(activeDay.key, slot)}>Remove</button>}</div>{match ? <div className="planned-meal"><FoodImage recipe={match.recipe} className="mini-recipe-art" /><div><strong>{match.recipe.name}</strong><span>{match.recipe.prep_minutes + match.recipe.cook_minutes} min · {match.coverage}% match</span></div><button className="inline-link" onClick={() => setSelectedRecipe(match.recipe)}>View</button></div> : <label className="meal-picker"><span>{plan ? 'Saved recipe unavailable' : 'No meal planned'}</span><select aria-label={`Add ${slotLabels[slot]}`} value="" disabled={mealPlanBusy} onChange={event => { if (event.target.value) void saveMealPlan(activeDay.key, slot, event.target.value); }}><option value="">Add a recipe</option>{matches.map(item => <option value={item.recipe.id} key={item.recipe.id}>{item.recipe.name}</option>)}</select></label>}</article>; })}</div>}</section></>;
}
function ScannerModal({ supabase, onClose, onConfirm }: { supabase: SupabaseClient; onClose: () => void; onConfirm: (detections: { name: string; quantity: number; unit: string; confidence: number }[]) => Promise<boolean> }) {
  type Detection = { name: string; quantity: number; unit: string; confidence: number };
  type CatalogIngredient = { id: string; canonical_name: string; common_units: string[]; category: string };
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState('');
  const [cameraState, setCameraState] = useState<'starting' | 'live' | 'preview' | 'manual'>('starting');
  const [capturedImage, setCapturedImage] = useState('');
  const [detections, setDetections] = useState<Detection[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [catalog, setCatalog] = useState<CatalogIngredient[]>([]);
  const [ingredientLoading, setIngredientLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasCameraSwitch, setHasCameraSwitch] = useState(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async (mode: 'environment' | 'user') => {
    stopCamera();
    setCameraError('');
    setCameraState('starting');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Live camera is not supported in this browser. Use Upload Photo instead.');
      setCameraState('preview');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: mode } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      setHasCameraSwitch(devices.filter(device => device.kind === 'videoinput').length > 1);
      setCameraState('live');
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      setCameraError(name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access or use Upload Photo.' : name === 'NotFoundError' ? 'No camera was found on this device. Use Upload Photo instead.' : 'The camera could not start. Check camera access and try again.');
      setCameraState('preview');
    }
  }, [stopCamera]);

  useEffect(() => { void startCamera('environment'); return stopCamera; }, [startCamera, stopCamera]);

  useEffect(() => {
    if (cameraState !== 'manual') return;
    let cancelled = false;
    setIngredientLoading(true);
    const timeout = window.setTimeout(() => {
      void searchIngredients(supabase, searchTerm).then(result => {
        if (cancelled) return;
        if (result.error) setAnalysisError('Could not search ingredients. Please try again.');
        else setCatalog((result.data ?? []) as CatalogIngredient[]);
        setIngredientLoading(false);
      });
    }, 150);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [cameraState, searchTerm, supabase]);

  function closeScanner() { stopCamera(); onClose(); }

  function capturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) { setCameraError('The camera is still starting. Please wait a moment.'); return; }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) { setCameraError('This browser could not capture the photo.'); return; }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    setCapturedImage(canvas.toDataURL('image/jpeg', 0.82));
    setCameraState('preview');
    stopCamera();
  }

  function switchCamera() {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    void startCamera(next);
  }

  function uploadPhoto(file?: File) {
    if (!file) return;
    stopCamera();
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') { setCapturedImage(reader.result); setCameraState('preview'); }
    };
    reader.readAsDataURL(file);
  }

  function selectIngredient(item: CatalogIngredient) {
    if (detections.some(detection => detection.name.toLowerCase() === item.canonical_name.toLowerCase())) return;
    const preferredUnit = item.common_units?.[0] || 'units';
    setDetections(current => [...current, { name: item.canonical_name, quantity: 1, unit: preferredUnit, confidence: 0 }]);
  }

  function updateDetection(index: number, changes: Partial<Detection>) {
    setDetections(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item));
  }

  async function confirmDetections() {
    const valid = detections.filter(item => item.name.trim() && item.quantity > 0).map(item => ({ ...item, name: item.name.trim(), quantity: Number(item.quantity), confidence: 0 }));
    if (!valid.length) { setAnalysisError('Select at least one ingredient before confirming.'); return; }
    setSaving(true);
    const saved = await onConfirm(valid);
    setSaving(false);
    if (!saved) setAnalysisError('Some ingredients could not be added. Please try again.');
  }

  return <div className="detail-backdrop" role="dialog" aria-modal="true" aria-labelledby="scanner-title"><article className="scanner-modal"><button className="icon-btn" onClick={closeScanner} aria-label="Close scanner"><X size={19} /></button><p className="eyebrow">KITCHEN INTAKE</p><h2 id="scanner-title">Scan your ingredients</h2>
    {(cameraState === 'starting' || cameraState === 'live') && <><p className="muted">Point your back camera at vegetables, fruits, groceries, or items inside your fridge.</p><div className="scanner-camera"><video ref={videoRef} playsInline muted /></div><canvas ref={canvasRef} hidden /><div className="scanner-controls"><button className="outline-btn" onClick={closeScanner}>Cancel</button>{hasCameraSwitch && <button className="outline-btn" onClick={switchCamera}>Switch camera</button>}<button className="primary-btn" disabled={cameraState !== 'live'} onClick={capturePhoto}>Capture photo</button></div>{cameraError && <p className="form-error" role="alert">{cameraError}</p>}</>}
    {cameraState === 'preview' && <><p className="muted">Review the captured photo, then confirm which ingredients are visible.</p>{capturedImage ? <img className="scanner-preview" src={capturedImage} alt="Captured ingredients" /> : <label className="upload-zone"><Upload size={24} /><strong>Upload Photo</strong><span>Optional fallback if a camera is unavailable</span><input type="file" accept="image/*" onChange={event => uploadPhoto(event.target.files?.[0])} /></label>}<div className="scanner-controls">{capturedImage ? <><button className="outline-btn" onClick={() => { setCapturedImage(''); setDetections([]); setAnalysisError(''); void startCamera(facingMode); }}>Retake</button><button className="primary-btn" onClick={() => { setDetections([]); setSearchTerm(''); setAnalysisError(''); setCameraState('manual'); }}>Choose ingredients manually</button></> : <><button className="outline-btn" onClick={closeScanner}>Cancel</button><button className="primary-btn" onClick={() => void startCamera(facingMode)}>Try camera again</button></>}</div>{cameraError && <p className="form-error" role="alert">{cameraError}</p>}</>}
    {cameraState === 'manual' && <><div className="scanner-honest" role="status"><strong>Manual confirmation</strong><span>No AI recognition is used. Choose the ingredients you can see in the photo.</span></div>{capturedImage && <img className="scanner-preview scanner-preview-small" src={capturedImage} alt="Captured ingredients" />}<label className="onboarding-label">Search ingredients<input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Search e.g. tomato or onion" /></label>{ingredientLoading ? <p className="muted">Searching ingredients…</p> : <div className="scanner-catalog">{catalog.map(item => <button type="button" className={detections.some(d => d.name === item.canonical_name) ? 'choice active' : 'choice'} key={item.id} onClick={() => selectIngredient(item)}>{item.canonical_name}</button>)}</div>}<h3>Confirmed ingredients</h3>{detections.length ? <div className="scanner-results">{detections.map((item, index) => <div className="scanner-result-row" key={`${item.name}-${index}`}><input aria-label="Ingredient name" value={item.name} onChange={event => updateDetection(index, { name: event.target.value })} /><input aria-label="Approximate quantity" type="number" min="0.01" step="any" value={item.quantity} onChange={event => updateDetection(index, { quantity: Number(event.target.value) })} /><select aria-label="Unit" value={item.unit} onChange={event => updateDetection(index, { unit: event.target.value })}><option>units</option><option>g</option><option>kg</option><option>ml</option><option>litre</option><option>bunch</option><option>packet</option></select><small>Manually selected</small><button type="button" className="icon-btn danger-hover" aria-label={`Remove ${item.name}`} onClick={() => setDetections(current => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={16} /></button></div>)}</div> : <p className="muted">No ingredients selected yet.</p>}{analysisError && <p className="form-error" role="alert">{analysisError}</p>}<div className="scanner-controls"><button className="outline-btn" onClick={() => setCameraState('preview')}>Back</button><button className="outline-btn" onClick={closeScanner}>Cancel</button><button className="primary-btn" disabled={!detections.length || saving} onClick={() => void confirmDetections()}>{saving ? 'Adding…' : 'Add to My Kitchen'}</button></div></>}
  </article></div>;
}
function ShoppingView({ shopping, search, setSearch, draft, setDraft, onAdd, onUpdateItem, onDeleteItem, onClearPurchased, loading, busy, setNotice }: { shopping: ShoppingItem[]; search: string; setSearch: (value: string) => void; draft: string; setDraft: (value: string) => void; onAdd: (name: string, quantity?: number, unit?: string) => Promise<boolean>; onUpdateItem: (item: ShoppingItem, changes: Partial<Omit<ShoppingItem, 'id'>>) => Promise<void>; onDeleteItem: (item: ShoppingItem) => Promise<void>; onClearPurchased: () => Promise<void>; loading: boolean; busy: boolean; setNotice: (value: string) => void }) {
  const visibleItems = shopping.filter(item => item.ingredient_name.toLowerCase().includes(search.toLowerCase()));
  const [draftQuantity, setDraftQuantity] = useState('1');
  const [draftUnit, setDraftUnit] = useState('units');
  async function submitDraft(event: React.FormEvent) {
    event.preventDefault();
    const quantity = Number(draftQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) { setNotice('Quantity must be greater than zero.'); return; }
    const added = await onAdd(draft, quantity, draftUnit);
    if (added) { setDraft(''); setDraftQuantity('1'); setDraftUnit('units'); }
  }
  return <>
    <section className="page-intro"><div><p className="eyebrow">PLAN WHAT COMES NEXT</p><h1>Shopping</h1><p className="welcome-sub">Your shopping list is saved to your account.</p></div><div className="header-actions">{shopping.some(item => item.checked) && <button className="outline-btn" disabled={busy} onClick={() => void onClearPurchased()}>Clear purchased</button>}<button className="primary-btn" disabled={busy} onClick={() => document.getElementById('shopping-add-item')?.focus()}><Plus size={17} /> Add item</button></div></section>
    <div className="shopping-toolbar"><div className="search-box wide"><Search size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search your list…" aria-label="Search shopping list" /></div><span className="muted">{shopping.filter(item => !item.checked).length} to buy</span></div>
    <form className="shopping-add-row" onSubmit={submitDraft}><input id="shopping-add-item" value={draft} onChange={event => setDraft(event.target.value)} placeholder="Add an item, e.g. onions" aria-label="New shopping item" /><input type="number" min="0.01" step="any" value={draftQuantity} onChange={event => setDraftQuantity(event.target.value)} aria-label="Quantity" className="quantity-input" /><select value={draftUnit} onChange={event => setDraftUnit(event.target.value)} aria-label="Unit"><option>units</option><option>g</option><option>kg</option><option>ml</option><option>litre</option><option>packet</option><option>bunch</option></select><button className="outline-btn" type="submit" disabled={busy}>Add to list</button></form>
    {loading ? <div className="empty-state">Loading your shopping list…</div> : visibleItems.length ? <div className="shopping-list">{visibleItems.map(item => <div className={item.checked ? 'shopping-row checked' : 'shopping-row'} key={item.id}><input type="checkbox" checked={item.checked} disabled={busy} onChange={() => void onUpdateItem(item, { checked: !item.checked })} aria-label={`Mark ${item.ingredient_name} purchased`} /><input className="shopping-item-name" defaultValue={item.ingredient_name} onBlur={event => { const name = event.target.value.trim(); if (!name) { event.target.value = item.ingredient_name; } else if (name !== item.ingredient_name) void onUpdateItem(item, { ingredient_name: name }); }} aria-label={`Edit ${item.ingredient_name}`} /><input className="quantity-input" type="number" min="0.01" step="any" defaultValue={item.quantity} disabled={busy} onBlur={event => { const quantity = Number(event.target.value); if (quantity > 0 && quantity !== item.quantity) void onUpdateItem(item, { quantity }); else event.target.value = String(item.quantity); }} aria-label={`Quantity for ${item.ingredient_name}`} /><select className="shopping-unit" value={item.unit} disabled={busy} onChange={event => void onUpdateItem(item, { unit: event.target.value })}><option>units</option><option>g</option><option>kg</option><option>ml</option><option>litre</option><option>packet</option><option>bunch</option></select><button className="icon-btn danger-hover" disabled={busy} onClick={() => void onDeleteItem(item)} aria-label={`Remove ${item.ingredient_name}`} type="button"><Trash2 size={16} /></button></div>)}</div> : <div className="empty-state"><ShoppingBasket size={28} /><h3>{shopping.length ? 'No matching items' : 'Your shopping list is empty.'}</h3><p>{shopping.length ? 'Try another search.' : 'Add missing ingredients from a recipe or create a custom item above.'}</p></div>}
  </>;
}
function AddIngredientModal(props: {
  ingredientName: string; setIngredientName: (value: string) => void;
  quantity: string; setQuantity: (value: string) => void;
  unit: string; setUnit: (value: string) => void;
  expiry: string; setExpiry: (value: string) => void;
  storage: StorageLocation; setStorage: (value: StorageLocation) => void;
  saveIngredient: (event: React.FormEvent) => void;
  setShowAdd: (value: boolean) => void;
  editingIngredient: InventoryItem | null;
  inventoryBusy: boolean;
  resetIngredientForm: () => void;
}) {
  const close = () => { props.resetIngredientForm(); props.setShowAdd(false); };
  return <div className="modal-backdrop"><form className="modal" onSubmit={props.saveIngredient}><div className="modal-heading"><h2>{props.editingIngredient ? 'Edit ingredient' : 'Add an ingredient'}</h2><button type="button" className="icon-btn" onClick={close} aria-label="Close"><X size={18} /></button></div><label>Ingredient name<input autoFocus value={props.ingredientName} onChange={event => props.setIngredientName(event.target.value)} required /></label><div className="form-two-col"><label>Quantity<input type="number" min="0.01" step="any" value={props.quantity} onChange={event => props.setQuantity(event.target.value)} required /></label><label>Unit<select value={props.unit} onChange={event => props.setUnit(event.target.value)}><option>units</option><option>g</option><option>kg</option><option>bunch</option><option>packet</option><option>ml</option><option>litre</option></select></label></div><label>Storage<select value={props.storage} onChange={event => props.setStorage(event.target.value as StorageLocation)}><option value="refrigerator">Refrigerator</option><option value="freezer">Freezer</option><option value="pantry">Pantry</option><option value="kitchen">Kitchen</option></select></label><label>Expiry date<input type="date" min={today} value={props.expiry} onChange={event => props.setExpiry(event.target.value)} /></label><div className="modal-actions"><button type="button" className="outline-btn" onClick={close} disabled={props.inventoryBusy}>Cancel</button><button className="primary-btn" disabled={props.inventoryBusy}>{props.inventoryBusy ? 'Saving…' : props.editingIngredient ? 'Save changes' : 'Add ingredient'}</button></div></form></div>;
}

# Fridge to Fork

A mobile-first responsive web foundation for an Indian food-intelligence product. This repository deliberately separates verified data and deterministic business logic from AI features that need real provider credentials.

## What works in this foundation

- Email/password authentication through Supabase Auth (signup, sign-in, sign-out, confirmation-compatible flow).
- Database schema for profiles, canonical ingredients and aliases, ingredient nutrition records, recipes, recipe ingredients, per-user inventory, meal plans/history, shopping lists, saved recipes, feedback, scan sessions/detections, and food-waste events.
- Row Level Security policies that isolate user-owned records by authenticated user ID, including child rows owned through a parent list/scan session.
- Persistent inventory CRUD: add, list, search, and remove items, with quantity, unit, storage location, expiry date, source and verification fields.
- Recipe matching against inventory, using deterministic ingredient overlap and an expiry urgency signal.
- A deterministic nutrition calculation utility that requires trusted per-100g nutrition records as inputs, plus tests. No nutrition data is seeded or guessed.
- Six representative recipe records, explicitly marked `seed_unverified`; these are development examples, not claimed as source-verified/authentic recipes.
- Responsive, warm-ivory/forest-green UI with desktop navigation and mobile navigation.

## Not yet implemented (intentionally not faked)

- Camera upload and vision-model inference; the scan button explains that a vision provider/storage pipeline must be configured.
- USDA FoodData Central API integration and verified ingredient mapping. `USDA_API_KEY` is reserved but not consumed yet.
- Recipe ingestion/admin validation interface for the target 5,200+ library.
- Full meal planner optimization, cook mode, meal logging/inventory decrement, shopping-list UI, nutrition dashboard, waste-impact calculations, and production analytics.
- Real recipe photography and source verification. Recipe cards use simple illustrative emoji artwork instead of fabricated food-photo claims.

## Requirements

- Node.js 20+
- A Supabase project
- npm

## Local setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env.local` and fill in the Supabase project URL and anon/publishable key. Never put a service-role key in a browser environment variable.
3. Apply the database migration in `supabase/migrations/0001_foundation.sql` using the Supabase SQL Editor, or install the Supabase CLI and run `supabase db push` after linking your project.
4. In Supabase Auth settings, configure the site URL and allowed redirect URLs for local and production domains. For signup testing, configure email delivery or disable email confirmation only in a private development project.
5. Start the application:
   ```bash
   npm run dev
   ```
6. Open `http://localhost:3000`, create an account, and add ingredients under **My kitchen**.

## Environment variables

| Variable | Purpose | Used now? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project endpoint | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public client key; protected by RLS | Yes |
| `USDA_API_KEY` | Server-side FoodData Central access | Reserved; integration pending |
| `AI_API_KEY` | Server-side LLM/explanation provider | Reserved; integration pending |
| `VISION_API_KEY` | Server-side vision provider | Reserved; integration pending |

The `NEXT_PUBLIC_` prefix means a value is delivered to the browser. Only the Supabase public/anon key belongs there. Do not commit `.env.local` or expose service-role/API secrets to the browser.

## Architecture

```text
Next.js responsive UI
  └── Supabase browser client (Auth + Postgres APIs)
       └── Postgres Row Level Security
            ├── profiles / user preferences
            ├── inventory_items / food_waste_events
            ├── recipes / recipe_ingredients
            ├── ingredients / ingredient_aliases
            ├── nutrition_records (trusted-source mappings)
            ├── meal_plans / meal_history
            ├── shopping_lists / shopping_list_items
            └── ai_scan_sessions / ai_scan_detections
```

Production follow-up should move privileged workflows to server-side route handlers or Supabase Edge Functions, validate all input with schemas, and use narrowly scoped service-role operations only when necessary. The service-role key must never be used in the browser.

## AI and data pipelines

### Ingredient scanner (planned integration boundary)

`image upload → safe image preprocessing → vision provider → candidate labels + confidence → canonical ingredient/alias lookup → user confirmation → inventory insert`

Do not automatically persist low-confidence detections. Quantity estimates from a single image are uncertain and should be user-confirmed. The schema records model/session metadata and user corrections for later evaluation.

### Recipe database ingestion

Use a reviewed dataset or appropriately licensed sources. Normalize names against `ingredients` and `ingredient_aliases`; validate required fields and quantities; detect duplicates using normalized slug/name + ingredient signature; map cuisine, region, meal type, diet, allergens and cooking state; retain source name/URL and verification status. Import into staging first, then publish validated rows. The schema supports 5,200+ recipes but this repository does not pretend to include 5,200 verified records.

### Nutrition

Nutrition values should be mapped from USDA FoodData Central or another suitable documented food-composition source. Store the source ID, food state, retrieval timestamp and nutrients per 100 g in `nutrition_records`. Convert recipe ingredient amounts to grams using validated unit conversion factors; then use `lib/nutrition.ts` to scale and divide by servings. Do not treat raw and cooked weights as interchangeable. If a reliable mapping is missing, show nutrition as unavailable or clearly estimated; never ask an LLM to invent values.

### Recommendation ranking

`lib/recipe-match.ts` is a first deterministic baseline: ingredient coverage plus a small expiry-urgency signal and a time penalty. It is not the final optimizer. The next iteration should account for unit/quantity sufficiency, allergies as a hard exclusion, dietary constraints, nutritional fit, cuisine preferences, dislikes, repeated meals, serving counts and validated substitution edges. All hard constraints must be applied before ranking.

## Security checklist before production

- Review every RLS policy against actual queries and attempt cross-user access tests.
- Add server-side input validation/rate limits for expensive APIs and scan endpoints.
- Configure Auth email confirmation, password policy, session lifetimes, production redirect URLs, and abuse protection.
- Keep server secrets in deployment secret storage; rotate any exposed credentials.
- Add private Storage buckets with owner-scoped policies before image scanning.
- Add audit logging that does not record secrets or unnecessary personal data.
- Review privacy policy, retention/deletion flow, allergen safety copy, accessibility and Indian privacy/legal obligations.
- Run dependency audit, typecheck, unit/integration tests, and a deployment smoke test.

## Commands

```bash
npm run dev       # local development
npm run typecheck # TypeScript checks
npm test          # deterministic unit tests
npm run build     # production build
```

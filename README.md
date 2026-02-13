# MealMaker MVP

A web app that generates 7-day dinner plans for your family, respecting dietary restrictions, time constraints, and variety preferences. Produces a consolidated grocery list from the plan.

## Tech Stack

- **Backend**: Node + Express + TypeScript
- **Database**: SQLite (file-based, via `better-sqlite3`)
- **Frontend**: React + Vite + TypeScript + Tailwind CSS
- **Shared types**: `/shared/types.ts`

## Quick Start

### 1. Install dependencies

```bash
cd backend && npm install
cd ../web && npm install
```

### 2. Seed the database (43 recipes across 12 cuisines)

```bash
cd backend && npx tsx src/seed.ts
```

### 3. Start the backend (port 3001)

```bash
cd backend && npm run dev
```

### 4. Start the frontend (port 5173)

```bash
cd web && npm run dev
```

### 5. Open the app

Visit **http://localhost:5173**

## App Screens

1. **Family Profile** (`/profile`) — Set family name, allergies, vegetarian ratio, dietary preferences, cook time limits, leftovers preference, and picky kid mode.
2. **Meal Plan** (`/plan`) — Generate a 7-day dinner plan. Lock individual meals, swap a single day, or regenerate the full plan while respecting locks.
3. **Grocery List** (`/grocery`) — View consolidated ingredients grouped by category (produce, protein, dairy, grains, pantry, spices). Check off items you already have.

## Meal Planning Logic

- **Hard filters**: Allergies, gluten-free, dairy-free, nut-free constraints eliminate recipes
- **Picky kid mode**: Only selects kid-friendly recipes
- **Vegetarian ratio**: Targets the configured percentage of vegetarian meals across the week
- **Variety**: No same cuisine back-to-back; no repeated primary protein within 2 days
- **Time constraints**: Weekday meals respect weekday cook time limit; weekends get more time
- **Leftovers**: Selects leftover-producing meals early in the week for next-day lunch suggestions

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/families` | List all families |
| GET | `/api/families/:id` | Get a family |
| POST | `/api/families` | Create a family |
| PUT | `/api/families/:id` | Update a family |
| GET | `/api/recipes` | List all recipes |
| GET | `/api/recipes/:id` | Get a recipe |
| POST | `/api/meal-plans/generate` | Generate a meal plan |
| GET | `/api/meal-plans/:id` | Get a meal plan |
| GET | `/api/meal-plans/:id/grocery-list` | Get consolidated grocery list |

## Sample curl Commands

```bash
# Health check
curl http://localhost:3001/api/health

# Create a family profile
curl -X POST http://localhost:3001/api/families \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "The Smiths",
    "allergies": ["shellfish"],
    "vegetarian_ratio": 40,
    "gluten_free": false,
    "dairy_free": false,
    "nut_free": true,
    "max_cook_minutes_weekday": 45,
    "max_cook_minutes_weekend": 90,
    "leftovers_nights_per_week": 2,
    "picky_kid_mode": false
  }'

# Generate a meal plan
curl -X POST http://localhost:3001/api/meal-plans/generate \
  -H 'Content-Type: application/json' \
  -d '{"family_id": 1}'

# Regenerate with locked meals (keep Monday's recipe)
curl -X POST http://localhost:3001/api/meal-plans/generate \
  -H 'Content-Type: application/json' \
  -d '{"family_id": 1, "locks": {"monday": 45}}'

# Get grocery list for a plan
curl http://localhost:3001/api/meal-plans/1/grocery-list

# List all recipes
curl http://localhost:3001/api/recipes
```

## Project Structure

```
mealmaker/
├── backend/
│   ├── src/
│   │   ├── index.ts          # Express server entry
│   │   ├── db.ts             # SQLite setup + schema
│   │   ├── seed.ts           # Database seeder
│   │   ├── seed-data.ts      # 43 recipes across 12 cuisines
│   │   ├── planner.ts        # Meal planning algorithm
│   │   ├── helpers.ts        # Row-to-model converters
│   │   └── routes/
│   │       ├── families.ts
│   │       ├── recipes.ts
│   │       └── meal-plans.ts
│   └── package.json
├── web/
│   ├── src/
│   │   ├── main.tsx          # React entry + routing
│   │   ├── App.tsx           # Layout + navigation
│   │   ├── api.ts            # API client
│   │   ├── index.css         # Tailwind imports
│   │   └── pages/
│   │       ├── FamilyProfile.tsx
│   │       ├── MealPlan.tsx
│   │       └── GroceryList.tsx
│   └── package.json
├── shared/
│   └── types.ts              # TypeScript types shared between backend + frontend
└── README.md
```

## Design Decisions

- **No auth**: Single-user local app for MVP. The first family profile is used automatically.
- **No external APIs**: Meal planning is deterministic, using a local algorithm with shuffled selection.
- **SQLite**: Zero-config, file-based. Database is created automatically on first run.
- **Grocery consolidation**: Ingredients with the same name and unit are summed across all meals in the plan.
- **Leftovers**: Meals that produce leftovers are scheduled early in the week (Mon–Thu) and tagged with a lunch suggestion for the next day.

# Phase 7: Meal Plan History - Implementation Guide

## Overview
Phase 7 adds meal plan history functionality:
- View all past meal plans
- "❤️ Loved It" button to mark favorite meals
- Copy meals from history to current week
- Foundation for social sharing (Phase 7b)

## Files Created

### Frontend (2 files)
1. `History.tsx` - History page component
2. `api-v3-history.ts` - API functions

### Backend (1 file)
3. `meal-plans-history.ts` - History routes

## Installation Steps

### Step 1: Copy Frontend Files
```bash
cd ~/mealmaker/web/src

# Copy History page
cp ~/Downloads/mealmaker-v3/frontend-components/History.tsx pages/

# Add API functions to api.ts
cat ~/Downloads/mealmaker-v3/frontend-components/api-v3-history.ts >> api.ts
```

### Step 2: Update Navigation

**Change "Recipes" to "History":**

In `App.tsx`, find the Recipes NavLink and change it to:
```typescript
<NavLink to="/history" className={navCls}>
  History
</NavLink>
```

### Step 3: Update Routing

In `main.tsx` (or wherever routes are defined), change:
```typescript
// OLD:
{
  path: "/recipes",
  element: <Recipes />,
}

// NEW:
{
  path: "/history",
  element: <History />,
}
```

### Step 4: Copy Backend Route

```bash
cd ~/mealmaker/backend/src/routes

# Option A: Add to existing meal-plans-v3.ts
# (Append the history routes to that file)

# Option B: Create separate file
cp ~/Downloads/mealmaker-v3/backend-routes/meal-plans-history.ts .
```

If using Option B, register the route in `index.ts`:
```typescript
import mealPlansHistoryRouter from "./routes/meal-plans-history";

app.use("/api/meal-plans", mealPlansHistoryRouter);
```

### Step 5: Restart Servers
```bash
# Backend
cd ~/mealmaker/backend
npm run dev

# Frontend  
cd ~/mealmaker/web
npm run dev
```

## Usage

### View History
1. Click "History" tab
2. See all past meal plans listed by week
3. Click any plan to view full details

### Mark Meals as Loved
1. View a meal plan
2. Click "❤️ Love This" on a meal (feature to be added to MealDayCard)
3. System remembers for Phase 8 recommendations

### Copy Meal to This Week
1. View history plan
2. Click "Copy to This Week" on a meal
3. Select target day
4. Meal appears in current week

## What's Next

**Phase 7a (Current):** ✅ Basic history viewing

**Phase 7b (Future):** Social sharing
- Share as image (download/social)
- Share as link (public view)
- "Copy this plan" for others

**Phase 8:** Claude-powered intelligence using loved meals

## Testing

1. Generate 2-3 meal plans for different weeks
2. Go to History tab - see all plans listed
3. Click a plan - view full details
4. Verify plans are sorted by week (newest first)

---

**Status: Phase 7a Ready for Implementation**

Basic history viewing is done. "Loved It" buttons and copying meals will be added next!

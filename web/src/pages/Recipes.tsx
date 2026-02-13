import { useState, useEffect } from "react";
import type { Recipe, RecipeInput, Ingredient, GroceryCategory, Cuisine, Difficulty } from "@shared/types";
import { VALID_CUISINES, VALID_DIFFICULTIES, VALID_ALLERGENS } from "@shared/types";
import { getRecipes, createRecipe } from "../api";

const CATEGORY_OPTIONS: GroceryCategory[] = ["produce", "dairy", "pantry", "protein", "spices", "grains", "frozen", "other"];

const defaultRecipe: RecipeInput = {
  title: "",
  cuisine: "american",
  vegetarian: false,
  protein_type: null,
  cook_minutes: 30,
  allergens: [],
  kid_friendly: false,
  makes_leftovers: false,
  leftovers_score: 0,
  ingredients: [],
  tags: [],
  source_type: "user",
  source_name: null,
  source_url: null,
  difficulty: "medium",
  seasonal_tags: [],
  frequency_cap_per_month: null,
};

const emptyIngredient: Ingredient = { name: "", quantity: 1, unit: "count", category: "produce" };

export default function Recipes() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<RecipeInput>({ ...defaultRecipe });
  const [ingredients, setIngredients] = useState<Ingredient[]>([{ ...emptyIngredient }]);
  const [saving, setSaving] = useState(false);
  const [tagsInput, setTagsInput] = useState("");

  useEffect(() => {
    getRecipes().then(setRecipes);
  }, []);

  const toggleAllergen = (a: string) => {
    setForm((prev) => ({
      ...prev,
      allergens: prev.allergens.includes(a)
        ? prev.allergens.filter((x) => x !== a)
        : [...prev.allergens, a],
    }));
  };

  const addIngredientRow = () => {
    setIngredients((prev) => [...prev, { ...emptyIngredient }]);
  };

  const removeIngredientRow = (idx: number) => {
    setIngredients((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateIngredient = (idx: number, field: keyof Ingredient, value: any) => {
    setIngredients((prev) =>
      prev.map((ing, i) => (i === idx ? { ...ing, [field]: value } : ing)),
    );
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const recipeData: RecipeInput = {
        ...form,
        ingredients: ingredients.filter((i) => i.name.trim()),
        tags: tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
      };
      const created = await createRecipe(recipeData);
      setRecipes((prev) => [...prev, created]);
      setShowForm(false);
      setForm({ ...defaultRecipe });
      setIngredients([{ ...emptyIngredient }]);
      setTagsInput("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Recipes</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
        >
          {showForm ? "Cancel" : "Add Recipe"}
        </button>
      </div>

      {/* Recipe creation form */}
      {showForm && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Title</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                placeholder="Recipe title"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Cuisine</label>
              <select
                value={form.cuisine}
                onChange={(e) => setForm({ ...form, cuisine: e.target.value as Cuisine })}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
              >
                {VALID_CUISINES.map((c) => (
                  <option key={c} value={c}>{c.replace("_", " ")}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Cook Minutes</label>
              <input
                type="number"
                value={form.cook_minutes}
                onChange={(e) => setForm({ ...form, cook_minutes: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                min={1}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Difficulty</label>
              <select
                value={form.difficulty}
                onChange={(e) => setForm({ ...form, difficulty: e.target.value as Difficulty })}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
              >
                {VALID_DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Protein Type</label>
              <input
                type="text"
                value={form.protein_type || ""}
                onChange={(e) => setForm({ ...form, protein_type: e.target.value || null })}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                placeholder="chicken, beef, etc."
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.vegetarian}
                onChange={(e) => setForm({ ...form, vegetarian: e.target.checked })}
                className="accent-emerald-600"
              />
              Vegetarian
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.kid_friendly}
                onChange={(e) => setForm({ ...form, kid_friendly: e.target.checked })}
                className="accent-emerald-600"
              />
              Kid Friendly
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.makes_leftovers}
                onChange={(e) => setForm({ ...form, makes_leftovers: e.target.checked })}
                className="accent-emerald-600"
              />
              Makes Leftovers
            </label>
          </div>

          {/* Allergens */}
          <div>
            <label className="block text-xs font-medium mb-1">Allergens</label>
            <div className="flex flex-wrap gap-1.5">
              {VALID_ALLERGENS.map((a) => (
                <button
                  key={a}
                  onClick={() => toggleAllergen(a)}
                  className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                    form.allergens.includes(a)
                      ? "bg-red-100 border-red-400 text-red-700"
                      : "bg-white border-gray-300 text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-medium mb-1">Tags (comma-separated)</label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
              placeholder="quick, comfort-food, healthy"
            />
          </div>

          {/* Ingredients */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium">Ingredients</label>
              <button
                onClick={addIngredientRow}
                className="text-xs text-emerald-600 hover:underline"
              >
                + Add Row
              </button>
            </div>
            <div className="space-y-2">
              {ingredients.map((ing, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={ing.name}
                    onChange={(e) => updateIngredient(idx, "name", e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-sm"
                    placeholder="Ingredient name"
                  />
                  <input
                    type="number"
                    value={ing.quantity}
                    onChange={(e) => updateIngredient(idx, "quantity", Number(e.target.value))}
                    className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm"
                    min={0}
                    step={0.25}
                  />
                  <input
                    type="text"
                    value={ing.unit}
                    onChange={(e) => updateIngredient(idx, "unit", e.target.value)}
                    className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm"
                    placeholder="unit"
                  />
                  <select
                    value={ing.category}
                    onChange={(e) => updateIngredient(idx, "category", e.target.value)}
                    className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-sm"
                  >
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  {ingredients.length > 1 && (
                    <button
                      onClick={() => removeIngredientRow(idx)}
                      className="text-red-400 hover:text-red-600 text-sm"
                    >
                      x
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={saving || !form.title.trim()}
            className="bg-emerald-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Creating..." : "Create Recipe"}
          </button>
        </div>
      )}

      {/* Recipe list */}
      <div className="space-y-2">
        {recipes.map((r) => (
          <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-900 text-sm">{r.title}</div>
              <div className="flex flex-wrap gap-1 mt-0.5">
                <span className="text-xs text-gray-500">{r.cuisine.replace("_", " ")}</span>
                <span className="text-xs text-gray-400">&middot;</span>
                <span className="text-xs text-gray-500">{r.cook_minutes} min</span>
                <span className="text-xs text-gray-400">&middot;</span>
                <span className="text-xs text-gray-500">{r.difficulty}</span>
                {r.vegetarian && (
                  <>
                    <span className="text-xs text-gray-400">&middot;</span>
                    <span className="text-xs text-green-600">veg</span>
                  </>
                )}
                {r.source_type === "user" && (
                  <>
                    <span className="text-xs text-gray-400">&middot;</span>
                    <span className="text-xs text-emerald-600">custom</span>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { Family, FamilyInput } from "@shared/types";
import { getFamilies, createFamily, updateFamily } from "../api";

const ALLERGY_OPTIONS = [
  "gluten", "dairy", "nuts", "shellfish", "soy", "fish", "eggs",
];

const defaultProfile: FamilyInput = {
  name: "",
  allergies: [],
  vegetarian_ratio: 30,
  gluten_free: false,
  dairy_free: false,
  nut_free: false,
  max_cook_minutes_weekday: 45,
  max_cook_minutes_weekend: 90,
  leftovers_nights_per_week: 1,
  picky_kid_mode: false,
};

export default function FamilyProfile() {
  const navigate = useNavigate();
  const [family, setFamily] = useState<Family | null>(null);
  const [form, setForm] = useState<FamilyInput>(defaultProfile);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getFamilies().then((families) => {
      if (families.length > 0) {
        const f = families[0];
        setFamily(f);
        setForm({
          name: f.name,
          allergies: f.allergies,
          vegetarian_ratio: f.vegetarian_ratio,
          gluten_free: f.gluten_free,
          dairy_free: f.dairy_free,
          nut_free: f.nut_free,
          max_cook_minutes_weekday: f.max_cook_minutes_weekday,
          max_cook_minutes_weekend: f.max_cook_minutes_weekend,
          leftovers_nights_per_week: f.leftovers_nights_per_week,
          picky_kid_mode: f.picky_kid_mode,
        });
      }
    });
  }, []);

  const toggleAllergy = (a: string) => {
    setForm((prev) => ({
      ...prev,
      allergies: prev.allergies.includes(a)
        ? prev.allergies.filter((x) => x !== a)
        : [...prev.allergies, a],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      if (family) {
        const updated = await updateFamily(family.id, form);
        setFamily(updated);
      } else {
        const created = await createFamily(form);
        setFamily(created);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Family Profile</h2>

      {/* Family Name */}
      <div>
        <label className="block text-sm font-medium mb-1">Family Name</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full max-w-md border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          placeholder="The Smiths"
        />
      </div>

      {/* Allergies */}
      <div>
        <label className="block text-sm font-medium mb-2">Allergies</label>
        <div className="flex flex-wrap gap-2">
          {ALLERGY_OPTIONS.map((a) => (
            <button
              key={a}
              onClick={() => toggleAllergy(a)}
              className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                form.allergies.includes(a)
                  ? "bg-red-100 border-red-400 text-red-700"
                  : "bg-white border-gray-300 text-gray-600 hover:bg-gray-100"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* Vegetarian Ratio */}
      <div>
        <label className="block text-sm font-medium mb-1">
          Vegetarian Ratio: {form.vegetarian_ratio}%
        </label>
        <input
          type="range"
          min={0}
          max={100}
          step={10}
          value={form.vegetarian_ratio}
          onChange={(e) => setForm({ ...form, vegetarian_ratio: Number(e.target.value) })}
          className="w-full max-w-md accent-emerald-600"
        />
        <div className="flex justify-between text-xs text-gray-400 max-w-md">
          <span>All Meat</span>
          <span>All Vegetarian</span>
        </div>
      </div>

      {/* Dietary Toggles */}
      <div>
        <label className="block text-sm font-medium mb-2">Dietary Preferences</label>
        <div className="flex flex-wrap gap-4">
          {([
            ["gluten_free", "Gluten-Free"],
            ["dairy_free", "Dairy-Free"],
            ["nut_free", "Nut-Free"],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                className="accent-emerald-600"
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {/* Cook Time */}
      <div className="grid grid-cols-2 gap-4 max-w-md">
        <div>
          <label className="block text-sm font-medium mb-1">
            Max Cook Time (Weekday)
          </label>
          <select
            value={form.max_cook_minutes_weekday}
            onChange={(e) => setForm({ ...form, max_cook_minutes_weekday: Number(e.target.value) })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          >
            {[15, 20, 25, 30, 45, 60, 90].map((m) => (
              <option key={m} value={m}>{m} min</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Max Cook Time (Weekend)
          </label>
          <select
            value={form.max_cook_minutes_weekend}
            onChange={(e) => setForm({ ...form, max_cook_minutes_weekend: Number(e.target.value) })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          >
            {[30, 45, 60, 90, 120, 180].map((m) => (
              <option key={m} value={m}>{m} min</option>
            ))}
          </select>
        </div>
      </div>

      {/* Leftovers */}
      <div>
        <label className="block text-sm font-medium mb-1">
          Leftovers Nights Per Week: {form.leftovers_nights_per_week}
        </label>
        <input
          type="range"
          min={0}
          max={4}
          value={form.leftovers_nights_per_week}
          onChange={(e) => setForm({ ...form, leftovers_nights_per_week: Number(e.target.value) })}
          className="w-full max-w-md accent-emerald-600"
        />
        <div className="flex justify-between text-xs text-gray-400 max-w-md">
          <span>0</span>
          <span>4</span>
        </div>
      </div>

      {/* Picky Kid Mode */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={form.picky_kid_mode}
            onChange={(e) => setForm({ ...form, picky_kid_mode: e.target.checked })}
            className="accent-emerald-600"
          />
          Picky Kid Mode
          <span className="text-gray-400 font-normal">(biases toward mild, familiar recipes)</span>
        </label>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !form.name.trim()}
          className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving..." : family ? "Update Profile" : "Create Profile"}
        </button>
        {saved && (
          <span className="text-emerald-600 text-sm font-medium">Saved!</span>
        )}
        {family && (
          <button
            onClick={() => navigate("/plan")}
            className="text-emerald-600 text-sm font-medium hover:underline"
          >
            Go to Meal Plan &rarr;
          </button>
        )}
      </div>
    </div>
  );
}

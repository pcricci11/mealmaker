// components/FamilyMemberModal.tsx
// Modal for adding/editing family members

import { useState, useEffect } from "react";
import type { FamilyMemberV3, DietaryStyle } from "@shared/types";

interface Props {
  member: FamilyMemberV3 | null;
  onSave: (data: Partial<FamilyMemberV3>) => void;
  onClose: () => void;
}

const COMMON_ALLERGENS = [
  "gluten",
  "dairy",
  "nuts",
  "shellfish",
  "soy",
  "fish",
  "eggs",
];

export default function FamilyMemberModal({ member, onSave, onClose }: Props) {
  const [name, setName] = useState("");
  const [dietaryStyle, setDietaryStyle] = useState<DietaryStyle>("omnivore");
  const [allergies, setAllergies] = useState<string[]>([]);
  const [dislikes, setDislikes] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [noSpicy, setNoSpicy] = useState(false);

  const [customAllergyInput, setCustomAllergyInput] = useState("");
  const [customDislikeInput, setCustomDislikeInput] = useState("");
  const [customFavoriteInput, setCustomFavoriteInput] = useState("");

  useEffect(() => {
    if (member) {
      setName(member.name);
      setDietaryStyle(member.dietary_style);
      setAllergies(member.allergies || []);
      setDislikes(member.dislikes || []);
      setFavorites(member.favorites || []);
      setNoSpicy(member.no_spicy || false);
    }
  }, [member]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      alert("Please enter a name");
      return;
    }

    onSave({
      name: name.trim(),
      dietary_style: dietaryStyle,
      allergies,
      dislikes,
      favorites,
      no_spicy: noSpicy,
    });
  };

  const toggleAllergen = (allergen: string) => {
    setAllergies((prev) =>
      prev.includes(allergen)
        ? prev.filter((a) => a !== allergen)
        : [...prev, allergen]
    );
  };

  const addCustomAllergen = () => {
    const trimmed = customAllergyInput.trim();
    if (trimmed && !allergies.includes(trimmed.toLowerCase())) {
      setAllergies([...allergies, trimmed.toLowerCase()]);
      setCustomAllergyInput("");
    }
  };

  const addDislike = () => {
    const trimmed = customDislikeInput.trim();
    if (trimmed && !dislikes.includes(trimmed)) {
      setDislikes([...dislikes, trimmed]);
      setCustomDislikeInput("");
    }
  };

  const removeDislike = (item: string) => {
    setDislikes(dislikes.filter((d) => d !== item));
  };

  const addFavorite = () => {
    const trimmed = customFavoriteInput.trim();
    if (trimmed && !favorites.includes(trimmed)) {
      setFavorites([...favorites, trimmed]);
      setCustomFavoriteInput("");
    }
  };

  const removeFavorite = (item: string) => {
    setFavorites(favorites.filter((f) => f !== item));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-0 md:p-4 z-50">
      <div className="bg-white rounded-none md:rounded-xl max-w-2xl w-full h-full md:h-auto md:max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-4 md:px-6 py-4 flex items-center justify-between">
            <h3 className="text-xl font-bold">
              {member ? "Edit Family Member" : "Add Family Member"}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="e.g., John"
                required
              />
            </div>

            {/* Dietary Style */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Dietary Style
              </label>
              <div className="flex gap-3">
                {(["omnivore", "vegetarian", "vegan"] as DietaryStyle[]).map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => setDietaryStyle(style)}
                    className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors ${
                      dietaryStyle === style
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                        : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    {style.charAt(0).toUpperCase() + style.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Allergies */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Allergies
              </label>
              <div className="flex flex-wrap gap-2 mb-3">
                {COMMON_ALLERGENS.map((allergen) => (
                  <button
                    key={allergen}
                    type="button"
                    onClick={() => toggleAllergen(allergen)}
                    className={`px-3 py-1 rounded-full text-sm transition-colors ${
                      allergies.includes(allergen)
                        ? "bg-red-100 text-red-700 border-2 border-red-300"
                        : "bg-gray-100 text-gray-600 border-2 border-transparent hover:border-gray-300"
                    }`}
                  >
                    {allergen}
                  </button>
                ))}
              </div>

              {/* Custom allergen */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customAllergyInput}
                  onChange={(e) => setCustomAllergyInput(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addCustomAllergen())}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="Add other allergy..."
                />
                <button
                  type="button"
                  onClick={addCustomAllergen}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300"
                >
                  Add
                </button>
              </div>

              {/* Custom allergies */}
              {allergies.filter((a) => !COMMON_ALLERGENS.includes(a)).length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {allergies
                    .filter((a) => !COMMON_ALLERGENS.includes(a))
                    .map((allergen) => (
                      <span
                        key={allergen}
                        className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm border-2 border-red-300 flex items-center gap-1"
                      >
                        {allergen}
                        <button
                          type="button"
                          onClick={() => setAllergies(allergies.filter((a) => a !== allergen))}
                          className="ml-1 hover:text-red-900"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                </div>
              )}
            </div>

            {/* No Spicy */}
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={noSpicy}
                  onChange={(e) => setNoSpicy(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  🌶️ No Spicy Food
                </span>
              </label>
            </div>

            {/* Dislikes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Dislikes (Foods to Avoid)
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={customDislikeInput}
                  onChange={(e) => setCustomDislikeInput(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addDislike())}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="e.g., mushrooms, olives..."
                />
                <button
                  type="button"
                  onClick={addDislike}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300"
                >
                  Add
                </button>
              </div>
              {dislikes.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {dislikes.map((item) => (
                    <span
                      key={item}
                      className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm flex items-center gap-1"
                    >
                      {item}
                      <button
                        type="button"
                        onClick={() => removeDislike(item)}
                        className="ml-1 hover:text-gray-900"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Favorites */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Favorite Foods
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={customFavoriteInput}
                  onChange={(e) => setCustomFavoriteInput(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addFavorite())}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="e.g., pasta, chicken..."
                />
                <button
                  type="button"
                  onClick={addFavorite}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300"
                >
                  Add
                </button>
              </div>
              {favorites.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {favorites.map((item) => (
                    <span
                      key={item}
                      className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm flex items-center gap-1"
                    >
                      {item}
                      <button
                        type="button"
                        onClick={() => removeFavorite(item)}
                        className="ml-1 hover:text-emerald-900"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-4 md:px-6 py-4 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors"
            >
              {member ? "Save Changes" : "Add Member"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

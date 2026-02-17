// components/FavoritesList.tsx
// Display and manage family favorites (chefs, meals, sides)

import { useState } from "react";
import type {
  FamilyFavoriteChef,
  FamilyFavoriteMeal,
  FamilyFavoriteSide,
} from "@shared/types";
import {
  createFavoriteChef,
  deleteFavoriteChef,
  createFavoriteMeal,
  updateFavoriteMeal,
  deleteFavoriteMeal,
  createFavoriteSide,
  updateFavoriteSide,
  deleteFavoriteSide,
} from "../api";
import FavoriteMealModal from "./FavoriteMealModal";
import FavoriteSideModal from "./FavoriteSideModal";

interface Props {
  familyId: number;
  chefs: FamilyFavoriteChef[];
  meals: FamilyFavoriteMeal[];
  sides: FamilyFavoriteSide[];
  onUpdate: () => void;
}

export default function FavoritesList({
  familyId,
  chefs,
  meals,
  sides,
  onUpdate,
}: Props) {
  const [showMealModal, setShowMealModal] = useState(false);
  const [showSideModal, setShowSideModal] = useState(false);
  const [editingMeal, setEditingMeal] = useState<FamilyFavoriteMeal | null>(null);
  const [editingSide, setEditingSide] = useState<FamilyFavoriteSide | null>(null);
  const [newChefName, setNewChefName] = useState("");

  // Chefs
  const handleAddChef = async () => {
    if (!newChefName.trim()) return;

    try {
      await createFavoriteChef(familyId, newChefName.trim());
      setNewChefName("");
      onUpdate();
    } catch (error) {
      console.error("Error adding chef:", error);
    }
  };

  const handleDeleteChef = async (id: number) => {
    try {
      await deleteFavoriteChef(id);
      onUpdate();
    } catch (error) {
      console.error("Error deleting chef:", error);
    }
  };

  // Meals
  const handleSaveMeal = async (mealData: Partial<FamilyFavoriteMeal>) => {
    try {
      if (editingMeal) {
        await updateFavoriteMeal(editingMeal.id, mealData);
      } else {
        await createFavoriteMeal(familyId, mealData as any);
      }
      setShowMealModal(false);
      setEditingMeal(null);
      onUpdate();
    } catch (error) {
      console.error("Error saving meal:", error);
    }
  };

  const handleDeleteMeal = async (id: number) => {
    if (!confirm("Remove this favorite meal?")) return;

    try {
      await deleteFavoriteMeal(id);
      onUpdate();
    } catch (error) {
      console.error("Error deleting meal:", error);
    }
  };

  // Sides
  const handleSaveSide = async (sideData: Partial<FamilyFavoriteSide>) => {
    try {
      if (editingSide) {
        await updateFavoriteSide(editingSide.id, sideData);
      } else {
        await createFavoriteSide(familyId, sideData as any);
      }
      setShowSideModal(false);
      setEditingSide(null);
      onUpdate();
    } catch (error) {
      console.error("Error saving side:", error);
    }
  };

  const handleDeleteSide = async (id: number) => {
    if (!confirm("Remove this favorite side?")) return;

    try {
      await deleteFavoriteSide(id);
      onUpdate();
    } catch (error) {
      console.error("Error deleting side:", error);
    }
  };

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-bold">Family Favorites</h3>

      {/* Favorite Chefs */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h4 className="font-semibold mb-3">Favorite Chefs</h4>
        <p className="text-sm text-gray-600 mb-4">
          Chefs or people whose meals you often make or enjoy
        </p>

        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={newChefName}
            onChange={(e) => setNewChefName(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleAddChef()}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
            placeholder="e.g., Gordon Ramsay, Grandma..."
          />
          <button
            onClick={handleAddChef}
            className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600"
          >
            Add
          </button>
        </div>

        {chefs.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {chefs.map((chef) => (
              <span
                key={chef.id}
                className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm flex items-center gap-2"
              >
                {chef.name}
                <button
                  onClick={() => handleDeleteChef(chef.id)}
                  className="hover:text-blue-900"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Favorite Meals */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold">Favorite Meals</h4>
          <button
            onClick={() => {
              setEditingMeal(null);
              setShowMealModal(true);
            }}
            className="text-sm text-orange-500 hover:text-orange-600 font-medium"
          >
            + Add Meal
          </button>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Your go-to meals with optional recipe links
        </p>

        {meals.length === 0 ? (
          <div className="text-center py-4 text-gray-400 text-sm">
            No favorite meals yet
          </div>
        ) : (
          <div className="space-y-2">
            {meals.map((meal) => (
              <div
                key={meal.id}
                className="border border-gray-200 rounded-lg p-3 hover:border-gray-300"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-medium">{meal.name}</div>
                    <div className="flex gap-2 mt-1 text-xs">
                      {meal.difficulty && (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                          {meal.difficulty}
                        </span>
                      )}
                      {meal.total_time_minutes && (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                          {meal.total_time_minutes} min
                        </span>
                      )}
                      {meal.frequency_preference && (
                        <span className="px-2 py-0.5 bg-orange-100 text-orange-600 rounded">
                          {meal.frequency_preference.replace("_", " ")}
                        </span>
                      )}
                    </div>
                    {meal.recipe_url && (
                      <a
                        href={meal.recipe_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline mt-1 inline-block"
                      >
                        View recipe →
                      </a>
                    )}
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => {
                        setEditingMeal(meal);
                        setShowMealModal(true);
                      }}
                      className="text-sm text-blue-600 hover:text-blue-700"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteMeal(meal.id)}
                      className="text-sm text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Favorite Sides */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold">Favorite Sides</h4>
          <button
            onClick={() => {
              setEditingSide(null);
              setShowSideModal(true);
            }}
            className="text-sm text-orange-500 hover:text-orange-600 font-medium"
          >
            + Add Side
          </button>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Your go-to side dishes with optional recipe links
        </p>

        {sides.length === 0 ? (
          <div className="text-center py-4 text-gray-400 text-sm">
            No favorite sides yet
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {sides.map((side) => (
              <div
                key={side.id}
                className="border border-gray-200 rounded-lg p-3 hover:border-gray-300"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{side.name}</div>
                    {side.category && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        {side.category}
                      </div>
                    )}
                    {side.recipe_url && (
                      <a
                        href={side.recipe_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Recipe
                      </a>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 ml-2">
                    <button
                      onClick={() => {
                        setEditingSide(side);
                        setShowSideModal(true);
                      }}
                      className="text-xs text-blue-600 hover:text-blue-700"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteSide(side.id)}
                      className="text-xs text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showMealModal && (
        <FavoriteMealModal
          meal={editingMeal}
          onSave={handleSaveMeal}
          onClose={() => {
            setShowMealModal(false);
            setEditingMeal(null);
          }}
        />
      )}

      {showSideModal && (
        <FavoriteSideModal
          side={editingSide}
          onSave={handleSaveSide}
          onClose={() => {
            setShowSideModal(false);
            setEditingSide(null);
          }}
        />
      )}
    </div>
  );
}

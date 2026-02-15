// pages/MealPlan-v3.tsx
// Enhanced meal plan page with sides, multi-mains, and lunch support

import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type {
  Family,
  MealPlan,
  MealPlanItemV3,
  FamilyMemberV3,
  DayOfWeek,
} from "@shared/types";
import {
  getFamilies,
  getMealPlan,
  getFamilyMembers,
  swapSide,
  addSide,
  removeSide,
  markMealAsLoved,
  swapMainRecipe,
} from "../api";
import MealDayCard from "../components/MealDayCard";
import SwapSideModal from "../components/SwapSideModal";
import AddSideModal from "../components/AddSideModal";
import SwapMainModal from "../components/SwapMainModal";

const DAY_ORDER = [
  "monday",
  "tuesday", 
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export default function MealPlan() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const planId = searchParams.get("id") || localStorage.getItem('lastMealPlanId');

  const [family, setFamily] = useState<Family | null>(null);
  const [members, setMembers] = useState<FamilyMemberV3[]>([]);
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [swapSideModal, setSwapSideModal] = useState<{
    mealItemId: number;
    mainRecipeId: number;
  } | null>(null);
  const [addSideModal, setAddSideModal] = useState<number | null>(null); // mainMealItemId
  const [swapMainModal, setSwapMainModal] = useState<{
    mealItemId: number;
    day: DayOfWeek;
  } | null>(null);

  useEffect(() => {
    loadData();
    // Save plan ID to localStorage when available
    if (planId) {
      localStorage.setItem('lastMealPlanId', planId);
    }
  }, [planId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const families = await getFamilies();
      if (families.length > 0) {
        setFamily(families[0]);
        
        const membersData = await getFamilyMembers(families[0].id);
        setMembers(membersData);
      }

      if (planId) {
        const planData = await getMealPlan(parseInt(planId));
        setPlan(planData);
      }
    } catch (error) {
      console.error("Error loading meal plan:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSwapSide = async (newSideId: number) => {
    if (!swapSideModal) return;

    try {
      await swapSide(swapSideModal.mealItemId, newSideId);
      await loadData(); // Reload plan
      setSwapSideModal(null);
    } catch (error) {
      console.error("Error swapping side:", error);
      alert("Failed to swap side");
    }
  };

  const handleAddSide = async (sideId?: number, customName?: string) => {
    if (!addSideModal) return;

    try {
      await addSide(addSideModal, sideId, customName);
      await loadData(); // Reload plan
      setAddSideModal(null);
    } catch (error) {
      console.error("Error adding side:", error);
      alert("Failed to add side");
    }
  };

  const handleLoveMeal = async (mealItemId: number) => {
    try {
      await markMealAsLoved(mealItemId);
    } catch (error) {
      console.error("Error loving meal:", error);
    }
  };

  const handleRemoveSide = async (mealItemId: number) => {
    if (!confirm("Remove this side?")) return;
    try {
      await removeSide(mealItemId);
      await loadData();
    } catch (error) {
      console.error("Error removing side:", error);
      alert("Failed to remove side");
    }
  };

  const handleSwapMain = async (newRecipeId: number) => {
    if (!swapMainModal) return;
    try {
      const updatedPlan = await swapMainRecipe(swapMainModal.mealItemId, newRecipeId);
      setPlan(updatedPlan);
      setSwapMainModal(null);
    } catch (error) {
      console.error("Error swapping main:", error);
      alert("Failed to swap main");
    }
  };

  // Group items by day
  const groupedByDay = DAY_ORDER.map((day) => {
    const dayItems = plan?.items?.filter((item: any) => item.day === day) || [];
    
    // Separate mains, sides, lunches
    const mains = dayItems.filter((item: any) => item.meal_type === "main");
    const lunches = dayItems.filter((item: any) => item.meal_type === "lunch");
    const sides = dayItems.filter((item: any) => item.meal_type === "side");

    return {
      day,
      mains,
      lunches,
      sides,
      hasMeals: mains.length > 0 || lunches.length > 0,
    };
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading meal plan...</div>
      </div>
    );
  }

  if (!family) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">No family profile found.</p>
        <button
          onClick={() => navigate("/family")}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700"
        >
          Create Profile
        </button>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">No meal plan found.</p>
        <button
          onClick={() => navigate("/this-week")}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700"
        >
          Generate a Plan
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Your Meal Plan</h2>
          <p className="text-sm text-gray-500 mt-1">
            Week of {plan.week_start || "this week"}
          </p>
        </div>
        <button
          onClick={() => navigate("/this-week")}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          ← Back to This Week
        </button>
      </div>

      {/* Days */}
      <div className="space-y-4">
        {groupedByDay.map(({ day, mains, lunches, sides, hasMeals }) => {
          if (!hasMeals) return null;

          return (
            <MealDayCard
              key={day}
              day={day}
              mains={mains}
              lunches={lunches}
              sides={sides}
              members={members}
              onSwapSide={(mealItemId, mainRecipeId) =>
                setSwapSideModal({ mealItemId, mainRecipeId })
              }
              onAddSide={(mainMealItemId) => setAddSideModal(mainMealItemId)}
              onLoveMeal={handleLoveMeal}
              onRemoveSide={handleRemoveSide}
              onSwapMain={(mealItemId) =>
                setSwapMainModal({ mealItemId, day: day as DayOfWeek })
              }
            />
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-3 sticky bottom-0 bg-white border-t border-gray-200 py-4 -mx-4 px-4">
        <button
          onClick={() => navigate("/grocery")}
          className="flex-1 px-6 py-3 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors text-lg"
        >
          📋 View Grocery List
        </button>
      </div>

      {/* Modals */}
      {swapSideModal && (
        <SwapSideModal
          mealItemId={swapSideModal.mealItemId}
          mainRecipeId={swapSideModal.mainRecipeId}
          onSwap={handleSwapSide}
          onClose={() => setSwapSideModal(null)}
        />
      )}

      {addSideModal && (
        <AddSideModal
          mainMealItemId={addSideModal}
          onAdd={handleAddSide}
          onClose={() => setAddSideModal(null)}
        />
      )}

      {swapMainModal && (
        <SwapMainModal
          mealItemId={swapMainModal.mealItemId}
          day={swapMainModal.day}
          onSwap={handleSwapMain}
          onClose={() => setSwapMainModal(null)}
        />
      )}
    </div>
  );
}

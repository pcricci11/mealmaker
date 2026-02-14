// pages/History.tsx
// Meal plan history page - view past meal plans

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getMealPlanHistory } from "../api";
import type { MealPlan } from "@shared/types";

export default function History() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<MealPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const history = await getMealPlanHistory();
      setPlans(history);
    } catch (error) {
      console.error("Error loading history:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatWeekRange = (weekStart: string) => {
    const start = new Date(weekStart);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    
    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading history...</div>
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">No meal plans yet.</p>
        <p className="text-sm text-gray-400 mb-6">
          Generate your first meal plan to get started!
        </p>
        <button
          onClick={() => navigate("/this-week")}
          className="bg-emerald-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-emerald-700"
        >
          Plan This Week
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Meal Plan History</h2>
        <p className="text-sm text-gray-500 mt-1">
          View and reuse your past meal plans
        </p>
      </div>

      {/* Plans List */}
      <div className="grid gap-4">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className="bg-white rounded-xl border border-gray-200 p-6 hover:border-emerald-300 transition-colors cursor-pointer"
            onClick={() => navigate(`/plan?id=${plan.id}`)}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-semibold text-lg text-gray-900">
                  Week of {plan.week_start ? formatWeekRange(plan.week_start) : "Unknown"}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Created {new Date(plan.created_at).toLocaleDateString('en-US', { 
                    month: 'long', 
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </p>
                
                {/* Quick preview of meals */}
                {plan.items && plan.items.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {plan.items
                      .filter((item: any) => item.meal_type === 'main')
                      .slice(0, 3)
                      .map((item: any, idx: number) => (
                        <span
                          key={idx}
                          className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded"
                        >
                          {item.recipe_name}
                        </span>
                      ))}
                    {plan.items.filter((item: any) => item.meal_type === 'main').length > 3 && (
                      <span className="text-xs px-2 py-1 bg-gray-100 text-gray-500 rounded">
                        +{plan.items.filter((item: any) => item.meal_type === 'main').length - 3} more
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* View button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/plan?id=${plan.id}`);
                }}
                className="ml-4 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
              >
                View Plan →
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Generate New Plan */}
      <div className="text-center pt-4">
        <button
          onClick={() => navigate("/this-week")}
          className="bg-emerald-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-emerald-700"
        >
          + Generate New Plan
        </button>
      </div>
    </div>
  );
}

// pages/ThisWeek.tsx
// Weekly meal planning preferences page

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  getFamilies,
  getFamilyMembers,
  getCookingSchedule,
  saveCookingSchedule,
  getLunchNeeds,
  saveLunchNeeds,
  generateMealPlanV3,
} from "../api";
import type {
  Family,
  FamilyMemberV3,
  WeeklyCookingSchedule,
  WeeklyLunchNeed,
  DayOfWeek,
} from "@shared/types";
import CookingScheduleSection from "../components/CookingScheduleSection";
import LunchPlanningGrid from "../components/LunchPlanningGrid";
import WeekPreferencesSection from "../components/WeekPreferencesSection";

const DAYS: DayOfWeek[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

// Get Monday of current week
function getMonday(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

export default function ThisWeek() {
  const navigate = useNavigate();
  const [family, setFamily] = useState<Family | null>(null);
  const [members, setMembers] = useState<FamilyMemberV3[]>([]);
  const [weekStart, setWeekStart] = useState(getMonday(new Date()));
  
  // Cooking schedule state
  const [cookingSchedule, setCookingSchedule] = useState<WeeklyCookingSchedule[]>([]);
  
  // Lunch needs state
  const [lunchNeeds, setLunchNeeds] = useState<WeeklyLunchNeed[]>([]);
  
  // Week preferences
  const [maxCookMinutesWeekday, setMaxCookMinutesWeekday] = useState(45);
  const [maxCookMinutesWeekend, setMaxCookMinutesWeekend] = useState(90);
  const [vegetarianRatio, setVegetarianRatio] = useState(40);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadData();
  }, [weekStart]);

  const loadData = async () => {
    setLoading(true);
    try {
      const families = await getFamilies();
      if (families.length > 0) {
        const fam = families[0];
        setFamily(fam);

        // Load members
        const membersData = await getFamilyMembers(fam.id);
        setMembers(membersData);

        // Load existing cooking schedule for this week
        try {
          const schedule = await getCookingSchedule(fam.id, weekStart);
          setCookingSchedule(schedule);
        } catch (err) {
          // No existing schedule, initialize empty
          initializeEmptySchedule();
        }

        // Load existing lunch needs for this week
        try {
          const lunch = await getLunchNeeds(fam.id, weekStart);
          setLunchNeeds(lunch);
        } catch (err) {
          // No existing lunch needs, initialize empty
          initializeEmptyLunchNeeds(membersData);
        }

        // Set defaults from family if available
        if (fam.max_cook_minutes_weekday) {
          setMaxCookMinutesWeekday(fam.max_cook_minutes_weekday);
        }
        if (fam.max_cook_minutes_weekend) {
          setMaxCookMinutesWeekend(fam.max_cook_minutes_weekend);
        }
        if (fam.vegetarian_ratio !== undefined) {
          setVegetarianRatio(fam.vegetarian_ratio);
        }
      }
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const initializeEmptySchedule = () => {
    // Default: cooking every weekday, not on weekends, all "one_main"
    const schedule: WeeklyCookingSchedule[] = DAYS.map((day) => ({
      id: 0,
      family_id: family?.id || 0,
      week_start: weekStart,
      day,
      is_cooking: ["monday", "tuesday", "wednesday", "thursday", "friday"].includes(day),
      meal_mode: "one_main",
      num_mains: undefined,
      main_assignments: [],
    }));
    setCookingSchedule(schedule as any);
  };

  const initializeEmptyLunchNeeds = (membersData: FamilyMemberV3[]) => {
    const needs: WeeklyLunchNeed[] = [];
    const weekdays: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday")[] = [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
    ];

    membersData.forEach((member) => {
      weekdays.forEach((day) => {
        needs.push({
          id: 0,
          family_id: family?.id || 0,
          week_start: weekStart,
          member_id: member.id,
          day,
          needs_lunch: false,
          leftovers_ok: false,
        });
      });
    });

    setLunchNeeds(needs as any);
  };

  const handleSaveSchedule = async () => {
    if (!family) return;

    setSaving(true);
    try {
      await saveCookingSchedule(family.id, weekStart, cookingSchedule as any);
      await saveLunchNeeds(family.id, weekStart, lunchNeeds as any);
      alert("Week settings saved!");
    } catch (error) {
      console.error("Error saving:", error);
      alert("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleGeneratePlan = async () => {
    if (!family) return;

    // Save current settings first
    setSaving(true);
    try {
      await saveCookingSchedule(family.id, weekStart, cookingSchedule as any);
      await saveLunchNeeds(family.id, weekStart, lunchNeeds as any);
    } catch (error) {
      console.error("Error saving before generation:", error);
    }
    setSaving(false);

    // Generate meal plan
    setGenerating(true);
    try {
      const plan = await generateMealPlanV3({
        family_id: family.id,
        week_start: weekStart,
        cooking_schedule: cookingSchedule as any,
        lunch_needs: lunchNeeds as any,
        max_cook_minutes_weekday: maxCookMinutesWeekday,
        max_cook_minutes_weekend: maxCookMinutesWeekend,
        vegetarian_ratio: vegetarianRatio,
      });

      // Navigate to meal plan page
      navigate(`/plan?id=${plan.id}`);
    } catch (error) {
      console.error("Error generating meal plan:", error);
      alert("Failed to generate meal plan. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!family) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">No family profile found.</p>
        <p className="text-sm text-gray-400">
          Create a family profile first.
        </p>
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">No family members found.</p>
        <p className="text-sm text-gray-400 mb-4">
          Add family members to start meal planning.
        </p>
        <button
          onClick={() => navigate("/family")}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700"
        >
          Go to My Family
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">This Week</h2>
        <p className="text-sm text-gray-500 mt-1">
          Configure your meal planning preferences for the week
        </p>
      </div>

      {/* Week Selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Week Starting
        </label>
        <input
          type="date"
          value={weekStart}
          onChange={(e) => setWeekStart(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg"
        />
      </div>

      {/* Cooking Schedule */}
      <CookingScheduleSection
        days={DAYS}
        schedule={cookingSchedule}
        members={members}
        onChange={setCookingSchedule}
      />

      {/* Lunch Planning */}
      <LunchPlanningGrid
        members={members}
        lunchNeeds={lunchNeeds}
        onChange={setLunchNeeds}
      />

      {/* Week Preferences */}
      <WeekPreferencesSection
        maxCookMinutesWeekday={maxCookMinutesWeekday}
        maxCookMinutesWeekend={maxCookMinutesWeekend}
        vegetarianRatio={vegetarianRatio}
        onChangeWeekday={setMaxCookMinutesWeekday}
        onChangeWeekend={setMaxCookMinutesWeekend}
        onChangeVegRatio={setVegetarianRatio}
      />

      {/* Action Buttons */}
      <div className="flex gap-3 sticky bottom-0 bg-white border-t border-gray-200 py-4 -mx-4 px-4">
        <button
          onClick={handleSaveSchedule}
          disabled={saving}
          className="px-6 py-3 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
        <button
          onClick={handleGeneratePlan}
          disabled={generating || saving}
          className="flex-1 px-6 py-3 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors text-lg"
        >
          {generating ? "Generating..." : "🎯 Generate Meal Plan"}
        </button>
      </div>
    </div>
  );
}

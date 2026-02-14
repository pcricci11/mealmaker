// components/CookingScheduleSection.tsx
// Section for configuring which nights cooking and meal modes

import { useState } from "react";
import type {
  WeeklyCookingSchedule,
  FamilyMemberV3,
  DayOfWeek,
  MealMode,
} from "@shared/types";

interface Props {
  days: DayOfWeek[];
  schedule: WeeklyCookingSchedule[];
  members: FamilyMemberV3[];
  onChange: (schedule: WeeklyCookingSchedule[]) => void;
}

const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

export default function CookingScheduleSection({
  days,
  schedule,
  members,
  onChange,
}: Props) {
  const [expandedDay, setExpandedDay] = useState<DayOfWeek | null>(null);

  const toggleCooking = (day: DayOfWeek) => {
    console.log('toggleCooking called for:', day, 'current schedule:', schedule);
    const updated = schedule.map((item) =>
      item.day === day
        ? { ...item, is_cooking: !item.is_cooking }
        : item
    );
    onChange(updated);
  };

  const setMealMode = (day: DayOfWeek, mode: MealMode) => {
    const updated = schedule.map((item) =>
      item.day === day
        ? {
            ...item,
            meal_mode: mode,
            num_mains: mode === "customize_mains" ? 2 : undefined,
            main_assignments:
              mode === "customize_mains"
                ? [
                    { id: 0, schedule_id: 0, main_number: 1, member_ids: [] },
                    { id: 0, schedule_id: 0, main_number: 2, member_ids: [] },
                  ]
                : [],
          }
        : item
    );
    onChange(updated);
  };

  const setNumMains = (day: DayOfWeek, num: number) => {
    const updated = schedule.map((item) => {
      if (item.day === day) {
        const assignments = Array.from({ length: num }, (_, i) => ({
          id: item.main_assignments?.[i]?.id || 0,
          schedule_id: 0,
          main_number: i + 1,
          member_ids: item.main_assignments?.[i]?.member_ids || [],
        }));

        return {
          ...item,
          num_mains: num,
          main_assignments: assignments,
        };
      }
      return item;
    });
    onChange(updated);
  };

  const toggleMemberForMain = (
    day: DayOfWeek,
    mainNumber: number,
    memberId: number
  ) => {
    const updated = schedule.map((item) => {
      if (item.day === day && item.main_assignments) {
        const assignments = item.main_assignments.map((assignment) => {
          if (assignment.main_number === mainNumber) {
            const memberIds = assignment.member_ids || [];
            const newMemberIds = memberIds.includes(memberId)
              ? memberIds.filter((id) => id !== memberId)
              : [...memberIds, memberId];

            return { ...assignment, member_ids: newMemberIds };
          }
          return assignment;
        });

        return { ...item, main_assignments: assignments };
      }
      return item;
    });
    onChange(updated);
  };

  const getDaySchedule = (day: DayOfWeek) => {
    return schedule.find((s) => s.day === day);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-semibold mb-4">
        What Nights Are We Cooking?
      </h3>

      <div className="space-y-3">
        {days.map((day) => {
          const daySchedule = getDaySchedule(day);
          const isCooking = daySchedule?.is_cooking || false;
          const isExpanded = expandedDay === day;

          return (
            <div
              key={day}
              className={`border rounded-lg transition-all ${
                isCooking
                  ? "border-emerald-300 bg-emerald-50"
                  : "border-gray-200 bg-white"
              }`}
            >
              {/* Day Header */}
              <div className="p-4 flex items-center gap-4">
                <label className="flex items-center gap-3 flex-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isCooking}
                    onChange={(e) => {
                      console.log('Checkbox clicked!', day, 'current:', isCooking);
                      toggleCooking(day);
                    }}
                    className="w-5 h-5 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                  />
                  <span className="font-medium text-gray-900">
                    {DAY_LABELS[day]}
                  </span>
                </label>

                {isCooking && (
                  <button
                    onClick={() =>
                      setExpandedDay(isExpanded ? null : day)
                    }
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    {isExpanded ? "Hide Options" : "Configure"}
                  </button>
                )}
              </div>

              {/* Expanded Options */}
              {isCooking && isExpanded && (
                <div className="px-4 pb-4 space-y-4 border-t border-emerald-200">
                  {/* Meal Mode */}
                  <div className="pt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Meal Configuration
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setMealMode(day, "one_main")}
                        className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors text-sm ${
                          daySchedule?.meal_mode === "one_main"
                            ? "border-emerald-500 bg-emerald-100 text-emerald-700"
                            : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                        }`}
                      >
                        One Main for All
                      </button>
                      <button
                        onClick={() => setMealMode(day, "customize_mains")}
                        className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors text-sm ${
                          daySchedule?.meal_mode === "customize_mains"
                            ? "border-emerald-500 bg-emerald-100 text-emerald-700"
                            : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                        }`}
                      >
                        Customize Mains
                      </button>
                    </div>
                  </div>

                  {/* Customize Mains Options */}
                  {daySchedule?.meal_mode === "customize_mains" && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        How many different mains?
                      </label>
                      <select
                        value={daySchedule.num_mains || 2}
                        onChange={(e) =>
                          setNumMains(day, parseInt(e.target.value))
                        }
                        className="px-3 py-2 border border-gray-300 rounded-lg"
                      >
                        <option value={2}>2 mains</option>
                        <option value={3}>3 mains</option>
                        <option value={4}>4 mains</option>
                      </select>

                      {/* Member Assignments */}
                      <div className="mt-3 space-y-3">
                        {daySchedule.main_assignments?.map((assignment) => (
                          <div
                            key={assignment.main_number}
                            className="border border-gray-200 rounded-lg p-3 bg-gray-50"
                          >
                            <div className="text-sm font-medium text-gray-700 mb-2">
                              Main {assignment.main_number} is for:
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {members.map((member) => {
                                const isAssigned =
                                  assignment.member_ids?.includes(member.id) ||
                                  false;

                                return (
                                  <button
                                    key={member.id}
                                    onClick={() =>
                                      toggleMemberForMain(
                                        day,
                                        assignment.main_number,
                                        member.id
                                      )
                                    }
                                    className={`px-3 py-1 rounded-full text-sm border-2 transition-colors ${
                                      isAssigned
                                        ? "border-emerald-500 bg-emerald-100 text-emerald-700"
                                        : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"
                                    }`}
                                  >
                                    {member.name}
                                  </button>
                                );
                              })}
                            </div>
                            {(!assignment.member_ids ||
                              assignment.member_ids.length === 0) && (
                              <div className="text-xs text-red-500 mt-2">
                                ⚠️ Select at least one person
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

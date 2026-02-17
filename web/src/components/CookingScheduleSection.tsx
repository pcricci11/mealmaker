// components/CookingScheduleSection.tsx
// Compact day-of-week selector for cooking nights

import { useState } from "react";
import type {
  WeeklyCookingSchedule,
  FamilyMemberV3,
  DayOfWeek,
} from "@shared/types";
import DayConfigModal, { type DayConfig } from "./DayConfigModal";

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
  const [configModalDay, setConfigModalDay] = useState<DayOfWeek | null>(null);
  const [dayConfigs, setDayConfigs] = useState<Partial<Record<DayOfWeek, DayConfig>>>({});

  const handleDayConfigSave = (day: DayOfWeek, config: DayConfig) => {
    setDayConfigs((prev) => ({ ...prev, [day]: config }));
    setConfigModalDay(null);
  };

  const toggleCooking = (day: DayOfWeek) => {
    const updated = schedule.map((item) =>
      item.day === day
        ? { ...item, is_cooking: !item.is_cooking }
        : item
    );
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

      <div className="flex gap-2">
        {days.map((day) => {
          const isCooking = getDaySchedule(day)?.is_cooking || false;
          const hasConfig = !!dayConfigs[day];

          return (
            <div key={day} className="flex flex-col items-center gap-1">
              <button
                onClick={() => toggleCooking(day)}
                className={`w-12 h-12 rounded-full border-2 text-sm font-semibold transition-colors ${
                  isCooking
                    ? "border-orange-500 bg-orange-100 text-orange-600"
                    : "border-gray-200 bg-white text-gray-400 hover:border-gray-300 hover:text-gray-500"
                }`}
              >
                {DAY_LABELS[day]}
              </button>
              {isCooking && (
                <button
                  onClick={() => setConfigModalDay(day)}
                  className={`text-[11px] font-medium ${
                    hasConfig
                      ? "text-orange-500 hover:text-orange-600"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  {hasConfig ? "Edit" : "Configure"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {configModalDay && (
        <DayConfigModal
          day={configModalDay}
          members={members}
          initialConfig={dayConfigs[configModalDay]}
          onSave={(config) => handleDayConfigSave(configModalDay, config)}
          onClose={() => setConfigModalDay(null)}
        />
      )}
    </div>
  );
}

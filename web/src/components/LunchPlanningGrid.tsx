// components/LunchPlanningGrid.tsx
// Grid for planning who needs lunch on which days

import type { FamilyMemberV3, WeeklyLunchNeed } from "@shared/types";

interface Props {
  members: FamilyMemberV3[];
  lunchNeeds: WeeklyLunchNeed[];
  onChange: (needs: WeeklyLunchNeed[]) => void;
}

const WEEKDAYS: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday")[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
];

const DAY_LABELS = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
};

export default function LunchPlanningGrid({ members, lunchNeeds, onChange }: Props) {
  const getLunchNeed = (memberId: number, day: string) => {
    return lunchNeeds.find(
      (need) => need.member_id === memberId && need.day === day
    );
  };

  const toggleNeedsLunch = (memberId: number, day: string) => {
    console.log('Toggling lunch for member:', memberId, 'day:', day);
    console.log('Current lunchNeeds:', lunchNeeds);
    const updated = lunchNeeds.map((need) => {
      if (need.member_id === memberId && need.day === day) {
        return {
          ...need,
          needs_lunch: !need.needs_lunch,
          leftovers_ok: !need.needs_lunch ? need.leftovers_ok : false,
        };
      }
      return need;
    });
    onChange(updated);
  };

  const toggleLeftoversOk = (memberId: number, day: string) => {
    const updated = lunchNeeds.map((need) => {
      if (need.member_id === memberId && need.day === day) {
        return { ...need, leftovers_ok: !need.leftovers_ok };
      }
      return need;
    });
    onChange(updated);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-semibold mb-4">Lunch Planning</h3>
      <p className="text-sm text-gray-600 mb-4">
        Who needs lunch on which days? Check if leftovers are okay.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-300">
              <th className="text-left py-3 px-4 font-semibold text-gray-700">
                Family Member
              </th>
              {WEEKDAYS.map((day) => (
                <th
                  key={day}
                  className="text-center py-3 px-2 font-semibold text-gray-700"
                >
                  {DAY_LABELS[day]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id} className="border-b border-gray-200 hover:bg-gray-50">
                <td className="py-3 px-4 font-medium text-gray-900">
                  {member.name}
                </td>
                {WEEKDAYS.map((day) => {
                  const need = getLunchNeed(member.id, day);
                  const needsLunch = need?.needs_lunch || false;
                  const leftoversOk = need?.leftovers_ok || false;

                  return (
                    <td key={day} className="py-3 px-2 text-center">
                      <div className="flex flex-col items-center gap-1">
                        {/* Needs Lunch Checkbox */}
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={needsLunch}
                            onChange={() => toggleNeedsLunch(member.id, day)}
                            className="w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500"
                          />
                          <span className="text-xs text-gray-600">Lunch</span>
                        </label>

                        {/* Leftovers OK Checkbox (only show if needs lunch) */}
                        {needsLunch && (
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={leftoversOk}
                              onChange={() => toggleLeftoversOk(member.id, day)}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <span className="text-xs text-gray-600">Leftovers</span>
                          </label>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-4 flex gap-6 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={true}
            readOnly
            className="w-4 h-4 text-orange-500 border-gray-300 rounded pointer-events-none"
          />
          <span>Needs Lunch</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={true}
            readOnly
            className="w-4 h-4 text-blue-600 border-gray-300 rounded pointer-events-none"
          />
          <span>Leftovers OK</span>
        </div>
      </div>
    </div>
  );
}

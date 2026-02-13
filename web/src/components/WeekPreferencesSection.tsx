// components/WeekPreferencesSection.tsx
// Section for cook time limits and vegetarian ratio

interface Props {
  maxCookMinutesWeekday: number;
  maxCookMinutesWeekend: number;
  vegetarianRatio: number;
  onChangeWeekday: (value: number) => void;
  onChangeWeekend: (value: number) => void;
  onChangeVegRatio: (value: number) => void;
}

export default function WeekPreferencesSection({
  maxCookMinutesWeekday,
  maxCookMinutesWeekend,
  vegetarianRatio,
  onChangeWeekday,
  onChangeWeekend,
  onChangeVegRatio,
}: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-semibold mb-4">This Week's Preferences</h3>

      <div className="space-y-6">
        {/* Cook Time - Weekday */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Max Cook Time - Weekdays
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="15"
              max="120"
              step="5"
              value={maxCookMinutesWeekday}
              onChange={(e) => onChangeWeekday(parseInt(e.target.value))}
              className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
            />
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={maxCookMinutesWeekday}
                onChange={(e) => onChangeWeekday(parseInt(e.target.value) || 45)}
                min="15"
                max="120"
                className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center"
              />
              <span className="text-sm text-gray-600">min</span>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Mon-Fri: Maximum time you're willing to spend cooking
          </p>
        </div>

        {/* Cook Time - Weekend */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Max Cook Time - Weekends
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="15"
              max="180"
              step="5"
              value={maxCookMinutesWeekend}
              onChange={(e) => onChangeWeekend(parseInt(e.target.value))}
              className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
            />
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={maxCookMinutesWeekend}
                onChange={(e) => onChangeWeekend(parseInt(e.target.value) || 90)}
                min="15"
                max="180"
                className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center"
              />
              <span className="text-sm text-gray-600">min</span>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Sat-Sun: More time available for elaborate meals
          </p>
        </div>

        {/* Vegetarian Ratio */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Vegetarian Ratio
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="0"
              max="100"
              step="10"
              value={vegetarianRatio}
              onChange={(e) => onChangeVegRatio(parseInt(e.target.value))}
              className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
            />
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={vegetarianRatio}
                onChange={(e) => onChangeVegRatio(parseInt(e.target.value) || 40)}
                min="0"
                max="100"
                step="10"
                className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center"
              />
              <span className="text-sm text-gray-600">%</span>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Percentage of meals that should be vegetarian
          </p>

          {/* Visual indicator */}
          <div className="mt-3 flex items-center gap-2 text-sm">
            <div className="flex-1 bg-gray-200 rounded-full h-6 overflow-hidden flex">
              <div
                className="bg-green-500 flex items-center justify-center text-white text-xs font-medium"
                style={{ width: `${vegetarianRatio}%` }}
              >
                {vegetarianRatio > 20 && `${vegetarianRatio}% Veg`}
              </div>
              <div className="flex-1 flex items-center justify-center text-gray-700 text-xs font-medium">
                {100 - vegetarianRatio > 20 && `${100 - vegetarianRatio}% Meat`}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

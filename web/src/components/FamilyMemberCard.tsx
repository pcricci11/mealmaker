// components/FamilyMemberCard.tsx
// Display card for a single family member

import type { FamilyMemberV3 } from "@shared/types";

interface Props {
  member: FamilyMemberV3;
  onEdit: () => void;
  onDelete: () => void;
}

export default function FamilyMemberCard({ member, onEdit, onDelete }: Props) {
  const dietaryStyleLabel: Record<string, string> = {
    omnivore: "Omnivore",
    vegetarian: "Vegetarian",
    vegan: "Vegan",
  };

  const dietaryStyleColor: Record<string, string> = {
    omnivore: "bg-gray-100 text-gray-700",
    vegetarian: "bg-green-100 text-green-700",
    vegan: "bg-emerald-100 text-emerald-700",
  };

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between">
        {/* Member Info */}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="font-semibold text-gray-900">{member.name}</h4>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                dietaryStyleColor[member.dietary_style]
              }`}
            >
              {dietaryStyleLabel[member.dietary_style]}
            </span>
          </div>

          {/* Dietary Info */}
          <div className="space-y-1 text-sm">
            {member.allergies && member.allergies.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-gray-500 shrink-0">Allergies:</span>
                <span className="text-red-600 font-medium">
                  {member.allergies.join(", ")}
                </span>
              </div>
            )}

            {member.dislikes && member.dislikes.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-gray-500 shrink-0">Dislikes:</span>
                <span className="text-gray-700">
                  {member.dislikes.join(", ")}
                </span>
              </div>
            )}

            {member.favorites && member.favorites.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-gray-500 shrink-0">Favorites:</span>
                <span className="text-emerald-600 font-medium">
                  {member.favorites.join(", ")}
                </span>
              </div>
            )}

            {member.no_spicy && (
              <div className="flex items-center gap-2">
                <span className="text-orange-600 text-xs font-medium">
                  🌶️ No Spicy Food
                </span>
              </div>
            )}

            {/* Show message if no preferences set */}
            {(!member.allergies || member.allergies.length === 0) &&
              (!member.dislikes || member.dislikes.length === 0) &&
              (!member.favorites || member.favorites.length === 0) &&
              !member.no_spicy && (
                <div className="text-gray-400 text-sm italic">
                  No dietary preferences set
                </div>
              )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 ml-4">
          <button
            onClick={onEdit}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            className="text-sm text-red-600 hover:text-red-700 font-medium"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

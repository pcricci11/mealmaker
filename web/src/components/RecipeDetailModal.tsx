import { useState } from "react";
import type { Recipe } from "@shared/types";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Light-theme cuisine colors (duplicated from MyRecipes for tag badges)
const LIGHT_CUISINE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  italian:        { bg: "#FEF2F2", text: "#DC2626", border: "#FECACA" },
  american:       { bg: "#EFF6FF", text: "#2563EB", border: "#BFDBFE" },
  french:         { bg: "#F5F3FF", text: "#7C3AED", border: "#DDD6FE" },
  mediterranean:  { bg: "#ECFDF5", text: "#059669", border: "#A7F3D0" },
  middle_eastern: { bg: "#FFF7ED", text: "#EA580C", border: "#FED7AA" },
  thai:           { bg: "#FFFBEB", text: "#D97706", border: "#FDE68A" },
  mexican:        { bg: "#FFF7ED", text: "#EA580C", border: "#FED7AA" },
  indian:         { bg: "#FFFBEB", text: "#D97706", border: "#FDE68A" },
  chinese:        { bg: "#FFF1F2", text: "#E11D48", border: "#FECDD3" },
  japanese:       { bg: "#FDF2F8", text: "#DB2777", border: "#FBCFE8" },
  korean:         { bg: "#F5F3FF", text: "#7C3AED", border: "#DDD6FE" },
  ethiopian:      { bg: "#ECFDF5", text: "#059669", border: "#A7F3D0" },
};

const DAY_CHIPS = [
  { key: "monday", label: "Mon" },
  { key: "tuesday", label: "Tue" },
  { key: "wednesday", label: "Wed" },
  { key: "thursday", label: "Thu" },
  { key: "friday", label: "Fri" },
  { key: "saturday", label: "Sat" },
  { key: "sunday", label: "Sun" },
] as const;

interface Props {
  recipe: Recipe;
  isLoved: boolean;
  onClose: () => void;
  onAddToDay: (day: string) => void;
  onToggleLoved: () => void;
  onDelete: () => void;
  onRename: () => void;
  onSaveNotes: (notes: string) => void;
  addingToDay: string | null;
  savingNotes: boolean;
}

export default function RecipeDetailModal({
  recipe,
  isLoved,
  onClose,
  onAddToDay,
  onToggleLoved,
  onDelete,
  onRename,
  onSaveNotes,
  addingToDay,
  savingNotes,
}: Props) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState(recipe.notes || "");
  const [imageError, setImageError] = useState(false);

  const cuisineColor = LIGHT_CUISINE_COLORS[recipe.cuisine] || LIGHT_CUISINE_COLORS.american;
  const showImage = recipe.image_url && !imageError;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="p-0 overflow-hidden max-w-md overflow-y-auto" fullScreenMobile={false}>
        <DialogTitle className="sr-only">{recipe.title}</DialogTitle>

        {/* Hero section */}
        <div
          className="relative h-[180px] flex flex-col justify-end p-5"
          style={showImage ? undefined : {
            background: "linear-gradient(to top, #2C2824, #3E3832)",
          }}
        >
          {showImage && (
            <img
              src={recipe.image_url!}
              alt={recipe.title}
              className="absolute inset-0 w-full h-full object-cover"
              onError={() => setImageError(true)}
            />
          )}
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

          {/* Love button */}
          <button
            onClick={onToggleLoved}
            className={cn(
              "absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-all shadow-sm z-10",
              isLoved ? "bg-white text-red-500" : "bg-white/80 text-stone-400 hover:text-red-500 hover:bg-white"
            )}
          >
            {isLoved ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            )}
          </button>

          {/* Title */}
          <div className="relative z-10">
            <h2 className="font-display text-xl md:text-2xl font-bold text-white leading-tight">
              {recipe.title}
            </h2>
            {recipe.source_name && (
              <span className="text-xs text-amber-200/90 mt-0.5 block">
                {recipe.source_name}
              </span>
            )}
          </div>
        </div>

        {/* Tags row */}
        <div className="px-5 pt-4 flex flex-wrap items-center gap-2">
          <span
            className="px-2.5 py-0.5 rounded-full text-xs font-medium capitalize"
            style={{
              backgroundColor: cuisineColor.bg,
              color: cuisineColor.text,
              border: `1px solid ${cuisineColor.border}`,
            }}
          >
            {recipe.cuisine.replace("_", " ")}
          </span>
          <span className="flex items-center gap-1 text-xs text-stone-500">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {recipe.cook_minutes} min
          </span>
          <span className="text-xs text-stone-400 capitalize">{recipe.difficulty}</span>
          {recipe.vegetarian && (
            <span className="text-xs text-emerald-600 font-medium">Veggie</span>
          )}
          {recipe.source_url && (
            <a
              href={recipe.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-chef-orange hover:text-orange-600 font-medium ml-auto"
            >
              {recipe.source_name || "Source"}
            </a>
          )}
        </div>

        {/* Day picker */}
        <div className="px-5 pt-4">
          <p className="text-xs font-medium text-stone-500 mb-1.5">Add to this week:</p>
          <div className="flex flex-wrap gap-1.5">
            {DAY_CHIPS.map(({ key, label }) => (
              <button
                key={key}
                disabled={addingToDay !== null}
                onClick={() => onAddToDay(key)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                  addingToDay === key
                    ? "bg-orange-200 text-orange-800 animate-pulse"
                    : "bg-orange-50 text-chef-orange hover:bg-orange-100",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                {addingToDay === key ? "Adding..." : label}
              </button>
            ))}
          </div>
        </div>

        {/* Notes section */}
        <div className="px-5 pt-4">
          {editingNotes ? (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-stone-500">Notes</label>
              <textarea
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
                placeholder="Tips, tweaks, what the family thought..."
                rows={3}
                className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-chef-orange/30 focus:border-chef-orange resize-none"
                autoFocus
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="rounded-lg"
                  onClick={() => { onSaveNotes(notesValue); setEditingNotes(false); }}
                  disabled={savingNotes}
                >
                  {savingNotes ? "Saving..." : "Save Notes"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setEditingNotes(false); setNotesValue(recipe.notes || ""); }}
                  disabled={savingNotes}
                >
                  Cancel
                </Button>
                {recipe.notes && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-600 ml-auto"
                    onClick={() => { onSaveNotes(""); setEditingNotes(false); }}
                    disabled={savingNotes}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
          ) : recipe.notes ? (
            <div
              className="bg-amber-50/80 border border-amber-200/60 rounded-xl px-3 py-2 cursor-pointer hover:bg-amber-100/80 transition-colors"
              onClick={() => { setEditingNotes(true); setNotesValue(recipe.notes || ""); }}
            >
              <p className="text-xs font-medium text-amber-700 mb-0.5">Notes</p>
              <p className="text-sm text-stone-700 whitespace-pre-wrap font-body">{recipe.notes}</p>
            </div>
          ) : (
            <button
              onClick={() => { setEditingNotes(true); setNotesValue(""); }}
              className="text-xs text-chef-orange hover:text-orange-600 font-medium"
            >
              + Add Notes
            </button>
          )}
        </div>

        {/* Action buttons */}
        <div className="px-5 pt-4 pb-5 space-y-2">
          {recipe.source_url && (
            <button
              onClick={() => window.open(recipe.source_url!, "_blank", "noopener,noreferrer")}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-colors"
              style={{ background: "linear-gradient(135deg, #EA580C, #C2410C)" }}
            >
              View Full Recipe
            </button>
          )}
          <button
            onClick={onRename}
            className="w-full py-2.5 rounded-lg text-sm font-medium bg-stone-100 text-stone-700 hover:bg-stone-200 transition-colors"
          >
            Rename
          </button>
          <button
            onClick={onDelete}
            className="w-full py-2.5 rounded-lg text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
          >
            Delete
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

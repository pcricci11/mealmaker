import { useState, useEffect } from "react";
import type {
  Family,
  FamilyMember,
  FamilyMemberInput,
  FamilyFavoriteChef,
  FamilyFavoriteWebsite,
  ServingMultiplier,
} from "@shared/types";
import {
  getFamilies,
  createFamily,
  updateFamily,
  getMembers,
  createMember,
  updateMember,
  deleteMember,
  getFavoriteChefs,
  createFavoriteChef,
  deleteFavoriteChef,
  getFavoriteWebsites,
  createFavoriteWebsite,
  deleteFavoriteWebsite,
} from "../api";
import FamilyMemberCard from "../components/FamilyMemberCard";
import FamilyMemberModal from "../components/FamilyMemberModal";

const SERVING_OPTIONS: { value: ServingMultiplier; label: string; desc: string }[] = [
  { value: "normal", label: "1x", desc: "Standard" },
  { value: "hearty", label: "1.5x", desc: "Hearty" },
  { value: "extra_large", label: "2x", desc: "Extra Large" },
];

export default function MyFamily() {
  const [family, setFamily] = useState<Family | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [chefs, setChefs] = useState<FamilyFavoriteChef[]>([]);
  const [websites, setWebsites] = useState<FamilyFavoriteWebsite[]>([]);
  const [loading, setLoading] = useState(true);

  // Family name editing
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  // Member modal
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<FamilyMember | null>(null);

  // Preferences (local state, saved on slider release)
  const [servingMultiplier, setServingMultiplier] = useState<ServingMultiplier>("normal");
  const [maxCookWeekday, setMaxCookWeekday] = useState(45);
  const [maxCookWeekend, setMaxCookWeekend] = useState(90);
  const [vegRatio, setVegRatio] = useState(0);

  // Chef input
  const [newChefName, setNewChefName] = useState("");
  const [addingChef, setAddingChef] = useState(false);

  // Website input
  const [newWebsiteName, setNewWebsiteName] = useState("");
  const [addingWebsite, setAddingWebsite] = useState(false);

  // Save feedback
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const families = await getFamilies();
      if (families.length > 0) {
        const f = families[0];
        setFamily(f);
        setNameDraft(f.name);
        setServingMultiplier(f.serving_multiplier || "normal");
        setMaxCookWeekday(f.max_cook_minutes_weekday);
        setMaxCookWeekend(f.max_cook_minutes_weekend);
        setVegRatio(f.vegetarian_ratio);

        const [membersData, chefsData, websitesData] = await Promise.all([
          getMembers(f.id),
          getFavoriteChefs(f.id),
          getFavoriteWebsites(f.id),
        ]);
        setMembers(membersData);
        setChefs(chefsData);
        setWebsites(websitesData);
      }
    } catch (err) {
      console.error("Failed to load family data:", err);
    } finally {
      setLoading(false);
    }
  };

  const flashSaved = () => {
    setSaveStatus("Saved!");
    setTimeout(() => setSaveStatus(null), 1500);
  };

  // ── Family name ──
  const saveFamilyName = async () => {
    if (!family || !nameDraft.trim()) return;
    const updated = await updateFamily(family.id, { name: nameDraft.trim() });
    setFamily(updated);
    setEditingName(false);
    flashSaved();
  };

  // ── Preferences ──
  const savePreference = async (data: Record<string, any>) => {
    if (!family) return;
    const updated = await updateFamily(family.id, data);
    setFamily(updated);
    flashSaved();
  };

  // ── Members ──
  const handleSaveMember = async (data: Partial<FamilyMember>) => {
    if (!family) return;
    if (editingMember) {
      const updated = await updateMember(family.id, editingMember.id, {
        ...editingMember,
        ...data,
        family_id: family.id,
      } as FamilyMemberInput);
      setMembers((prev) => prev.map((m) => (m.id === editingMember.id ? updated : m)));
    } else {
      const created = await createMember(family.id, {
        family_id: family.id,
        name: data.name || "",
        dietary_style: data.dietary_style || "omnivore",
        allergies: data.allergies || [],
        dislikes: data.dislikes || [],
        favorites: data.favorites || [],
        no_spicy: data.no_spicy || false,
      });
      setMembers((prev) => [...prev, created]);
    }
    setMemberModalOpen(false);
    setEditingMember(null);
  };

  const handleDeleteMember = async (m: FamilyMember) => {
    if (!family) return;
    if (!confirm(`Remove ${m.name} from the family?`)) return;
    await deleteMember(family.id, m.id);
    setMembers((prev) => prev.filter((x) => x.id !== m.id));
  };

  // ── Chefs ──
  const handleAddChef = async () => {
    if (!family || !newChefName.trim()) return;
    setAddingChef(true);
    try {
      const created = await createFavoriteChef(family.id, newChefName.trim());
      setChefs((prev) => [...prev, created]);
      setNewChefName("");
    } finally {
      setAddingChef(false);
    }
  };

  const handleDeleteChef = async (id: number) => {
    await deleteFavoriteChef(id);
    setChefs((prev) => prev.filter((c) => c.id !== id));
  };

  // ── Websites ──
  const handleAddWebsite = async () => {
    if (!family || !newWebsiteName.trim()) return;
    setAddingWebsite(true);
    try {
      const created = await createFavoriteWebsite(family.id, newWebsiteName.trim());
      setWebsites((prev) => [...prev, created]);
      setNewWebsiteName("");
    } finally {
      setAddingWebsite(false);
    }
  };

  const handleDeleteWebsite = async (id: number) => {
    await deleteFavoriteWebsite(id);
    setWebsites((prev) => prev.filter((w) => w.id !== id));
  };

  // ── Loading / empty states ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading family...</div>
      </div>
    );
  }

  if (!family) {
    return (
      <div className="max-w-2xl mx-auto py-8 text-center space-y-4">
        <h2 className="text-2xl font-bold text-gray-900">Welcome to Yes Chef</h2>
        <p className="text-gray-500">Create a family profile to get started.</p>
        <button
          onClick={async () => {
            const created = await createFamily({
              name: "My Family",
              allergies: [],
              vegetarian_ratio: 0,
              gluten_free: false,
              dairy_free: false,
              nut_free: false,
              max_cook_minutes_weekday: 45,
              max_cook_minutes_weekend: 90,
              leftovers_nights_per_week: 1,
              picky_kid_mode: false,
              planning_mode: "strictest_household",
            });
            setFamily(created);
            setNameDraft(created.name);
          }}
          className="px-6 py-3 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors"
        >
          Create Family Profile
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-4 space-y-8">
      {/* Save toast */}
      {saveStatus && (
        <div className="fixed top-16 right-4 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg z-50">
          {saveStatus}
        </div>
      )}

      {/* ────────────────────────────────────── */}
      {/* SECTION 1: FAMILY INFO                 */}
      {/* ────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">Family Info</h2>
        </div>

        <div className="p-6 space-y-6">
          {/* Family Name */}
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveFamilyName();
                  if (e.key === "Escape") {
                    setEditingName(false);
                    setNameDraft(family.name);
                  }
                }}
                autoFocus
                className="text-2xl font-bold text-gray-900 border-b-2 border-emerald-500 outline-none bg-transparent py-1 w-full max-w-sm"
              />
              <button
                onClick={saveFamilyName}
                className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setEditingName(false);
                  setNameDraft(family.name);
                }}
                className="text-sm text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h3 className="text-2xl font-bold text-gray-900">{family.name}</h3>
              <button
                onClick={() => setEditingName(true)}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1"
                title="Edit family name"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                  />
                </svg>
              </button>
            </div>
          )}

          {/* Members */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                Members ({members.length})
              </h4>
              <button
                onClick={() => {
                  setEditingMember(null);
                  setMemberModalOpen(true);
                }}
                className="text-sm font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Add Member
              </button>
            </div>

            {members.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-gray-300 rounded-lg">
                <p className="text-gray-400 text-sm">No family members yet.</p>
                <button
                  onClick={() => {
                    setEditingMember(null);
                    setMemberModalOpen(true);
                  }}
                  className="mt-2 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
                >
                  Add your first member
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {members.map((m) => (
                  <FamilyMemberCard
                    key={m.id}
                    member={m}
                    onEdit={() => {
                      setEditingMember(m);
                      setMemberModalOpen(true);
                    }}
                    onDelete={() => handleDeleteMember(m)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ────────────────────────────────────── */}
      {/* SECTION 2: PREFERENCES                 */}
      {/* ────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">Preferences</h2>
        </div>

        <div className="p-6 space-y-8">
          {/* Serving Multiplier */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Serving Size
            </label>
            <div className="flex gap-2">
              {SERVING_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setServingMultiplier(opt.value);
                    savePreference({ serving_multiplier: opt.value });
                  }}
                  className={`flex-1 px-4 py-3 rounded-lg border-2 text-center transition-colors ${
                    servingMultiplier === opt.value
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700 font-semibold"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  <div className="text-lg font-bold">{opt.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Max Cook Time — Weekday */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">
                Max Cook Time (Weekday)
              </label>
              <span className="text-sm font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                {maxCookWeekday} min
              </span>
            </div>
            <input
              type="range"
              min={15}
              max={120}
              step={5}
              value={maxCookWeekday}
              onChange={(e) => setMaxCookWeekday(Number(e.target.value))}
              onMouseUp={() =>
                savePreference({ max_cook_minutes_weekday: maxCookWeekday })
              }
              onTouchEnd={() =>
                savePreference({ max_cook_minutes_weekday: maxCookWeekday })
              }
              className="w-full accent-emerald-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>15 min</span>
              <span>1 hr</span>
              <span>2 hrs</span>
            </div>
          </div>

          {/* Max Cook Time — Weekend */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">
                Max Cook Time (Weekend)
              </label>
              <span className="text-sm font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                {maxCookWeekend} min
              </span>
            </div>
            <input
              type="range"
              min={15}
              max={180}
              step={5}
              value={maxCookWeekend}
              onChange={(e) => setMaxCookWeekend(Number(e.target.value))}
              onMouseUp={() =>
                savePreference({ max_cook_minutes_weekend: maxCookWeekend })
              }
              onTouchEnd={() =>
                savePreference({ max_cook_minutes_weekend: maxCookWeekend })
              }
              className="w-full accent-emerald-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>15 min</span>
              <span>1.5 hrs</span>
              <span>3 hrs</span>
            </div>
          </div>

          {/* Vegetarian Ratio */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">
                Vegetarian Meals
              </label>
              <span className="text-sm font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                {vegRatio}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={10}
              value={vegRatio}
              onChange={(e) => setVegRatio(Number(e.target.value))}
              onMouseUp={() => savePreference({ vegetarian_ratio: vegRatio })}
              onTouchEnd={() => savePreference({ vegetarian_ratio: vegRatio })}
              className="w-full accent-emerald-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>All Meat</span>
              <span>Mixed</span>
              <span>All Vegetarian</span>
            </div>
          </div>
        </div>
      </section>

      {/* ────────────────────────────────────── */}
      {/* SECTION 3: FAVORITE CHEFS              */}
      {/* ────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">Favorite Chefs</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            We'll prioritize recipes from these chefs when planning meals.
          </p>
        </div>

        <div className="p-6 space-y-4">
          {/* Add chef */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newChefName}
              onChange={(e) => setNewChefName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newChefName.trim()) handleAddChef();
              }}
              placeholder="e.g., Ina Garten, J. Kenji Lopez-Alt"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              disabled={addingChef}
            />
            <button
              onClick={handleAddChef}
              disabled={addingChef || !newChefName.trim()}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {addingChef ? "Adding..." : "Add"}
            </button>
          </div>

          {/* Chef list */}
          {chefs.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">
              No favorite chefs yet. Add chefs whose recipes you love!
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {chefs.map((chef) => (
                <span
                  key={chef.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-full text-sm font-medium"
                >
                  {chef.name}
                  <button
                    onClick={() => handleDeleteChef(chef.id)}
                    className="text-amber-400 hover:text-amber-700 transition-colors"
                    title="Remove chef"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ────────────────────────────────────── */}
      {/* SECTION 4: FAVORITE WEBSITES            */}
      {/* ────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">Favorite Websites</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            We'll prioritize recipes from these sources when planning meals.
          </p>
        </div>

        <div className="p-6 space-y-4">
          {/* Add website */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newWebsiteName}
              onChange={(e) => setNewWebsiteName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newWebsiteName.trim()) handleAddWebsite();
              }}
              placeholder="e.g., NYT Cooking, Serious Eats, Bon Appetit"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              disabled={addingWebsite}
            />
            <button
              onClick={handleAddWebsite}
              disabled={addingWebsite || !newWebsiteName.trim()}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {addingWebsite ? "Adding..." : "Add"}
            </button>
          </div>

          {/* Website list */}
          {websites.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">
              No favorite websites yet. Add sites whose recipes you love!
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {websites.map((website) => (
                <span
                  key={website.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-full text-sm font-medium"
                >
                  {website.name}
                  <button
                    onClick={() => handleDeleteWebsite(website.id)}
                    className="text-amber-400 hover:text-amber-700 transition-colors"
                    title="Remove website"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Member Modal */}
      {memberModalOpen && (
        <FamilyMemberModal
          member={editingMember}
          onSave={handleSaveMember}
          onClose={() => {
            setMemberModalOpen(false);
            setEditingMember(null);
          }}
        />
      )}
    </div>
  );
}

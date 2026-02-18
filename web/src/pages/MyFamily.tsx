import { useState, useEffect } from "react";
import type {
  Family,
  FamilyMember,
  FamilyMemberInput,
  FamilyFavoriteChef,
  FamilyFavoriteWebsite,
} from "@shared/types";
import { VALID_CUISINES } from "@shared/types";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useHousehold } from "../context/HouseholdContext";

const SERVING_OPTIONS: { value: number; label: string; desc: string }[] = [
  { value: 0.5, label: "0.5x", desc: "Small" },
  { value: 1.0, label: "1x", desc: "Standard" },
  { value: 1.5, label: "1.5x", desc: "Hearty" },
  { value: 2.0, label: "2x", desc: "Extra Large" },
];

export default function MyFamily() {
  const { household } = useHousehold();
  const [inviteCodeCopied, setInviteCodeCopied] = useState(false);
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

  // Portion sizing
  const [servingMultiplier, setServingMultiplier] = useState<number>(1.0);

  // Chef input
  const [newChefName, setNewChefName] = useState("");
  const [newChefCuisines, setNewChefCuisines] = useState<string[]>([]);
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
        setServingMultiplier(f.serving_multiplier ?? 1.0);

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
      const created = await createFavoriteChef(family.id, newChefName.trim(), newChefCuisines.length > 0 ? newChefCuisines : undefined);
      setChefs((prev) => [...prev, created]);
      setNewChefName("");
      setNewChefCuisines([]);
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
        <Button
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
          size="lg"
        >
          Create Family Profile
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-4 space-y-8">
      {/* Save toast */}
      {saveStatus && (
        <div className="fixed top-16 right-4 bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg z-50">
          {saveStatus}
        </div>
      )}

      {/* ────────────────────────────────────── */}
      {/* YOUR KITCHEN                            */}
      {/* ────────────────────────────────────── */}
      {household && (
        <Card className="overflow-hidden">
          <div className="px-4 md:px-6 py-4 bg-gray-50 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900">Your Kitchen</h2>
          </div>
          <div className="p-4 md:p-6 space-y-3">
            <h3 className="text-xl font-bold text-gray-900">{household.name}</h3>
            <div>
              <p className="text-sm text-gray-500 mb-2">Invite Code</p>
              <div className="flex items-center gap-2">
                <span className="font-mono text-lg font-semibold text-orange-700 bg-orange-50 px-3 py-1.5 rounded-md select-all">
                  {household.invite_code}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(household.invite_code);
                      setInviteCodeCopied(true);
                      setTimeout(() => setInviteCodeCopied(false), 1500);
                    } catch {
                      setInviteCodeCopied(true);
                      setTimeout(() => setInviteCodeCopied(false), 1500);
                    }
                  }}
                >
                  {inviteCodeCopied ? "Copied!" : "Copy"}
                </Button>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Share this code with family members so they can join your kitchen.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* ────────────────────────────────────── */}
      {/* SECTION 1: FAMILY INFO                 */}
      {/* ────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <div className="px-4 md:px-6 py-4 bg-gray-50 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">Family Info</h2>
        </div>

        <div className="p-4 md:p-6 space-y-6">
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
                className="text-2xl font-bold text-gray-900 border-b-2 border-orange-500 outline-none bg-transparent py-1 w-full max-w-sm"
              />
              <Button variant="link" onClick={saveFamilyName} className="h-auto p-0">
                Save
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setEditingName(false);
                  setNameDraft(family.name);
                }}
                className="h-auto p-0 text-gray-400 hover:text-gray-600"
              >
                Cancel
              </Button>
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
              <Button
                variant="link"
                onClick={() => {
                  setEditingMember(null);
                  setMemberModalOpen(true);
                }}
                className="h-auto p-0 text-sm flex items-center gap-1"
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
              </Button>
            </div>

            {members.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-gray-300 rounded-lg">
                <p className="text-gray-400 text-sm">No family members yet.</p>
                <Button
                  variant="link"
                  onClick={() => {
                    setEditingMember(null);
                    setMemberModalOpen(true);
                  }}
                  className="mt-2 h-auto p-0 text-sm"
                >
                  Add your first member
                </Button>
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
      </Card>

      {/* ────────────────────────────────────── */}
      {/* SECTION 2: PORTION SIZING              */}
      {/* ────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <div className="px-4 md:px-6 py-4 bg-gray-50 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">Portion Sizing</h2>
        </div>

        <div className="p-4 md:p-6 space-y-4">
          <p className="text-sm text-gray-500">
            Per person, does your family tend to eat more, less, or the same as the average person? This will auto-adjust your grocery list amounts when shopping.
          </p>
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
                    ? "border-orange-500 bg-orange-50 text-orange-600 font-semibold"
                    : "border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                <div className="text-lg font-bold">{opt.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* ────────────────────────────────────── */}
      {/* SECTION 3: FAVORITE CHEFS              */}
      {/* ────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <div className="px-4 md:px-6 py-4 bg-gray-50 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">Favorite Chefs</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            We'll prioritize recipes from these chefs when planning meals.
          </p>
        </div>

        <div className="p-4 md:p-6 space-y-4">
          {/* Add chef */}
          <div className="flex gap-2">
            <Input
              value={newChefName}
              onChange={(e) => setNewChefName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newChefName.trim()) handleAddChef();
              }}
              placeholder="e.g., Ina Garten, J. Kenji Lopez-Alt"
              disabled={addingChef}
            />
            <Button
              onClick={handleAddChef}
              disabled={addingChef || !newChefName.trim()}
              size="sm"
            >
              {addingChef ? "Adding..." : "Add"}
            </Button>
          </div>

          {/* Cuisine tags (optional) */}
          <div>
            <p className="text-xs text-gray-400 mb-1.5">Cuisines (optional):</p>
            <div className="flex flex-wrap gap-1.5">
              {VALID_CUISINES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() =>
                    setNewChefCuisines((prev) =>
                      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
                    )
                  }
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    newChefCuisines.includes(c)
                      ? "bg-orange-100 text-orange-800 border-orange-300"
                      : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {c.replace("_", " ")}
                </button>
              ))}
            </div>
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
                  {chef.cuisines && chef.cuisines.length > 0 && (
                    <span className="text-xs text-amber-500 font-normal">
                      ({chef.cuisines.map((c) => c.replace("_", " ")).join(", ")})
                    </span>
                  )}
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
      </Card>

      {/* ────────────────────────────────────── */}
      {/* SECTION 4: FAVORITE WEBSITES            */}
      {/* ────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <div className="px-4 md:px-6 py-4 bg-gray-50 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">Favorite Websites</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            We'll prioritize recipes from these sources when planning meals.
          </p>
        </div>

        <div className="p-4 md:p-6 space-y-4">
          {/* Add website */}
          <div className="flex gap-2">
            <Input
              value={newWebsiteName}
              onChange={(e) => setNewWebsiteName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newWebsiteName.trim()) handleAddWebsite();
              }}
              placeholder="e.g., NYT Cooking, Serious Eats, Bon Appetit"
              disabled={addingWebsite}
            />
            <Button
              onClick={handleAddWebsite}
              disabled={addingWebsite || !newWebsiteName.trim()}
              size="sm"
            >
              {addingWebsite ? "Adding..." : "Add"}
            </Button>
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
      </Card>

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

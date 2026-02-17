import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { Family, FamilyInput, FamilyMember, FamilyMemberInput, DietaryStyle } from "@shared/types";
import { VALID_DIETARY_STYLES, VALID_ALLERGENS } from "@shared/types";
import { getFamilies, createFamily, updateFamily, getMembers, createMember, updateMember, deleteMember } from "../api";

const ALLERGY_OPTIONS = [...VALID_ALLERGENS];

const defaultProfile: FamilyInput = {
  name: "",
  allergies: [],
  vegetarian_ratio: 30,
  gluten_free: false,
  dairy_free: false,
  nut_free: false,
  max_cook_minutes_weekday: 45,
  max_cook_minutes_weekend: 90,
  leftovers_nights_per_week: 1,
  picky_kid_mode: false,
  planning_mode: "strictest_household",
};

const defaultMember: FamilyMemberInput = {
  family_id: 0,
  name: "",
  dietary_style: "omnivore",
  allergies: [],
  dislikes: [],
  favorites: [],
  no_spicy: false,
};

export default function FamilyProfile() {
  const navigate = useNavigate();
  const [family, setFamily] = useState<Family | null>(null);
  const [form, setForm] = useState<FamilyInput>(defaultProfile);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Members state
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [editingMember, setEditingMember] = useState<FamilyMemberInput | null>(null);
  const [editingMemberId, setEditingMemberId] = useState<number | null>(null);
  const [memberSaving, setMemberSaving] = useState(false);

  useEffect(() => {
    getFamilies().then((families) => {
      if (families.length > 0) {
        const f = families[0];
        setFamily(f);
        setForm({
          name: f.name,
          allergies: f.allergies,
          vegetarian_ratio: f.vegetarian_ratio,
          gluten_free: f.gluten_free,
          dairy_free: f.dairy_free,
          nut_free: f.nut_free,
          max_cook_minutes_weekday: f.max_cook_minutes_weekday,
          max_cook_minutes_weekend: f.max_cook_minutes_weekend,
          leftovers_nights_per_week: f.leftovers_nights_per_week,
          picky_kid_mode: f.picky_kid_mode,
          planning_mode: f.planning_mode,
        });
        getMembers(f.id).then(setMembers);
      }
    });
  }, []);

  const toggleAllergy = (a: string) => {
    setForm((prev) => ({
      ...prev,
      allergies: prev.allergies.includes(a)
        ? prev.allergies.filter((x) => x !== a)
        : [...prev.allergies, a],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      if (family) {
        const updated = await updateFamily(family.id, form);
        setFamily(updated);
      } else {
        const created = await createFamily(form);
        setFamily(created);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  // ── Member handlers ──
  const startAddMember = () => {
    setEditingMember({ ...defaultMember, family_id: family?.id || 0 });
    setEditingMemberId(null);
  };

  const startEditMember = (m: FamilyMember) => {
    setEditingMember({
      family_id: m.family_id,
      name: m.name,
      dietary_style: m.dietary_style,
      allergies: [...m.allergies],
      dislikes: [...m.dislikes],
      favorites: [...m.favorites],
      no_spicy: m.no_spicy,
    });
    setEditingMemberId(m.id);
  };

  const cancelEditMember = () => {
    setEditingMember(null);
    setEditingMemberId(null);
  };

  const handleSaveMember = async () => {
    if (!family || !editingMember) return;
    setMemberSaving(true);
    try {
      if (editingMemberId) {
        const updated = await updateMember(family.id, editingMemberId, editingMember);
        setMembers((prev) => prev.map((m) => (m.id === editingMemberId ? updated : m)));
      } else {
        const created = await createMember(family.id, editingMember);
        setMembers((prev) => [...prev, created]);
      }
      setEditingMember(null);
      setEditingMemberId(null);
    } finally {
      setMemberSaving(false);
    }
  };

  const handleDeleteMember = async (id: number) => {
    if (!family) return;
    await deleteMember(family.id, id);
    setMembers((prev) => prev.filter((m) => m.id !== id));
  };

  const toggleMemberAllergy = (a: string) => {
    if (!editingMember) return;
    setEditingMember({
      ...editingMember,
      allergies: editingMember.allergies.includes(a)
        ? editingMember.allergies.filter((x) => x !== a)
        : [...editingMember.allergies, a],
    });
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Family Profile</h2>

      {/* Family Name */}
      <div>
        <label className="block text-sm font-medium mb-1">Family Name</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full max-w-md border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
          placeholder="The Smiths"
        />
      </div>

      {/* Allergies */}
      <div>
        <label className="block text-sm font-medium mb-2">Allergies</label>
        <div className="flex flex-wrap gap-2">
          {ALLERGY_OPTIONS.map((a) => (
            <button
              key={a}
              onClick={() => toggleAllergy(a)}
              className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                form.allergies.includes(a)
                  ? "bg-red-100 border-red-400 text-red-700"
                  : "bg-white border-gray-300 text-gray-600 hover:bg-gray-100"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* Vegetarian Ratio */}
      <div>
        <label className="block text-sm font-medium mb-1">
          Vegetarian Ratio: {form.vegetarian_ratio}%
        </label>
        <input
          type="range"
          min={0}
          max={100}
          step={10}
          value={form.vegetarian_ratio}
          onChange={(e) => setForm({ ...form, vegetarian_ratio: Number(e.target.value) })}
          className="w-full max-w-md accent-orange-500"
        />
        <div className="flex justify-between text-xs text-gray-400 max-w-md">
          <span>All Meat</span>
          <span>All Vegetarian</span>
        </div>
      </div>

      {/* Dietary Toggles */}
      <div>
        <label className="block text-sm font-medium mb-2">Dietary Preferences</label>
        <div className="flex flex-wrap gap-4">
          {([
            ["gluten_free", "Gluten-Free"],
            ["dairy_free", "Dairy-Free"],
            ["nut_free", "Nut-Free"],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                className="accent-orange-500"
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {/* Cook Time */}
      <div className="grid grid-cols-2 gap-4 max-w-md">
        <div>
          <label className="block text-sm font-medium mb-1">
            Max Cook Time (Weekday)
          </label>
          <select
            value={form.max_cook_minutes_weekday}
            onChange={(e) => setForm({ ...form, max_cook_minutes_weekday: Number(e.target.value) })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          >
            {[15, 20, 25, 30, 45, 60, 90].map((m) => (
              <option key={m} value={m}>{m} min</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Max Cook Time (Weekend)
          </label>
          <select
            value={form.max_cook_minutes_weekend}
            onChange={(e) => setForm({ ...form, max_cook_minutes_weekend: Number(e.target.value) })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          >
            {[30, 45, 60, 90, 120, 180].map((m) => (
              <option key={m} value={m}>{m} min</option>
            ))}
          </select>
        </div>
      </div>

      {/* Leftovers */}
      <div>
        <label className="block text-sm font-medium mb-1">
          Leftovers Nights Per Week: {form.leftovers_nights_per_week}
        </label>
        <input
          type="range"
          min={0}
          max={4}
          value={form.leftovers_nights_per_week}
          onChange={(e) => setForm({ ...form, leftovers_nights_per_week: Number(e.target.value) })}
          className="w-full max-w-md accent-orange-500"
        />
        <div className="flex justify-between text-xs text-gray-400 max-w-md">
          <span>0</span>
          <span>4</span>
        </div>
      </div>

      {/* Picky Kid Mode */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={form.picky_kid_mode}
            onChange={(e) => setForm({ ...form, picky_kid_mode: e.target.checked })}
            className="accent-orange-500"
          />
          Picky Kid Mode
          <span className="text-gray-400 font-normal">(biases toward mild, familiar recipes)</span>
        </label>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !form.name.trim()}
          className="bg-orange-500 text-white px-6 py-2 rounded-lg font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving..." : family ? "Update Profile" : "Create Profile"}
        </button>
        {saved && (
          <span className="text-orange-500 text-sm font-medium">Saved!</span>
        )}
        {family && (
          <button
            onClick={() => navigate("/plan")}
            className="text-orange-500 text-sm font-medium hover:underline"
          >
            Go to Plan &rarr;
          </button>
        )}
      </div>

      {/* ── Family Members Section ── */}
      {family && (
        <div className="border-t border-gray-200 pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold">Family Members</h3>
            <button
              onClick={startAddMember}
              className="bg-orange-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors"
            >
              Add Member
            </button>
          </div>

          {members.length === 0 && !editingMember && (
            <p className="text-gray-400 text-sm">No family members yet. Add members to customize dietary preferences per person.</p>
          )}

          {/* Member list */}
          <div className="space-y-3">
            {members.map((m) => (
              <div key={m.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-gray-900">{m.name}</div>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        m.dietary_style === "vegan"
                          ? "bg-green-100 text-green-700"
                          : m.dietary_style === "vegetarian"
                            ? "bg-lime-100 text-lime-700"
                            : "bg-gray-100 text-gray-600"
                      }`}>
                        {m.dietary_style}
                      </span>
                      {m.allergies.map((a) => (
                        <span key={a} className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">{a}</span>
                      ))}
                    </div>
                    {m.dislikes.length > 0 && (
                      <div className="text-xs text-gray-500 mt-1">Dislikes: {m.dislikes.join(", ")}</div>
                    )}
                    {m.favorites.length > 0 && (
                      <div className="text-xs text-gray-500 mt-1">Favorites: {m.favorites.join(", ")}</div>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => startEditMember(m)}
                      className="text-xs px-3 py-1 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteMember(m.id)}
                      className="text-xs px-3 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Edit/Add member form */}
          {editingMember && (
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
              <h4 className="font-medium text-sm">{editingMemberId ? "Edit Member" : "Add Member"}</h4>
              <div>
                <label className="block text-xs font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={editingMember.name}
                  onChange={(e) => setEditingMember({ ...editingMember, name: e.target.value })}
                  className="w-full max-w-sm border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                  placeholder="Member name"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Dietary Style</label>
                <select
                  value={editingMember.dietary_style}
                  onChange={(e) => setEditingMember({ ...editingMember, dietary_style: e.target.value as DietaryStyle })}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                >
                  {VALID_DIETARY_STYLES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Allergies</label>
                <div className="flex flex-wrap gap-1.5">
                  {ALLERGY_OPTIONS.map((a) => (
                    <button
                      key={a}
                      onClick={() => toggleMemberAllergy(a)}
                      className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                        editingMember.allergies.includes(a)
                          ? "bg-red-100 border-red-400 text-red-700"
                          : "bg-white border-gray-300 text-gray-500 hover:bg-gray-100"
                      }`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Dislikes (comma-separated recipe names)</label>
                <input
                  type="text"
                  value={editingMember.dislikes.join(", ")}
                  onChange={(e) => setEditingMember({
                    ...editingMember,
                    dislikes: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  })}
                  className="w-full max-w-sm border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                  placeholder="Spaghetti Bolognese, Pad Thai"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Favorites (comma-separated recipe names)</label>
                <input
                  type="text"
                  value={editingMember.favorites.join(", ")}
                  onChange={(e) => setEditingMember({
                    ...editingMember,
                    favorites: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  })}
                  className="w-full max-w-sm border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                  placeholder="Chicken Tacos, Mac and Cheese"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveMember}
                  disabled={memberSaving || !editingMember.name.trim()}
                  className="bg-orange-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors"
                >
                  {memberSaving ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={cancelEditMember}
                  className="px-4 py-1.5 rounded-lg text-sm bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

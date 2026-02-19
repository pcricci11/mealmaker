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
import FamilyMemberModal from "../components/FamilyMemberModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHousehold } from "../context/HouseholdContext";
import { buildInviteMailto } from "../utils/invite";

const AVATAR_COLORS = ["#EA580C", "#2563EB", "#D946EF", "#059669", "#D97706", "#DC2626", "#7C3AED", "#0891B2"];

const SERVING_OPTIONS: { value: number; label: string; desc: string }[] = [
  { value: 0.5, label: "0.5x", desc: "Small" },
  { value: 1.0, label: "1x", desc: "Standard" },
  { value: 1.5, label: "1.5x", desc: "Hearty" },
  { value: 2.0, label: "2x", desc: "Extra Large" },
];

const DIETARY_LABELS: Record<string, string> = {
  omnivore: "Omnivore",
  vegetarian: "Vegetarian",
  vegan: "Vegan",
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function TagPill({ children, color = "#78716C", bg = "#F5F5F4" }: { children: React.ReactNode; color?: string; bg?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ background: bg, color }}
    >
      {children}
    </span>
  );
}

export default function MyFamily() {
  const { household } = useHousehold();
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

  // New visual state
  const [selectedMember, setSelectedMember] = useState<number | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteCodeCopied, setInviteCodeCopied] = useState(false);
  const [tipsEnabled, setTipsEnabled] = useState(() => {
    try { return localStorage.getItem("yes-chef-tips") !== "false"; } catch { return true; }
  });
  const [showAddChef, setShowAddChef] = useState(false);
  const [showAddWebsite, setShowAddWebsite] = useState(false);

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
    if (selectedMember === m.id) setSelectedMember(null);
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
      setShowAddChef(false);
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
      setShowAddWebsite(false);
    } finally {
      setAddingWebsite(false);
    }
  };

  const handleDeleteWebsite = async (id: number) => {
    await deleteFavoriteWebsite(id);
    setWebsites((prev) => prev.filter((w) => w.id !== id));
  };

  const copyInviteCode = async () => {
    const code = household?.invite_code;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
    } catch { /* fallback: no-op */ }
    setInviteCodeCopied(true);
    setTimeout(() => setInviteCodeCopied(false), 2000);
  };

  const toggleTips = () => {
    const next = !tipsEnabled;
    setTipsEnabled(next);
    try { localStorage.setItem("yes-chef-tips", String(next)); } catch {}
  };

  // ── Loading state ──
  if (loading) {
    return (
      <div className="min-h-screen bg-chef-cream flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-3 border-stone-200 border-t-chef-orange rounded-full animate-spin" />
        <p className="text-sm text-stone-400">Loading family...</p>
      </div>
    );
  }

  // ── Empty state (no family) ──
  if (!family) {
    return (
      <div className="min-h-screen bg-chef-cream flex flex-col items-center justify-center gap-4 px-4">
        <span className="text-5xl">{"\u{1F468}\u{200D}\u{1F373}"}</span>
        <h2 className="font-display text-2xl font-bold text-stone-800">Welcome to Yes Chef</h2>
        <p className="text-stone-500 text-center">Create a family profile to get started.</p>
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

  const inviteCode = household?.invite_code || "";
  const kitchenName = household?.name || family.name;

  return (
    <div className="min-h-screen bg-chef-cream">
      <div className="max-w-3xl mx-auto px-4 py-5 md:py-8">

        {/* Save toast */}
        {saveStatus && (
          <div className="fixed top-16 right-4 bg-chef-orange text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg z-50 animate-fade-in">
            {saveStatus}
          </div>
        )}

        {/* Title + Invite */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl font-bold text-stone-800">
              {kitchenName}
            </h1>
            <p className="text-stone-400 text-xs mt-0.5">
              {members.length} member{members.length !== 1 ? "s" : ""}
              {family.created_at && ` \u00B7 Cooking together since ${new Date(family.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`}
            </p>
          </div>
          <button
            onClick={() => setShowInvite(!showInvite)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 bg-chef-orange text-white hover:opacity-90 transition-opacity"
          >
            + Invite
          </button>
        </div>

        {/* Invite Panel */}
        {showInvite && inviteCode && (
          <div
            className="rounded-2xl p-5 mb-6 animate-slide-up-fade"
            style={{
              background: "linear-gradient(135deg, #FFF7ED, #FFFBEB)",
              border: "1px solid #FED7AA",
            }}
          >
            <h3 className="font-semibold text-sm text-stone-900 mb-1">Invite someone to your kitchen</h3>
            <p className="text-stone-500 text-xs leading-relaxed mb-3">
              Share this code with your partner, roommates, or family. Everyone in your kitchen shares the same meal plans and grocery lists.
            </p>

            {/* Invite Code */}
            <div className="flex items-center gap-2 mb-3">
              <div
                className="flex-1 rounded-xl px-4 py-3 text-center font-bold text-lg tracking-widest text-chef-orange bg-white"
                style={{ border: "2px dashed #FDBA74" }}
              >
                {inviteCode}
              </div>
              <button
                onClick={copyInviteCode}
                className="px-4 py-3 rounded-xl font-semibold text-sm text-white transition-colors"
                style={{ background: inviteCodeCopied ? "#059669" : "#EA580C" }}
              >
                {inviteCodeCopied ? "\u2713 Copied!" : "Copy"}
              </button>
            </div>

            {/* Email Invite */}
            <a
              href={buildInviteMailto(inviteCode)}
              className="w-full py-2.5 rounded-xl font-medium text-sm flex items-center justify-center gap-2 bg-white border border-stone-200 text-stone-600 hover:bg-stone-50 transition-colors"
            >
              {"\u2709\uFE0F"} Send Email Invite
            </a>
          </div>
        )}

        {/* Family Members */}
        <div className="flex flex-col gap-3 mb-6">
          {members.map((member, idx) => {
            const isExpanded = selectedMember === member.id;
            const avatarBg = AVATAR_COLORS[idx % AVATAR_COLORS.length];
            const initials = getInitials(member.name);

            return (
              <div
                key={member.id}
                className="rounded-2xl overflow-hidden transition-all"
                style={{
                  background: "white",
                  border: isExpanded ? "2px solid #EA580C" : "1px solid #F0EDE8",
                }}
              >
                {/* Member Header */}
                <button
                  onClick={() => setSelectedMember(isExpanded ? null : member.id)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                >
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: avatarBg }}
                  >
                    <span className="text-white text-xs font-bold">{initials}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm text-stone-900">{member.name}</h3>
                      {idx === 0 && (
                        <span className="rounded-full px-2 py-0.5 text-[0.6rem] font-semibold" style={{ background: "#FFF7ED", color: "#EA580C" }}>
                          Admin
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-stone-500">{DIETARY_LABELS[member.dietary_style] || member.dietary_style}</span>
                      {member.allergies && member.allergies.length > 0 && (
                        <span className="text-[0.65rem] text-red-600 font-medium">
                          {"\u26A0\uFE0F"} {member.allergies.join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className="text-stone-300 text-sm transition-transform duration-200"
                    style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0)" }}
                  >
                    {"\u25BE"}
                  </span>
                </button>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-stone-100 animate-fade-in">

                    {/* Dietary */}
                    <div className="mb-4">
                      <h4 className="text-[0.72rem] font-semibold text-stone-400 uppercase tracking-wider mb-2">Dietary</h4>
                      <div className="flex flex-wrap gap-1.5">
                        <TagPill bg="#ECFDF5" color="#059669">{DIETARY_LABELS[member.dietary_style] || member.dietary_style}</TagPill>
                        {member.no_spicy && <TagPill bg="#FEF2F2" color="#DC2626">{"\u{1F336}"} No Spicy</TagPill>}
                        {(member.allergies || []).map((a) => (
                          <TagPill key={a} bg="#FEF2F2" color="#DC2626">{"\u26A0\uFE0F"} {a}</TagPill>
                        ))}
                      </div>
                    </div>

                    {/* Dislikes */}
                    {member.dislikes && member.dislikes.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-[0.72rem] font-semibold text-stone-400 uppercase tracking-wider mb-2">Won't Eat</h4>
                        <div className="flex flex-wrap gap-1.5">
                          {member.dislikes.map((d) => (
                            <TagPill key={d} bg="#FFF7ED" color="#EA580C">{"\u{1F44E}"} {d}</TagPill>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Favorites */}
                    {member.favorites && member.favorites.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-[0.72rem] font-semibold text-stone-400 uppercase tracking-wider mb-2">Favorites</h4>
                        <div className="flex flex-wrap gap-1.5">
                          {member.favorites.map((f) => (
                            <TagPill key={f} bg="#EFF6FF" color="#2563EB">{"\u2665"} {f}</TagPill>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Edit / Remove buttons */}
                    <div className="flex gap-2 mt-1">
                      <button
                        onClick={() => {
                          setEditingMember(member);
                          setMemberModalOpen(true);
                        }}
                        className="flex-1 py-2 rounded-xl text-sm font-medium bg-stone-100 text-stone-600 border border-stone-200 hover:bg-stone-150 transition-colors"
                      >
                        {"\u270F\uFE0F"} Edit {member.name}'s Preferences
                      </button>
                      <button
                        onClick={() => handleDeleteMember(member)}
                        className="py-2 px-3 rounded-xl text-sm font-medium bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Add a Family Member */}
        <button
          onClick={() => {
            setEditingMember(null);
            setMemberModalOpen(true);
          }}
          className="w-full py-3 rounded-2xl font-medium flex items-center justify-center gap-2 text-sm text-stone-500 hover:text-stone-700 hover:border-stone-400 transition-colors mb-8"
          style={{ border: "2px dashed #D6D3D1" }}
        >
          + Add a Family Member
        </button>

        {/* Kitchen Settings */}
        <div className="rounded-2xl overflow-hidden bg-white border border-stone-100 mb-8">
          <div className="px-4 py-3 border-b border-stone-100">
            <h2 className="font-semibold text-sm text-stone-900">Kitchen Settings</h2>
          </div>

          {/* User Tips Toggle */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-stone-50">
            <div>
              <h4 className="font-medium text-sm text-stone-900">User Tips</h4>
              <p className="text-xs text-stone-400 mt-0.5">Show helpful tooltips as you navigate the app</p>
            </div>
            <button
              onClick={toggleTips}
              className="relative w-11 h-6 rounded-full transition-all flex-shrink-0"
              style={{ background: tipsEnabled ? "#EA580C" : "#D6D3D1" }}
            >
              <div
                className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all"
                style={{ left: tipsEnabled ? "22px" : "2px" }}
              />
            </button>
          </div>

          {/* Kitchen Name */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-stone-50">
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-sm text-stone-900">Kitchen Name</h4>
              {editingName ? (
                <div className="flex items-center gap-2 mt-1.5">
                  <input
                    type="text"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveFamilyName();
                      if (e.key === "Escape") { setEditingName(false); setNameDraft(family.name); }
                    }}
                    autoFocus
                    className="text-sm font-medium text-stone-900 border-b-2 border-chef-orange outline-none bg-transparent py-0.5 w-full max-w-xs"
                  />
                  <button onClick={saveFamilyName} className="text-xs text-chef-orange font-medium">Save</button>
                  <button onClick={() => { setEditingName(false); setNameDraft(family.name); }} className="text-xs text-stone-400">Cancel</button>
                </div>
              ) : (
                <p className="text-xs text-stone-400 mt-0.5">{family.name}</p>
              )}
            </div>
            {!editingName && (
              <button onClick={() => setEditingName(true)} className="text-xs text-stone-400 hover:text-stone-600 transition-colors">
                Edit
              </button>
            )}
          </div>

          {/* Invite Code */}
          {inviteCode && (
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-stone-50">
              <div>
                <h4 className="font-medium text-sm text-stone-900">Invite Code</h4>
                <p className="text-xs font-semibold font-mono text-chef-orange mt-0.5">{inviteCode}</p>
              </div>
              <button
                onClick={copyInviteCode}
                className="text-xs font-medium transition-colors"
                style={{ color: inviteCodeCopied ? "#059669" : "#A8A29E" }}
              >
                {inviteCodeCopied ? "\u2713 Copied" : "Copy"}
              </button>
            </div>
          )}

          {/* Preferred Chefs & Sources */}
          <div className="px-4 py-3.5 border-b border-stone-50">
            <h4 className="font-medium text-sm text-stone-900 mb-1">Preferred Chefs & Sources</h4>
            <p className="text-xs text-stone-400 mb-2.5">Add favorite chefs & sites you trust — we'll prioritize them when planning your meals.</p>
            <div className="flex flex-wrap gap-1.5">
              {chefs.map((chef) => (
                <span
                  key={`chef-${chef.id}`}
                  className="rounded-full px-2.5 py-1 flex items-center gap-1 text-xs font-medium border"
                  style={{ background: "#FFF7ED", color: "#EA580C", borderColor: "#FED7AA" }}
                >
                  {"\u{1F468}\u{200D}\u{1F373}"} {chef.name}
                  {chef.cuisines && chef.cuisines.length > 0 && (
                    <span className="text-orange-400 font-normal">({chef.cuisines.map((c) => c.replace("_", " ")).join(", ")})</span>
                  )}
                  <button
                    onClick={() => handleDeleteChef(chef.id)}
                    className="text-orange-300 hover:text-orange-600 ml-0.5 transition-colors"
                  >
                    {"\u00D7"}
                  </button>
                </span>
              ))}
              {websites.map((website) => (
                <span
                  key={`web-${website.id}`}
                  className="rounded-full px-2.5 py-1 flex items-center gap-1 text-xs font-medium border"
                  style={{ background: "#EFF6FF", color: "#2563EB", borderColor: "#BFDBFE" }}
                >
                  {"\u{1F310}"} {website.name}
                  <button
                    onClick={() => handleDeleteWebsite(website.id)}
                    className="text-blue-300 hover:text-blue-600 ml-0.5 transition-colors"
                  >
                    {"\u00D7"}
                  </button>
                </span>
              ))}

              {/* Add buttons */}
              <button
                onClick={() => { setShowAddChef(!showAddChef); setShowAddWebsite(false); }}
                className="rounded-full px-2.5 py-1 text-xs text-stone-400 hover:text-stone-600 hover:border-stone-400 transition-colors"
                style={{ border: "1px dashed #D6D3D1" }}
              >
                + Chef
              </button>
              <button
                onClick={() => { setShowAddWebsite(!showAddWebsite); setShowAddChef(false); }}
                className="rounded-full px-2.5 py-1 text-xs text-stone-400 hover:text-stone-600 hover:border-stone-400 transition-colors"
                style={{ border: "1px dashed #D6D3D1" }}
              >
                + Website
              </button>
            </div>

            {/* Add Chef Form */}
            {showAddChef && (
              <div className="mt-3 space-y-2 animate-fade-in">
                <div className="flex gap-2">
                  <Input
                    value={newChefName}
                    onChange={(e) => setNewChefName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && newChefName.trim()) handleAddChef(); }}
                    placeholder="e.g., Ina Garten"
                    disabled={addingChef}
                    className="flex-1 text-sm"
                  />
                  <Button onClick={handleAddChef} disabled={addingChef || !newChefName.trim()} size="sm">
                    {addingChef ? "..." : "Add"}
                  </Button>
                </div>
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
                      className={`px-2 py-0.5 rounded-full text-[0.65rem] font-medium border transition-colors ${
                        newChefCuisines.includes(c)
                          ? "bg-orange-100 text-orange-800 border-orange-300"
                          : "bg-white text-stone-400 border-stone-200 hover:border-stone-300"
                      }`}
                    >
                      {c.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Add Website Form */}
            {showAddWebsite && (
              <div className="mt-3 flex gap-2 animate-fade-in">
                <Input
                  value={newWebsiteName}
                  onChange={(e) => setNewWebsiteName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && newWebsiteName.trim()) handleAddWebsite(); }}
                  placeholder="e.g., Serious Eats, Smitten Kitchen"
                  disabled={addingWebsite}
                  className="flex-1 text-sm"
                />
                <Button onClick={handleAddWebsite} disabled={addingWebsite || !newWebsiteName.trim()} size="sm">
                  {addingWebsite ? "..." : "Add"}
                </Button>
              </div>
            )}
          </div>

          {/* Portion Sizing */}
          <div className="px-4 py-3.5 border-b border-stone-50">
            <h4 className="font-medium text-sm text-stone-900 mb-1">Portion Sizing</h4>
            <p className="text-xs text-stone-400 mb-2.5">Per person, does your family tend to eat more or less than average?</p>
            <div className="flex gap-2">
              {SERVING_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setServingMultiplier(opt.value);
                    savePreference({ serving_multiplier: opt.value });
                  }}
                  className={`flex-1 px-3 py-2.5 rounded-xl text-center transition-colors border-2 ${
                    servingMultiplier === opt.value
                      ? "border-chef-orange bg-orange-50 text-chef-orange"
                      : "border-stone-200 text-stone-500 hover:border-stone-300"
                  }`}
                >
                  <div className="text-sm font-bold">{opt.label}</div>
                  <div className="text-[0.65rem] text-stone-400 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Meal Plan Defaults */}
          <div className="px-4 py-3.5">
            <h4 className="font-medium text-sm text-stone-900 mb-2">Meal Plan Defaults</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl p-3 bg-chef-cream">
                <span className="text-[0.68rem] text-stone-400">Weeknight max</span>
                <p className="font-semibold text-sm text-stone-900 mt-0.5">{family.max_cook_minutes_weekday} min</p>
              </div>
              <div className="rounded-xl p-3 bg-chef-cream">
                <span className="text-[0.68rem] text-stone-400">Weekend max</span>
                <p className="font-semibold text-sm text-stone-900 mt-0.5">{family.max_cook_minutes_weekend} min</p>
              </div>
              <div className="rounded-xl p-3 bg-chef-cream">
                <span className="text-[0.68rem] text-stone-400">Vegetarian meals</span>
                <p className="font-semibold text-sm text-stone-900 mt-0.5">{family.vegetarian_ratio}%</p>
              </div>
              <div className="rounded-xl p-3 bg-chef-cream">
                <span className="text-[0.68rem] text-stone-400">Servings</span>
                <p className="font-semibold text-sm text-stone-900 mt-0.5">{members.length} people</p>
              </div>
            </div>
          </div>
        </div>

        <div className="h-8" />
      </div>

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

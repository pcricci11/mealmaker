// pages/MyFamily.tsx
// New family profile page with members and favorites

import { useState, useEffect } from "react";
import { 
  getFamilies, 
  getFamilyMembers, 
  createFamilyMember, 
  updateFamilyMember, 
  deleteFamilyMember,
  getFavoriteChefs,
  getFavoriteMeals,
  getFavoriteSides,
  updateFamily,
} from "../api";
import type { 
  Family, 
  FamilyMemberV3, 
  FamilyFavoriteChef,
  FamilyFavoriteMeal,
  FamilyFavoriteSide,
  ServingMultiplier,
} from "@shared/types";
import FamilyMemberCard from "../components/FamilyMemberCard";
import FamilyMemberModal from "../components/FamilyMemberModal";
import FavoritesList from "../components/FavoritesList";

export default function MyFamily() {
  const [family, setFamily] = useState<Family | null>(null);
  const [members, setMembers] = useState<FamilyMemberV3[]>([]);
  const [chefs, setChefs] = useState<FamilyFavoriteChef[]>([]);
  const [meals, setMeals] = useState<FamilyFavoriteMeal[]>([]);
  const [sides, setSides] = useState<FamilyFavoriteSide[]>([]);
  const [servingMultiplier, setServingMultiplier] = useState<ServingMultiplier>("normal");
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [editingMember, setEditingMember] = useState<FamilyMemberV3 | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const families = await getFamilies();
      if (families.length > 0) {
        const fam = families[0];
        setFamily(fam);
        setServingMultiplier(fam.serving_multiplier || "normal");

        // Load all family data
        const [membersData, chefsData, mealsData, sidesData] = await Promise.all([
          getFamilyMembers(fam.id),
          getFavoriteChefs(fam.id),
          getFavoriteMeals(fam.id),
          getFavoriteSides(fam.id),
        ]);

        setMembers(membersData);
        setChefs(chefsData);
        setMeals(mealsData);
        setSides(sidesData);
      }
    } catch (error) {
      console.error("Error loading family data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMember = async (memberData: Partial<FamilyMemberV3>) => {
    if (!family) return;

    try {
      if (editingMember) {
        // Update existing
        await updateFamilyMember(editingMember.id, memberData);
      } else {
        // Create new
        await createFamilyMember({
          ...memberData,
          family_id: family.id,
        } as any);
      }

      await loadData();
      setShowMemberModal(false);
      setEditingMember(null);
    } catch (error) {
      console.error("Error saving member:", error);
    }
  };

  const handleDeleteMember = async (memberId: number) => {
    if (!confirm("Are you sure you want to remove this family member?")) return;

    try {
      await deleteFamilyMember(memberId);
      await loadData();
    } catch (error) {
      console.error("Error deleting member:", error);
    }
  };

  const handleServingMultiplierChange = async (multiplier: ServingMultiplier) => {
    if (!family) return;

    try {
      await updateFamily(family.id, { serving_multiplier: multiplier });
      setServingMultiplier(multiplier);
    } catch (error) {
      console.error("Error updating serving multiplier:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!family) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">No family profile found.</p>
        <p className="text-sm text-gray-400">Create a family to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">{family.name}</h2>
        <p className="text-sm text-gray-500 mt-1">
          Manage your family members and food preferences
        </p>
      </div>

      {/* Family Members */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Family Members</h3>
          <button
            onClick={() => {
              setEditingMember(null);
              setShowMemberModal(true);
            }}
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
          >
            + Add Member
          </button>
        </div>

        {members.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            No family members yet. Add someone to get started!
          </div>
        ) : (
          <div className="space-y-3">
            {members.map((member) => (
              <FamilyMemberCard
                key={member.id}
                member={member}
                onEdit={() => {
                  setEditingMember(member);
                  setShowMemberModal(true);
                }}
                onDelete={() => handleDeleteMember(member.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Family Favorites */}
      <FavoritesList
        familyId={family.id}
        chefs={chefs}
        meals={meals}
        sides={sides}
        onUpdate={loadData}
      />

      {/* Serving Multiplier */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold mb-3">Portion Size</h3>
        <p className="text-sm text-gray-600 mb-4">
          How much does your family typically eat compared to recipe serving sizes?
        </p>
        <div className="flex gap-3">
          {(["normal", "hearty", "extra_large"] as ServingMultiplier[]).map((size) => (
            <button
              key={size}
              onClick={() => handleServingMultiplierChange(size)}
              className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                servingMultiplier === size
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
              }`}
            >
              <div className="font-medium">
                {size === "normal" && "Normal (1×)"}
                {size === "hearty" && "Hearty (1.5×)"}
                {size === "extra_large" && "Extra Large (2×)"}
              </div>
              <div className="text-xs mt-1 opacity-75">
                {size === "normal" && "Standard portions"}
                {size === "hearty" && "Bigger appetites"}
                {size === "extra_large" && "Very hungry family"}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Member Modal */}
      {showMemberModal && (
        <FamilyMemberModal
          member={editingMember}
          onSave={handleSaveMember}
          onClose={() => {
            setShowMemberModal(false);
            setEditingMember(null);
          }}
        />
      )}
    </div>
  );
}

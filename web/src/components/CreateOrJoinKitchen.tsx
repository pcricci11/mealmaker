import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createHousehold, joinHousehold, getMyHousehold } from "../api";
import { useHousehold } from "../context/HouseholdContext";
import WelcomeScreen from "./WelcomeScreen";

export default function CreateOrJoinKitchen() {
  const { refresh } = useHousehold();

  const [kitchenName, setKitchenName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [welcomeData, setWelcomeData] = useState<{
    variant: "created" | "joined";
    kitchenName: string;
    inviteCode?: string;
    creatorName?: string;
  } | null>(null);

  async function handleCreate() {
    if (!kitchenName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const result = await createHousehold(kitchenName.trim());
      // Store the auto-created family ID
      if (result.family?.id) {
        localStorage.setItem("familyId", String(result.family.id));
      }
      setWelcomeData({
        variant: "created",
        kitchenName: result.household.name,
        inviteCode: result.household.invite_code,
      });
    } catch (err: any) {
      setError(err.message || "Failed to create kitchen");
    } finally {
      setCreating(false);
    }
  }

  async function handleJoin() {
    if (!inviteCode.trim()) return;
    setJoining(true);
    setError(null);
    try {
      await joinHousehold(inviteCode.trim());
      const data = await getMyHousehold();
      const owner = data.members.find((m) => m.role === "owner");
      setWelcomeData({
        variant: "joined",
        kitchenName: data.household?.name ?? "your kitchen",
        creatorName: owner?.display_name ?? undefined,
      });
    } catch (err: any) {
      setError(err.message || "Failed to join kitchen");
    } finally {
      setJoining(false);
    }
  }

  async function handleWelcomeContinue() {
    await refresh();
  }

  if (welcomeData) {
    return (
      <WelcomeScreen
        {...welcomeData}
        onContinue={handleWelcomeContinue}
      />
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <h1 className="text-2xl font-bold text-orange-600 mb-2">
        Welcome to Yes Chef!
      </h1>
      <p className="text-gray-600 mb-8 text-center max-w-md">
        Create a new kitchen for your household, or join an existing one with an invite code.
      </p>

      {error && (
        <div className="mb-6 w-full max-w-sm rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="w-full max-w-sm space-y-8">
        {/* Create a Kitchen */}
        <div className="rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-1">Create a Kitchen</h2>
          <p className="text-sm text-gray-500 mb-4">
            Start a new household and invite others to join.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="Kitchen name"
              value={kitchenName}
              onChange={(e) => setKitchenName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              disabled={creating}
            />
            <Button
              onClick={handleCreate}
              disabled={creating || !kitchenName.trim()}
              className="bg-orange-600 hover:bg-orange-700 shrink-0"
            >
              {creating ? "Creating..." : "Create"}
            </Button>
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-sm text-gray-400 font-medium">OR</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Join a Kitchen */}
        <div className="rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-1">Join a Kitchen</h2>
          <p className="text-sm text-gray-500 mb-4">
            Enter the invite code shared by your household.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="CHEF-XXXXXX"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              disabled={joining}
            />
            <Button
              onClick={handleJoin}
              disabled={joining || !inviteCode.trim()}
              variant="outline"
              className="shrink-0"
            >
              {joining ? "Joining..." : "Join"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

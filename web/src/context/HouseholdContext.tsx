import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useUser, useAuth } from "@clerk/clerk-react";
import { setTokenGetter, syncUser, getMyHousehold, markWelcomeSeen as apiMarkWelcomeSeen } from "../api";

interface Household {
  id: number;
  name: string;
  invite_code: string;
  created_by?: number;
}

interface HouseholdContextValue {
  household: Household | null;
  familyId: number | null;
  isLoading: boolean;
  hasSeenWelcome: boolean;
  markWelcomeSeen: () => Promise<void>;
  refresh: () => Promise<void>;
}

const HouseholdContext = createContext<HouseholdContextValue>({
  household: null,
  familyId: null,
  isLoading: false,
  hasSeenWelcome: true,
  markWelcomeSeen: async () => {},
  refresh: async () => {},
});

export function useHousehold() {
  return useContext(HouseholdContext);
}

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, user } = useUser();
  const { getToken } = useAuth();
  const [household, setHousehold] = useState<Household | null>(null);
  const [familyId, setFamilyId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSeenWelcome, setHasSeenWelcome] = useState(true);

  // Wire up the token getter so all api.ts calls include the Bearer token
  useEffect(() => {
    if (isSignedIn) {
      setTokenGetter(() => getToken());
    }
  }, [isSignedIn, getToken]);

  const markWelcomeSeen = useCallback(async () => {
    try {
      await apiMarkWelcomeSeen();
      setHasSeenWelcome(true);
    } catch (err) {
      console.error("Failed to mark welcome as seen:", err);
      // Still dismiss locally so user isn't stuck
      setHasSeenWelcome(true);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!isSignedIn || !user) return;
    setIsLoading(true);
    try {
      // Sync user with backend
      const syncResult = await syncUser(
        user.primaryEmailAddress?.emailAddress,
        user.fullName ?? undefined,
      );

      // Track welcome carousel status
      setHasSeenWelcome(syncResult.user.has_seen_welcome ?? true);

      // Fetch household info
      const data = await getMyHousehold();
      setHousehold(data.household);

      // familyId: stored in localStorage after household creation, or fetch from families
      const storedFamilyId = localStorage.getItem("familyId");
      if (storedFamilyId) {
        setFamilyId(Number(storedFamilyId));
      } else if (data.household) {
        // The family is auto-created with the household; fetch it
        const { getFamilies } = await import("../api");
        const families = await getFamilies();
        const houseFamily = families.find(
          (f: any) => f.household_id === data.household!.id,
        );
        if (houseFamily) {
          setFamilyId(houseFamily.id);
          localStorage.setItem("familyId", String(houseFamily.id));
        }
      }
    } catch (err) {
      console.error("Household sync failed:", err);
    } finally {
      setIsLoading(false);
    }
  }, [isSignedIn, user]);

  // Auto-sync on sign in
  useEffect(() => {
    if (isSignedIn && user) {
      refresh();
    } else {
      setHousehold(null);
      setFamilyId(null);
      setHasSeenWelcome(true);
    }
  }, [isSignedIn, user, refresh]);

  return (
    <HouseholdContext.Provider value={{ household, familyId, isLoading, hasSeenWelcome, markWelcomeSeen, refresh }}>
      {children}
    </HouseholdContext.Provider>
  );
}

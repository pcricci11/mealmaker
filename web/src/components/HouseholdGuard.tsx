import { Outlet } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import { useHousehold } from "../context/HouseholdContext";
import CreateOrJoinKitchen from "./CreateOrJoinKitchen";

export default function HouseholdGuard() {
  const { isSignedIn } = useUser();
  const { household, isLoading } = useHousehold();

  // Signed-out users can browse freely
  if (!isSignedIn) {
    return <Outlet />;
  }

  // Signed-in but still loading household data
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600" />
      </div>
    );
  }

  // Signed-in but no household yet
  if (!household) {
    return <CreateOrJoinKitchen />;
  }

  // Signed-in with household — proceed to app
  return <Outlet />;
}

import { Outlet, NavLink, Link } from "react-router-dom";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
} from "@clerk/clerk-react";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-2 md:py-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-6">
          <Link to="/" className="leading-none hover:opacity-80 transition-opacity">
            <span className="block text-xl md:text-2xl font-extrabold text-orange-600">Yes Chef</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-500">Meal Planner</span>
          </Link>
          <nav className="flex gap-1.5 md:gap-2 overflow-x-auto md:overflow-x-visible -mx-4 px-4 md:mx-0 md:px-0 hide-scrollbar flex-1">
            <NavLink
              to="/my-plan"
              className={({ isActive }) =>
                cn(
                  buttonVariants({ variant: isActive ? "default" : "ghost", size: "sm" }),
                  !isActive && "text-muted-foreground",
                  "whitespace-nowrap"
                )
              }
            >
              My Plan
            </NavLink>
            <NavLink
              to="/grocery"
              className={({ isActive }) =>
                cn(
                  buttonVariants({ variant: isActive ? "default" : "ghost", size: "sm" }),
                  !isActive && "text-muted-foreground",
                  "whitespace-nowrap"
                )
              }
            >
              Grocery List
            </NavLink>
            <NavLink
              to="/recipes"
              className={({ isActive }) =>
                cn(
                  buttonVariants({ variant: isActive ? "default" : "ghost", size: "sm" }),
                  !isActive && "text-muted-foreground",
                  "whitespace-nowrap"
                )
              }
            >
              My Recipes
            </NavLink>
            <NavLink
              to="/family"
              className={({ isActive }) =>
                cn(
                  buttonVariants({ variant: isActive ? "default" : "ghost", size: "sm" }),
                  !isActive && "text-muted-foreground",
                  "whitespace-nowrap"
                )
              }
            >
              My Family
            </NavLink>
          </nav>
          <div className="flex items-center">
            <SignedOut>
              <SignInButton mode="modal">
                <button
                  className={cn(
                    buttonVariants({ variant: "default", size: "sm" }),
                    "bg-orange-600 hover:bg-orange-700 whitespace-nowrap"
                  )}
                >
                  Sign in
                </button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: "h-8 w-8",
                  },
                }}
              />
            </SignedIn>
          </div>
        </div>
        <Separator />
      </header>
      <main className="max-w-4xl mx-auto px-3 md:px-4 py-4 md:py-6 flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-gray-200 py-4 text-center text-xs text-gray-400">
        &copy; 2026 Yes Chef Meal Planner
      </footer>
    </div>
  );
}

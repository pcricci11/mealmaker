import { NavLink, Link } from "react-router-dom";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
} from "@clerk/clerk-react";
import { cn } from "@/lib/utils";
import HouseholdGuard from "./components/HouseholdGuard";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col font-body">
      <header className="bg-white sticky top-0 z-30 border-b border-stone-200">
        <div className="max-w-4xl mx-auto px-4 py-2 md:py-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-6">
          {/* Logo + auth row: side-by-side on mobile */}
          <div className="flex items-center justify-between md:contents">
            <Link to="/" className="leading-none hover:opacity-80 transition-opacity">
              <span className="block text-xl md:text-2xl font-display font-bold text-[#EA580C]">Yes Chef</span>
              <span className="block text-[10px] font-body font-medium uppercase tracking-widest text-[#B8AFA6]">Meal Planner</span>
            </Link>
            <div className="flex items-center md:order-last relative z-40">
              <SignedOut>
                <SignInButton mode="modal">
                  <button
                    className="px-3 py-1.5 text-sm font-medium rounded-md bg-chef-orange text-white hover:bg-orange-700 transition-colors whitespace-nowrap"
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
          <nav className="flex gap-4 md:gap-5 overflow-x-auto md:overflow-x-visible -mx-4 px-4 md:mx-0 md:px-0 hide-scrollbar flex-1">
            <NavLink
              to="/my-plan"
              className={({ isActive }) =>
                cn(
                  "pb-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  isActive
                    ? "border-chef-orange text-chef-orange"
                    : "border-transparent text-stone-400 hover:text-stone-600"
                )
              }
            >
              My Plan
            </NavLink>
            <NavLink
              to="/grocery"
              className={({ isActive }) =>
                cn(
                  "pb-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  isActive
                    ? "border-chef-orange text-chef-orange"
                    : "border-transparent text-stone-400 hover:text-stone-600"
                )
              }
            >
              Grocery List
            </NavLink>
            <NavLink
              to="/recipes"
              className={({ isActive }) =>
                cn(
                  "pb-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  isActive
                    ? "border-chef-orange text-chef-orange"
                    : "border-transparent text-stone-400 hover:text-stone-600"
                )
              }
            >
              My Recipes
            </NavLink>
            <NavLink
              to="/family"
              className={({ isActive }) =>
                cn(
                  "pb-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  isActive
                    ? "border-chef-orange text-chef-orange"
                    : "border-transparent text-stone-400 hover:text-stone-600"
                )
              }
            >
              My Family
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 md:px-6 py-4 md:py-6 flex-1 font-body overflow-hidden">
        <HouseholdGuard />
      </main>
      <footer className="border-t border-stone-200 py-4 text-center text-xs text-stone-400">
        &copy; 2026 Yes Chef Meal Planner
      </footer>
    </div>
  );
}

import { Outlet, NavLink, Link } from "react-router-dom";

function navCls({ isActive }: { isActive: boolean }) {
  return `px-3 py-2.5 md:px-4 md:py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
    isActive
      ? "bg-emerald-600 text-white"
      : "text-gray-600 hover:bg-gray-200"
  }`;
}

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-2 md:py-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-6">
          <Link to="/plan" className="leading-none hover:opacity-80 transition-opacity">
            <span className="block text-xl md:text-2xl font-extrabold text-emerald-700">Yes Chef</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-500">Meal Planner</span>
          </Link>
          <nav className="flex gap-1.5 md:gap-2 overflow-x-auto md:overflow-x-visible -mx-4 px-4 md:mx-0 md:px-0 hide-scrollbar">
            <NavLink to="/my-plan" className={navCls}>My Plan</NavLink>
            <NavLink to="/grocery" className={navCls}>Grocery List</NavLink>
            <NavLink to="/recipes" className={navCls}>My Recipes</NavLink>
            <NavLink to="/family" className={navCls}>My Family</NavLink>
          </nav>
        </div>
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

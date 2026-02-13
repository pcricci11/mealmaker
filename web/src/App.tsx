import { Outlet, NavLink } from "react-router-dom";

function navCls({ isActive }: { isActive: boolean }) {
  return `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive
      ? "bg-emerald-600 text-white"
      : "text-gray-600 hover:bg-gray-200"
  }`;
}

export default function App() {
  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-6">
          <h1 className="text-xl font-bold text-emerald-700">MealMaker</h1>
          <nav className="flex gap-2">
            <NavLink to="/profile" className={navCls}>Profile</NavLink>
            <NavLink to="/plan" className={navCls}>Meal Plan</NavLink>
            <NavLink to="/recipes" className={navCls}>Recipes</NavLink>
            <NavLink to="/grocery" className={navCls}>Grocery List</NavLink>
          </nav>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App";
import Plan from "./pages/Plan";
import GroceryList from "./pages/GroceryList";
import MyRecipes from "./pages/MyRecipes";
import MyFamily from "./pages/MyFamily";
import "./index.css";

function HomeRedirect() {
  const hasPlan = !!localStorage.getItem("currentPlanId");
  return <Navigate to={hasPlan ? "/my-plan" : "/plan"} replace />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<HomeRedirect />} />
          <Route path="plan" element={<Plan />} />
          <Route path="my-plan" element={<Plan />} />
          <Route path="meal-plan" element={<Navigate to="/plan" replace />} />
          <Route path="grocery" element={<GroceryList />} />
          <Route path="recipes" element={<MyRecipes />} />
          <Route path="family" element={<MyFamily />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);

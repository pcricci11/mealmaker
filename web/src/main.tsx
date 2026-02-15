import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App";
import MealPlan from "./pages/MealPlan";
import GroceryList from "./pages/GroceryList";
import MyRecipes from "./pages/MyRecipes";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<Navigate to="/meal-plan" replace />} />
          <Route path="meal-plan" element={<MealPlan />} />
          <Route path="plan" element={<Navigate to="/meal-plan" replace />} />
          <Route path="grocery" element={<GroceryList />} />
          <Route path="recipes" element={<MyRecipes />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);

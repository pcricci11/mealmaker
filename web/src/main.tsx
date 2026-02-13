import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App";
import FamilyProfile from "./pages/FamilyProfile";
import MealPlan from "./pages/MealPlan";
import Recipes from "./pages/Recipes";
import GroceryList from "./pages/GroceryList";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<Navigate to="/profile" replace />} />
          <Route path="profile" element={<FamilyProfile />} />
          <Route path="plan" element={<MealPlan />} />
          <Route path="recipes" element={<Recipes />} />
          <Route path="grocery" element={<GroceryList />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);

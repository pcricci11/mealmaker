import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App";
import MyFamily from "./pages/MyFamily";
import ThisWeek from "./pages/ThisWeek";
import FamilyProfile from "./pages/FamilyProfile";
import MealPlan from "./pages/MealPlan";
import History from "./pages/History";
import GroceryList from "./pages/GroceryList";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<Navigate to="/family" replace />} />
          <Route path="family" element={<MyFamily />} />
          <Route path="this-week" element={<ThisWeek />} />
          <Route path="profile" element={<FamilyProfile />} />
          <Route path="plan" element={<MealPlan />} />
          <Route path="history" element={<History />} />
          <Route path="grocery" element={<GroceryList />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);

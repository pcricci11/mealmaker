import dotenv from 'dotenv';
dotenv.config();

import express from "express";
import cors from "cors";
import { initDb } from "./migrate";
import familiesRouter from "./routes/families";
import membersRouter from "./routes/members";
import recipesRouter from "./routes/recipes";
import mealPlansRouter from "./routes/meal-plans";
import mealPlansV3Router from "./routes/meal-plans-v3";
import favoritesRouter from "./routes/favorites";
import cookingScheduleRouter from "./routes/cooking-schedule";
import sidesRouter from "./routes/sides";
import smartSetupRouter from "./routes/smart-setup";
import conversationalPlannerRouter from "./routes/conversational-planner";

async function start() {
  await initDb();

  const app = express();
  const PORT = process.env.PORT || 3001;

  app.use(cors());
  app.use(express.json());

  // Routes
  app.use("/api/families", familiesRouter);
  app.use("/api/members", membersRouter);
  app.use("/api/recipes", recipesRouter);
  app.use("/api/meal-plans", mealPlansV3Router);
  app.use("/api/meal-plans", mealPlansRouter);
  app.use("/api/favorites", favoritesRouter);
  app.use("/api/cooking-schedule", cookingScheduleRouter);
  app.use("/api/sides", sidesRouter);
  app.use("/api/smart-setup", smartSetupRouter);
  app.use("/api/plan", conversationalPlannerRouter);

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.listen(PORT, () => {
    console.log(`MealMaker backend running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

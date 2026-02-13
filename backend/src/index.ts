import express from "express";
import cors from "cors";
import { initDb } from "./db";
import familiesRouter from "./routes/families";
import membersRouter from "./routes/members";
import recipesRouter from "./routes/recipes";
import mealPlansRouter from "./routes/meal-plans";
import favoritesRouter from "./routes/favorites";
import cookingScheduleRouter from "./routes/cooking-schedule";
import sidesRouter from "./routes/sides";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Initialize database tables
initDb();

// Routes
app.use("/api/families", familiesRouter);
app.use("/api/members", membersRouter);
app.use("/api/recipes", recipesRouter);
app.use("/api/meal-plans", mealPlansRouter);
app.use("/api/favorites", favoritesRouter);
app.use("/api/cooking-schedule", cookingScheduleRouter);
app.use("/api/sides", sidesRouter);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`MealMaker backend running on http://localhost:${PORT}`);
});

import express from "express";
import cors from "cors";
import { initDb } from "./db";
import familiesRouter from "./routes/families";
import membersRouter from "./routes/members";
import recipesRouter from "./routes/recipes";
import mealPlansRouter from "./routes/meal-plans";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Initialize database tables
initDb();

// Routes
app.use("/api/families", familiesRouter);
app.use("/api/families/:familyId/members", membersRouter);
app.use("/api/recipes", recipesRouter);
app.use("/api/meal-plans", mealPlansRouter);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`MealMaker backend running on http://localhost:${PORT}`);
});

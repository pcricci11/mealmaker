import { Router, Request, Response } from "express";
import db from "../db";
import { rowToRecipe } from "../helpers";

const router = Router();

// GET /api/recipes
router.get("/", (_req: Request, res: Response) => {
  const rows = db.prepare("SELECT * FROM recipes ORDER BY name").all();
  res.json(rows.map(rowToRecipe));
});

// GET /api/recipes/:id
router.get("/:id", (req: Request, res: Response) => {
  const row = db.prepare("SELECT * FROM recipes WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Recipe not found" });
  res.json(rowToRecipe(row));
});

export default router;

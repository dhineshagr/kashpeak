import express from "express";
import { authenticateToken } from "./auth.js";
import db from "../db/index.js";

const router = express.Router();

router.get("/", authenticateToken, async (req, res) => {
  try {
    const result = await db.query("SELECT role_id, role_name FROM kash_operations_roles_table ORDER BY role_name");
    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Error fetching roles:", err);
    res.status(500).json({ error: "Failed to fetch roles" });
  }
});

export default router;
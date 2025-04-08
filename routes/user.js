// routes/user.js
import express from "express";
import db from "../db/index.js";
import { authenticateToken } from "./auth.js";

const router = express.Router();

router.get("/me", authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT first_name, last_name, admin_level
       FROM kash_operations_user_table
       WHERE emp_id = $1`,
      [req.user.emp_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const { first_name, last_name, admin_level } = result.rows[0];

    res.json({
      name: `${first_name} ${last_name}`,
      adminLevel: admin_level || "Basic", // Fallback for safety
    });
  } catch (err) {
    console.error("Error fetching user profile:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;

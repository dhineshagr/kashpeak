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

router.post("/reset-password", authenticateToken, async (req, res) => {

  const empId = req.user.emp_id;
  const { newPassword } = req.body;

  if (!newPassword || typeof newPassword !== "string") {
    return res.status(400).json({ success: false, error: "New password is required." });
  }

  // Ensure user exists (defensive)
  const user = await db.query(
    `SELECT emp_id FROM kash_operations_user_table WHERE emp_id = $1`,
    [empId]
  );
  if (user.rowCount === 0) {
    return res.status(404).json({ success: false, error: "User not found." });
  }

  const update = await db.query(
    `UPDATE kash_operations_user_table
         SET user_password = $1
       WHERE emp_id = $2`,
    [newPassword, empId]
  );

  if (update.rowCount === 0) {
    return res.status(500).json({ error: "Failed to update password." });
  }

  console.log(`✅ Password reset for emp_id: ${empId}`);
  return res.status(200).json({ success: true, message: "Password updated." });

});


export default router;

// routes/auth.js
import express from "express";
import jwt from "jsonwebtoken";
import db from "../db/index.js";
import dotenv from "dotenv";

dotenv.config();
const router = express.Router();

// 🔐 LOGIN ROUTE
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await db.query(
      `SELECT emp_id, kash_operations_usn, admin_level, user_password, 
              first_name, last_name
       FROM kash_operations_user_table 
       WHERE kash_operations_usn = $1`,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = result.rows[0];

    // ⚠️ Replace this with bcrypt check in production
    if (user.user_password !== password) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const fullName = `${user.first_name} ${user.last_name}`.trim();

    // 🧾 Generate JWT with fullName
    const token = jwt.sign(
      {
        emp_id: user.emp_id,
        username: user.kash_operations_usn,
        role: user.admin_level,
        fullName: fullName
      },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    // ✅ Send token + fullName separately too (for localStorage)
    res.json({ token, fullName });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;

// ✅ AUTH MIDDLEWARE as named export
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.split(" ")[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

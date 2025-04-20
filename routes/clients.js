import express from "express";
import db from "../db/index.js";
import { authenticateToken } from "./auth.js";

const router = express.Router();

// GET all clients
router.get("/", async (req, res) => {
    try {
      const result = await db.query("SELECT * FROM clients");
      res.json(result.rows);
    } catch (err) {
      console.error("❌ Failed to fetch clients:", err.message);
      res.status(500).json({ error: "Server error" });
    }
  });

// GET single client by ID
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query("SELECT * FROM clients WHERE id = $1", [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Client not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// POST create a new client
router.post("/", async (req, res) => {
  const { name } = req.body;
  try {
    const result = await db.query(
      "INSERT INTO clients (name) VALUES ($1) RETURNING *",
      [name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// PUT update a client
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  try {
    const result = await db.query(
      "UPDATE clients SET name = $1 WHERE id = $2 RETURNING *",
      [name, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Client not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE a client
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query("DELETE FROM clients WHERE id = $1 RETURNING *", [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Client not found" });
    }
    res.json({ message: "Client deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

//Company Dropdown Based on Billable/Non-Billable for Timesheet page
router.get("/by-billable/:type", authenticateToken, async (req, res) => {
  const { type } = req.params;
  const isBillable = type.toLowerCase() === "billable";

  try {
    const result = await db.query(
      `SELECT company_id, company_name 
       FROM kash_operations_company_table 
       WHERE is_billable = $1`,  // ✅ updated column
      [isBillable]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching companies by billable status:", error);
    res.status(500).json({ error: "Failed to fetch companies" });
  }
});


export default router;

import express from "express";
import db from "../db/index.js";
import { authenticateToken } from "./auth.js";

const router = express.Router();


router.get("/", authenticateToken, async (req, res) => {
  try {
    // 1. Fetch all client companies with project stats
    const clientsRes = await db.query(`
      SELECT 
        c.company_id,
        c.company_name,
        c.industry,
        c.company_address AS address_line1,
        c.address_line2,
        c.company_location_city AS city,
        c.company_location_state AS state,
        c.company_location_country AS country,
        c.company_zip_code AS zipcode,
        COUNT(DISTINCT p.project_category) AS total_projects,
        COUNT(*) FILTER (WHERE LOWER(p.current_status) = 'active') AS active_projects
      FROM kash_operations_company_table c
      LEFT JOIN kash_operations_created_projects_table p ON c.company_id = p.company_id
      GROUP BY c.company_id
      ORDER BY c.company_name
    `);

    // 2. JOIN user table to get full name and admin_level
    const adminRes = await db.query(`
      SELECT 
        a.company_id, 
        a.kash_operations_usn, 
        u.first_name,
        u.last_name,
        u.admin_level AS role
      FROM kash_operations_company_admin_role_table a
      LEFT JOIN kash_operations_user_table u
        ON a.kash_operations_usn = u.kash_operations_usn
      WHERE u.admin_level IS NOT NULL AND u.admin_level IN ('Admin', 'Super Admin')
    `);
    console.log("✅ Filtered Admins Returned:", adminRes.rows); // ✅ Now safe

    // 3. Build a map of admins per company
    const adminMap = {};
    for (const row of adminRes.rows) {
      if (!adminMap[row.company_id]) adminMap[row.company_id] = [];

      const full_name = `${row.first_name || ""} ${row.last_name || ""}`.trim();

      adminMap[row.company_id].push({
        usn: row.kash_operations_usn,
        role: row.role || "Admin",
        full_name: full_name || row.kash_operations_usn,
      });
    }

    // 4. Attach admins to each client row
    const enriched = clientsRes.rows.map((client) => ({
      ...client,
      admins: adminMap[client.company_id] || [],
    }));

    res.json(enriched);
  } catch (err) {
    console.error("❌ Error fetching clients", err);
    res.status(500).json({ error: "Failed to fetch clients" });
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

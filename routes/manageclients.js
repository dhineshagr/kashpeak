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

    // 2. Fetch individual project names and statuses
    const projectRes = await db.query(`
      SELECT company_id, project_category AS name, current_status
      FROM kash_operations_created_projects_table
    `);

    // 3. Build a map of projects per company
    const projectMap = {};
    for (const row of projectRes.rows) {
      if (!projectMap[row.company_id]) projectMap[row.company_id] = [];
      projectMap[row.company_id].push({
        name: row.name, // ✅ correctly use the alias from SELECT
        status: row.current_status?.toLowerCase() || "inactive"
      });
    }

    // 4. Enrich the client rows with project list
    const enriched = clientsRes.rows.map((client) => ({
      ...client,
      projects: projectMap[client.company_id] || [],
    }));

    res.json(enriched);
  } catch (err) {
    console.error("❌ Failed to fetch clients with project list:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});




// ✅ POST create new client (AUTO-GENERATE company_id)
router.post("/", authenticateToken, async (req, res) => {
  const {
    company_name,
    industry,
    address_line1,
    address_line2,
    city,
    state,
    country,
    zipcode
  } = req.body;

  try {
    // Auto-generate company_id (e.g., CMP202404151234)
    const timestamp = Date.now().toString().slice(-6); // get last 6 digits of timestamp
    const company_id = `CMP${new Date().getFullYear()}${timestamp}`;

    const result = await db.query(`
      INSERT INTO kash_operations_company_table (
        company_id, company_name, industry,
        company_address, address_line2,
        company_location_city, company_location_state,
        company_location_country, company_zip_code
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9
      ) RETURNING *
    `, [
      company_id, company_name, industry,
      address_line1, address_line2,
      city, state, country, zipcode
    ]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error creating client", err);
    res.status(500).json({ error: "Failed to create client" });
  }
});


// ✅ PUT update client
router.put("/:id", authenticateToken, async (req, res) => {
  const id = req.params.id;
  const {
    company_name,
    industry,
    address_line1,
    address_line2,
    city,
    state,
    country,
    zipcode,
  } = req.body;

  try {
    const result = await db.query(`
      UPDATE kash_operations_company_table SET
        company_name = $1,
        industry = $2,
        company_address = $3,
        address_line2 = $4,
        company_location_city = $5,
        company_location_state = $6,
        company_location_country = $7,
        company_zip_code = $8
      WHERE company_id = $9
      RETURNING *
    `, [
      company_name,
      industry,
      address_line1,
      address_line2,
      city,
      state,
      country,
      zipcode,
      id
    ]);

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error updating client", err);
    res.status(500).json({ error: "Update failed" });
  }
});


// ✅ DELETE client
router.delete("/:id", authenticateToken, async (req, res) => {
  const id = req.params.id;

  try {
    await db.query("DELETE FROM kash_operations_company_table WHERE company_id = $1", [id]);
    res.json({ message: "Client deleted" });
  } catch (err) {
    console.error("Error deleting client", err);
    res.status(500).json({ error: "Delete failed" });
  }
});

export default router;

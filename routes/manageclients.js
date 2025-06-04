import express from "express";
import db from "../db/index.js";
import { authenticateToken } from "./auth.js";

const router = express.Router();


// ✅ Create new client
router.get("/", authenticateToken, async (req, res) => {
  const empId = req.user?.emp_id;
  const role = req.user?.role;

  try {
    let companiesFilterClause = "";
    let values = [];

    // Only Super Admin can view all companies
    if (role === "Super Admin") {
      companiesFilterClause = ""; // No filter
    } else {
      // Admin must be filtered by assignment
      const assignedCompaniesRes = await db.query(
        `SELECT company_id FROM kash_operations_company_admin_role_table WHERE emp_id = $1`,
        [empId]
      );

      const allowedCompanyIds = assignedCompaniesRes.rows.map(row => row.company_id);

      if (allowedCompanyIds.length === 0) {
        return res.json([]); // No assigned companies
      }

      companiesFilterClause = `WHERE c.company_id = ANY($1)`;
      values = [allowedCompanyIds];
    }

    const clientsRes = await db.query(
      `
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
      ${companiesFilterClause}
      GROUP BY c.company_id
      ORDER BY c.company_name
      `,
      values
    );

    const projectRes = await db.query(`
      SELECT company_id, project_category AS name, current_status
      FROM kash_operations_created_projects_table
    `);

    const projectMap = {};
    for (const row of projectRes.rows) {
      if (!projectMap[row.company_id]) projectMap[row.company_id] = [];
      projectMap[row.company_id].push({
        name: row.name,
        status: row.current_status?.toLowerCase() || "inactive",
      });
    }

    const enriched = clientsRes.rows.map(client => ({
      ...client,
      projects: projectMap[client.company_id] || [],
    }));

    res.json(enriched);
  } catch (err) {
    console.error("❌ Failed to fetch client data:", err);
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

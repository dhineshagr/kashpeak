import express from "express";
import db from "../db/index.js";
import { authenticateToken } from "./auth.js";

const router = express.Router();

// ✅ GET all clients with project stats
router.get("/", authenticateToken, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        c.company_id,
        c.company_name,
        c.contact_name,
        c.email,
        c.phone,
        c.industry,
        c.hours_billed,
        c.hours_projected,
        c.address_line1,
        c.address_line2,
        c.city,
        c.state,
        c.country,
        c.zipcode,
        COUNT(p.*) AS total_projects,
        COUNT(*) FILTER (WHERE p.current_status = 'active') AS active_projects
      FROM kash_operations_company_table c
      LEFT JOIN kash_operations_created_projects_table p ON c.company_id = p.company_id
      GROUP BY c.company_id
      ORDER BY c.company_name
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching clients", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ POST create new client
router.post("/", authenticateToken, async (req, res) => {
  const {
    company_id, company_name, contact_name, email, phone,
    industry, hours_billed, hours_projected,
    address_line1, address_line2, city, state, country, zipcode
  } = req.body;

  try {
    const check = await db.query(
      "SELECT company_id FROM kash_operations_company_table WHERE company_id = $1",
      [company_id]
    );

    if (check.rows.length > 0) {
      return res.status(400).json({ error: "Company ID already exists" });
    }

    const result = await db.query(`
      INSERT INTO kash_operations_company_table (
        company_id, company_name, contact_name, email, phone,
        industry, hours_billed, hours_projected,
        address_line1, address_line2, city, state, country, zipcode
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10, $11, $12, $13, $14
      ) RETURNING *
    `, [
      company_id, company_name, contact_name, email, phone,
      industry, hours_billed, hours_projected,
      address_line1, address_line2, city, state, country, zipcode
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
    company_name, contact_name, email, phone,
    industry, hours_billed, hours_projected,
    address_line1, address_line2, city, state, country, zipcode
  } = req.body;

  try {
    const result = await db.query(`
      UPDATE kash_operations_company_table SET
        company_name = $1,
        contact_name = $2,
        email = $3,
        phone = $4,
        industry = $5,
        hours_billed = $6,
        hours_projected = $7,
        address_line1 = $8,
        address_line2 = $9,
        city = $10,
        state = $11,
        country = $12,
        zipcode = $13
      WHERE company_id = $14
      RETURNING *
    `, [
      company_name, contact_name, email, phone,
      industry, hours_billed, hours_projected,
      address_line1, address_line2, city, state, country, zipcode,
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

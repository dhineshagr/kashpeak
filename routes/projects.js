import express from "express";
import db from "../db/index.js";
import { authenticateToken } from "./auth.js";

const router = express.Router();

// ✅ GET all projects for a specific company by company_id
router.get("/company/:companyId", authenticateToken, async (req, res) => {
  const { companyId } = req.params;
  try {
    const result = await db.query(
      `SELECT 
         sow_id,
         company_id,
         project_category AS project_name,
         current_status,
         original_start_date,
         original_end_date,
         total_projected_hours
       FROM kash_operations_created_projects_table
       WHERE company_id = $1
       ORDER BY sow_id ASC`,
      [companyId]
    );
    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Error fetching projects", err);
    res.status(500).json({ error: "Failed to fetch projects" });
  }
});

// ✅ CREATE new project
router.post("/", authenticateToken, async (req, res) => {
  const {
    company_id,
    sow_id,
    project_name,
    current_status,
    original_start_date,
    original_end_date,
    total_projected_hours,
  } = req.body;

  try {
    const result = await db.query(
      `INSERT INTO kash_operations_created_projects_table
       (company_id, sow_id, project_category, current_status, original_start_date, original_end_date, total_projected_hours)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [company_id, sow_id, project_name, current_status, original_start_date, original_end_date, total_projected_hours]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error creating project", err);
    res.status(500).json({ error: "Failed to create project" });
  }
});

// ✅ UPDATE project by sowId
router.put("/:sowId", authenticateToken, async (req, res) => {
  const { sowId } = req.params;
  const {
    project_name,
    current_status,
    original_start_date,
    original_end_date,
    total_projected_hours,
  } = req.body;

  try {
    const result = await db.query(
      `UPDATE kash_operations_created_projects_table SET
       project_category = $1,
       current_status = $2,
       original_start_date = $3,
       original_end_date = $4,
       total_projected_hours = $5
       WHERE sow_id = $6
       RETURNING *`,
      [project_name, current_status, original_start_date, original_end_date, total_projected_hours, sowId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error updating project", err);
    res.status(500).json({ error: "Failed to update project" });
  }
});

// ✅ DELETE project by sowId
router.delete("/:sowId", authenticateToken, async (req, res) => {
  const { sowId } = req.params;
  try {
    await db.query(
      "DELETE FROM kash_operations_created_projects_table WHERE sow_id = $1",
      [sowId]
    );
    res.json({ message: "Project deleted" });
  } catch (err) {
    console.error("Error deleting project", err);
    res.status(500).json({ error: "Failed to delete project" });
  }
});

  
export default router;

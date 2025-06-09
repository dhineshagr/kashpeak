import express from "express";
import db from "../db/index.js";
import { authenticateToken } from "./auth.js";

const router = express.Router();

// ✅ GET all projects for a specific company by company_id
router.get("/company/:companyId", authenticateToken, async (req, res) => {
  console.log("Fetching projects for companyId:", req.params.companyId);
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
         total_projected_hours,
         assigned_employees
       FROM kash_operations_created_projects_table
       WHERE company_id = $1
       ORDER BY sow_id ASC`,
      [companyId]
    );
    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Error fetching projects by company:", err);
    res.status(500).json({ error: "Failed to fetch projects" });
  }
});

// ✅ GET a single project by sow_id (for editing individually if needed)
router.get("/:sowId", authenticateToken, async (req, res) => {
  const { sowId } = req.params;
  try {
    const result = await db.query(
      `SELECT 
         sow_id,
         company_id,
         project_category AS project_name,
         current_status,
         original_start_date,
         original_end_date,
         total_projected_hours,
         assigned_employees
       FROM kash_operations_created_projects_table
       WHERE sow_id = $1`,
      [sowId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching project by sowId:", err);
    res.status(500).json({ error: "Failed to fetch project" });
  }
});

// ✅ CREATE new project
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
    assigned_employees,
  } = req.body;

  // Safely parse or default to null
  const parsedHours = total_projected_hours !== "" && !isNaN(total_projected_hours)
    ? parseInt(total_projected_hours)
    : null;

  try {
    const result = await db.query(
      `INSERT INTO kash_operations_created_projects_table
       (company_id, sow_id, project_category, current_status, original_start_date, original_end_date, total_projected_hours, assigned_employees)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        company_id,
        sow_id,
        project_name,
        current_status,
        original_start_date,
        original_end_date,
        parsedHours,
        assigned_employees || [],
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error creating project:", err);
    if (err.code === "23505") {
      return res.status(400).json({ error: `SOW ID '${sow_id}' already exists.` });
    }
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
    assigned_employees,
  } = req.body;

  try {
    const result = await db.query(
      `UPDATE kash_operations_created_projects_table SET
       project_category = $1,
       current_status = $2,
       original_start_date = $3,
       original_end_date = $4,
       total_projected_hours = $5,
       assigned_employees = $6
       WHERE sow_id = $7
       RETURNING *`,
      [
        project_name,
        current_status,
        original_start_date,
        original_end_date,
        total_projected_hours,
        assigned_employees || [],
        sowId,
      ]
    );
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error("Error updating project:", err);
    res.status(500).json({ error: "Failed to update project" });
  }
});

// ✅ DELETE project by sowId
router.delete("/:sowId", authenticateToken, async (req, res) => {
  const { sowId } = req.params;

  try {
    // Step 1: Delete from employee assignments
    await db.query(
      "DELETE FROM kash_operations_project_employee_table WHERE sow_id = $1",
      [sowId]
    );

    // Step 2: Delete from role assignments
    await db.query(
      "DELETE FROM kash_operations_project_roles_table WHERE sow_id = $1",
      [sowId]
    );

    // Step 3: Delete from project table
    await db.query(
      "DELETE FROM kash_operations_created_projects_table WHERE sow_id = $1",
      [sowId]
    );

    res.status(200).json({ message: "Project deleted successfully" });
  } catch (err) {
    console.error("Error deleting project:", err);
    res.status(500).json({ error: "Failed to delete project" });
  }
});


// ✅ GET all projects (used for Timesheet dropdowns, etc.)
router.get("/", authenticateToken, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        sow_id,
        company_id,
        project_category AS project_name,
        current_status,
        original_start_date,
        original_end_date,
        total_projected_hours,
        assigned_employees
      FROM kash_operations_created_projects_table
      ORDER BY project_category ASC
    `);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Error fetching all projects:", err);
    res.status(500).json({ error: "Failed to fetch all projects" });
  }
});
// ✅ Get Task Breakdown for a project
// ✅ Fixed: Task Breakdown using actual sub-category table
router.get("/:sowId/tasks", authenticateToken, async (req, res) => {
  const { sowId } = req.params;
  try {
    const result = await db.query(
      `SELECT sub_task_title AS task_name, segment_1
       FROM kash_operations_project_sub_category_table
       WHERE sow_id = $1`,
      [sowId]
    );

    const tasks = result.rows.map((task, i) => ({
      task_name: task.task_name,
      percent_complete: ((i + 1) * 10) % 100 // dummy logic
    }));

    res.json(tasks);
  } catch (err) {
    console.error("❌ Error fetching task breakdown:", err);
    res.status(500).json({ error: "Failed to fetch task breakdown" });
  }
});


// ✅ Get Employee Breakdown for a project
router.get("/:sowId/employees", authenticateToken, async (req, res) => {
  const { sowId } = req.params;
  try {
    const result = await db.query(
      `SELECT 
         u.emp_id,
         u.first_name,
         u.last_name,
         SUM(t.monday_hours + t.tuesday_hours + t.wednesday_hours + 
             t.thursday_hours + t.friday_hours + t.saturday_hours + 
             t.sunday_hours) AS total_hours
       FROM kash_operations_timesheet_table t
       JOIN kash_operations_user_table u ON t.emp_id = u.emp_id
       WHERE t.sow_id = $1
       GROUP BY u.emp_id, u.first_name, u.last_name
       ORDER BY total_hours DESC`,
      [sowId]
    );
    res.status(200).json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching employee breakdown:", err);
    res.status(500).json({ error: "Failed to fetch employee breakdown" });
  }
});

// POST /api/projects/assign-role
router.post("/assign-role", authenticateToken, async (req, res) => {
  const { sow_id, role_id, estimated_hours } = req.body;
  try {
    await db.query(
      `INSERT INTO kash_operations_project_roles_table (sow_id, role_id, estimated_hours)
       VALUES ($1, $2, $3)
       ON CONFLICT (sow_id, role_id) DO UPDATE SET estimated_hours = $3`,
      [sow_id, role_id, estimated_hours]
    );
    res.status(200).json({ message: "Role assigned to project." });
  } catch (err) {
    console.error("Error assigning role:", err);
    res.status(500).json({ error: "Failed to assign role." });
  }
});

// POST /api/projects/assign-employee
router.post("/assign-employee", authenticateToken, async (req, res) => {
  const { sow_id, emp_id, role_id } = req.body;

  if (!sow_id || !emp_id || !role_id) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    await db.query(
      `INSERT INTO kash_operations_project_employee_table (sow_id, emp_id, role_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (sow_id, emp_id) DO UPDATE SET role_id = EXCLUDED.role_id`,
      [sow_id, emp_id, role_id]
    );
    res.status(200).json({ message: "Employee assigned to role successfully." });
  } catch (err) {
    console.error("Error creating project:", err);
    if (err.code === "23505") {
      return res.status(400).json({ error: "SOW ID already exists. Please use a unique ID." });
    }
    res.status(500).json({ error: "Failed to create project" });
  }
});

router.get("/:sowId/assigned-employees", authenticateToken, async (req, res) => {
  const { sowId } = req.params;
  try {
    const result = await db.query(`
      SELECT e.emp_id, u.first_name, u.last_name, r.role_id, r.role_name
      FROM kash_operations_project_employee_table e
      JOIN kash_operations_user_table u ON e.emp_id = u.emp_id
      JOIN kash_operations_roles_table r ON e.role_id = r.role_id
      WHERE e.sow_id = $1
    `, [sowId]);

    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Error fetching assigned employees:", err);
    res.status(500).json({ error: "Failed to fetch assigned employees." });
  }
});

// ✅ GET all role assignments for a project (roles + employees per role)
router.get("/:sowId/assignments", authenticateToken, async (req, res) => {
  const { sowId } = req.params;
  try {
    const rolesResult = await db.query(
      `SELECT pr.role_id, r.role_name, pr.estimated_hours
       FROM kash_operations_project_roles_table pr
       JOIN kash_operations_roles_table r ON pr.role_id = r.role_id
       WHERE pr.sow_id = $1`,
      [sowId]
    );

    const assignments = [];

    for (const role of rolesResult.rows) {
      const empResult = await db.query(
        `SELECT emp_id FROM kash_operations_project_employee_table
         WHERE sow_id = $1 AND role_id = $2`,
        [sowId, role.role_id]
      );

      const employeeIds = empResult.rows.map((row) => row.emp_id);

      assignments.push({
        role_id: role.role_id,
        role_name: role.role_name,
        estimated_hours: role.estimated_hours,
        employees: employeeIds,
      });
    }

    res.status(200).json(assignments);
  } catch (err) {
    console.error("Error fetching role assignments:", err);
    res.status(500).json({ error: "Failed to fetch role assignments." });
  }
});

// DELETE /api/projects/:sowId/role/:roleId
router.delete("/:sowId/role/:roleId", authenticateToken, async (req, res) => {
  const { sowId, roleId } = req.params;
  try {
    // 1. Delete employees assigned to this role
    await db.query(
      `DELETE FROM kash_operations_project_employee_table WHERE sow_id = $1 AND role_id = $2`,
      [sowId, roleId]
    );

    // 2. Delete role itself from the role mapping table
    await db.query(
      `DELETE FROM kash_operations_project_roles_table WHERE sow_id = $1 AND role_id = $2`,
      [sowId, roleId]
    );

    res.status(200).json({ message: "Role removed successfully." });
  } catch (err) {
    console.error("❌ Error removing role:", err);
    res.status(500).json({ error: "Failed to remove role." });
  }
});


// GET /api/projects/:sowId/role-breakdown
router.get("/:sowId/role-breakdown", authenticateToken, async (req, res) => {
  const { sowId } = req.params;

  try {
    const result = await db.query(`
      SELECT 
        r.role_name,
        u.first_name,
        u.last_name,
        pr.estimated_hours AS assigned_hours,
        COALESCE(SUM(
          COALESCE(t.monday_hours, 0) +
          COALESCE(t.tuesday_hours, 0) +
          COALESCE(t.wednesday_hours, 0) +
          COALESCE(t.thursday_hours, 0) +
          COALESCE(t.friday_hours, 0) +
          COALESCE(t.saturday_hours, 0) +
          COALESCE(t.sunday_hours, 0)
        ), 0) AS utilized_hours
      FROM kash_operations_project_employee_table pe
      JOIN kash_operations_user_table u ON pe.emp_id = u.emp_id
      JOIN kash_operations_roles_table r ON pe.role_id = r.role_id
      JOIN kash_operations_project_roles_table pr ON pr.sow_id = pe.sow_id AND pr.role_id = pe.role_id
      LEFT JOIN kash_operations_timesheet_table t ON t.emp_id = pe.emp_id AND t.sow_id = pe.sow_id
      WHERE pe.sow_id = $1
      GROUP BY r.role_name, u.first_name, u.last_name, pr.estimated_hours
      ORDER BY r.role_name, u.first_name
    `, [sowId]);

    res.status(200).json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching role breakdown:", err);
    res.status(500).json({ error: "Failed to fetch role breakdown." });
  }
});

// GET /api/roles
router.get("/roles", authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT role_id, role_name FROM kash_operations_roles_table ORDER BY role_name`
    );
    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Error fetching roles:", err);
    res.status(500).json({ error: "Failed to fetch roles" });
  }
});


export default router;

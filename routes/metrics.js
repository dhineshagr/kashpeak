// routes/metrics.js
import express from "express";
import db from "../db/index.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

// Helper to get user role and permitted company_ids
async function getUserContext(empId) {
  const userRes = await db.query(
    "SELECT admin_level FROM kash_operations_user_table WHERE emp_id = $1",
    [empId]
  );
  const role = userRes.rows[0]?.admin_level || "Basic";

  let companyIds = [];
  if (role === "Admin") {
    const compRes = await db.query(
      "SELECT company_id FROM kash_operations_company_admin_role_table WHERE emp_id = $1",
      [empId]
    );
    companyIds = compRes.rows.map((r) => r.company_id);
  }

  return { role, companyIds };
}

// 1. Total Projects
router.get("/total-projects", authenticateToken, async (req, res) => {
  const empId = req.user.emp_id;
  const { role, companyIds } = await getUserContext(empId);

  try {
    let result;

    if (role === "Super Admin") {
      result = await db.query(`SELECT COUNT(DISTINCT sow_id) AS total_projects FROM kash_operations_created_projects_table`);
    } else if (role === "Admin") {
      result = await db.query(
        `SELECT COUNT(DISTINCT sow_id) AS total_projects
         FROM kash_operations_created_projects_table
         WHERE company_id = ANY($1::text[])`,
        [companyIds]
      );
    } else {
      return res.status(403).json({ error: "Access denied" });
    }

    res.json({ totalProjects: result.rows[0].total_projects });
  } catch (err) {
    console.error("Error fetching total projects:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// 2. Active Projects
router.get("/active-projects", authenticateToken, async (req, res) => {
  const empId = req.user.emp_id;
  const { role, companyIds } = await getUserContext(empId);

  try {
    let result;

    if (role === "Super Admin") {
      result = await db.query(
        `SELECT COUNT(DISTINCT sow_id) AS active_projects
         FROM kash_operations_created_projects_table
         WHERE current_status = 'Active'`
      );
    } else if (role === "Admin") {
      result = await db.query(
        `SELECT COUNT(DISTINCT sow_id) AS active_projects
         FROM kash_operations_created_projects_table
         WHERE company_id = ANY($1::text[]) AND current_status = 'Active'`,
        [companyIds]
      );
    } else {
      return res.status(403).json({ error: "Access denied" });
    }

    res.json({ activeProjects: result.rows[0].active_projects });
  } catch (err) {
    console.error("Failed to fetch active projects:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// 3. Clients
router.get("/clients", authenticateToken, async (req, res) => {
  const empId = req.user.emp_id;
  const { role, companyIds } = await getUserContext(empId);

  try {
    let result;

    if (role === "Super Admin") {
      result = await db.query(`SELECT COUNT(DISTINCT company_id) AS clients FROM kash_operations_created_projects_table`);
    } else if (role === "Admin") {
      result = await db.query(
        `SELECT COUNT(DISTINCT company_id) AS clients
         FROM kash_operations_created_projects_table
         WHERE company_id = ANY($1::text[])`,
        [companyIds]
      );
    } else {
      return res.status(403).json({ error: "Access denied" });
    }

    res.json({ clients: result.rows[0].clients });
  } catch (err) {
    console.error("Failed to fetch clients:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// 4. Employees Assigned
router.get("/employees-assigned", authenticateToken, async (req, res) => {
  const empId = req.user.emp_id;
  const { role, companyIds } = await getUserContext(empId);

  try {
    let result;

    if (role === "Super Admin") {
      result = await db.query(`SELECT COUNT(DISTINCT emp_id) AS employees FROM kash_operations_employee_assignment_table`);
    } else if (role === "Admin") {
      result = await db.query(
        `SELECT COUNT(DISTINCT ea.emp_id) AS employees
         FROM kash_operations_employee_assignment_table ea
         JOIN kash_operations_created_projects_table p ON ea.sow_id = p.sow_id
         WHERE p.company_id = ANY($1::text[])`,
        [companyIds]
      );
    } else {
      return res.status(403).json({ error: "Access denied" });
    }

    res.json({ employees: result.rows[0].employees });
  } catch (err) {
    console.error("Failed to fetch employees:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// 5. Avg Hours Billed
router.get("/avg-hours-billed", authenticateToken, async (req, res) => {
  const empId = req.user.emp_id;
  const { role, companyIds } = await getUserContext(empId);

  try {
    let result;

    if (role === "Super Admin") {
      result = await db.query(
        `SELECT AVG(total_projected_hours)::INT AS avg_hours
         FROM kash_operations_created_projects_table`
      );
    } else if (role === "Admin") {
      result = await db.query(
        `SELECT AVG(total_projected_hours)::INT AS avg_hours
         FROM kash_operations_created_projects_table
         WHERE company_id = ANY($1::text[])`,
        [companyIds]
      );
    } else {
      return res.status(403).json({ error: "Access denied" });
    }

    res.json({ avgHours: result.rows[0]?.avg_hours || 0 });
  } catch (err) {
    console.error("Failed to fetch avg hours:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;

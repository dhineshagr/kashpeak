// routes/dashboard.js
import express from "express";
import db from "../db/index.js";
import { authenticateToken } from "./auth.js";

const router = express.Router();

router.get("/client-projects", authenticateToken, async (req, res) => {
  const empId = req.user.emp_id;

  try {
    // 1. Get user role
    const roleQuery = await db.query(
      "SELECT admin_level FROM kash_operations_user_table WHERE emp_id = $1",
      [empId]
    );
    const adminLevel = roleQuery.rows[0]?.admin_level || "Basic";

    let result;

    // 2. Super Admin → All projects
    if (adminLevel === "Super Admin") {
      result = await db.query(
        `
        SELECT
          p.sow_id,  -- ✅ Added
          c.company_name,
          p.project_category AS project_name,
          p.total_projected_hours,
          COALESCE(SUM(
            COALESCE(t.monday_hours, 0) +
            COALESCE(t.tuesday_hours, 0) +
            COALESCE(t.wednesday_hours, 0) +
            COALESCE(t.thursday_hours, 0) +
            COALESCE(t.friday_hours, 0) +
            COALESCE(t.saturday_hours, 0) +
            COALESCE(t.sunday_hours, 0)
          ), 0) AS hours_billed
        FROM kash_operations_created_projects_table p
        JOIN kash_operations_company_table c ON p.company_id = c.company_id
        LEFT JOIN kash_operations_timesheet_table t ON p.sow_id = t.sow_id
        GROUP BY p.sow_id, c.company_name, p.project_category, p.total_projected_hours
        ORDER BY c.company_name
        `
      );
    }
    // 3. Admin → Projects mapped in company_admin_role_table
    else if (adminLevel === "Admin") {
      result = await db.query(
        `
        SELECT
          p.sow_id,  -- ✅ Added
          c.company_name,
          p.project_category AS project_name,
          p.total_projected_hours,
          COALESCE(SUM(
            COALESCE(t.monday_hours, 0) +
            COALESCE(t.tuesday_hours, 0) +
            COALESCE(t.wednesday_hours, 0) +
            COALESCE(t.thursday_hours, 0) +
            COALESCE(t.friday_hours, 0) +
            COALESCE(t.saturday_hours, 0) +
            COALESCE(t.sunday_hours, 0)
          ), 0) AS hours_billed
        FROM kash_operations_created_projects_table p
        JOIN kash_operations_company_table c ON p.company_id = c.company_id
        JOIN kash_operations_company_admin_role_table a ON p.company_id = a.company_id
        LEFT JOIN kash_operations_timesheet_table t ON p.sow_id = t.sow_id
        WHERE a.emp_id = $1
        GROUP BY p.sow_id, c.company_name, p.project_category, p.total_projected_hours
        ORDER BY c.company_name
        `,
        [empId]
      );
    }
    // 4. Basic users → No access
    else {
      return res.status(403).json({ error: "Unauthorized. Dashboard access is restricted." });
    }

    // Group results by client
    const grouped = {};
    result.rows.forEach((row) => {
      if (!grouped[row.company_name]) {
        grouped[row.company_name] = [];
      }

      grouped[row.company_name].push({
        sow_id: row.sow_id, // ✅ Included for navigation
        project: row.project_name,
        hours_billed: parseFloat(row.hours_billed),
        total_hours: parseFloat(row.total_projected_hours),
      });
    });

    res.json(grouped);
  } catch (err) {
    console.error("Error fetching client projects:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;

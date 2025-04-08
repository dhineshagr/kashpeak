// routes/projectDetails.js
import express from "express";
import db from "../db/index.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

// GET /api/project-details/:sowId
router.get("/:sowId", authenticateToken, async (req, res) => {
    const { sowId } = req.params;
    const empId = req.user.emp_id;

    try {
        console.log("🔍 Checking project for sowId:", sowId); // ✅ Debug: incoming ID

        const projectRes = await db.query(
            `SELECT p.sow_id, p.project_category, p.total_projected_hours, 
              p.original_start_date, p.original_end_date, 
              c.company_name, c.company_location_city, c.company_location_state
       FROM kash_operations_created_projects_table p
       JOIN kash_operations_company_table c ON p.company_id = c.company_id
       WHERE p.sow_id = $1`,
            [sowId]
        );

        console.log("📦 Query result:", projectRes.rows); // ✅ Debug: DB result

        if (projectRes.rows.length === 0) {
            return res.status(404).json({ error: "Project not found" });
        }

        res.json(projectRes.rows[0]);

    } catch (err) {
        console.error("❌ Error fetching project details:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// ✅ 3. GET employee breakdown (UPDATED)
// ✅ GET employee breakdown
router.get("/:sowId/employees", authenticateToken, async (req, res) => {
    const { sowId } = req.params;

    try {
        const result = await db.query(
            `SELECT 
           u.first_name || ' ' || u.last_name AS emp_name,
           SUM(
             COALESCE(t.monday_hours, 0) +
             COALESCE(t.tuesday_hours, 0) +
             COALESCE(t.wednesday_hours, 0) +
             COALESCE(t.thursday_hours, 0) +
             COALESCE(t.friday_hours, 0) +
             COALESCE(t.saturday_hours, 0) +
             COALESCE(t.sunday_hours, 0)
           ) AS total_hours
         FROM kash_operations_timesheet_table t
         JOIN kash_operations_user_table u ON t.emp_id = u.emp_id
         WHERE t.sow_id = $1
         GROUP BY u.first_name, u.last_name
         ORDER BY total_hours DESC`,
            [sowId]
        );

        res.json(result.rows);
    } catch (err) {
        console.error("❌ Error fetching employees:", err);
        res.status(500).json({ error: "Server error" });
    }
});


//Get Tasks
router.get("/:sowId/tasks", authenticateToken, async (req, res) => {
    const { sowId } = req.params;

    try {
        const result = await db.query(
            `SELECT sub_task_title AS task_name, segment_1
         FROM kash_operations_project_sub_category_table
         WHERE sow_id = $1`,
            [sowId]
        );

        // Just simulate dummy percentage for now (replace with real if available)
        const tasks = result.rows.map((task, i) => ({
            task_name: task.task_name,
            percent_complete: (i + 1) * 10 % 100 // Dummy example
        }));

        res.json(tasks);
    } catch (err) {
        console.error("❌ Error fetching tasks:", err);
        res.status(500).json({ error: "Server error" });
    }
});




export default router;

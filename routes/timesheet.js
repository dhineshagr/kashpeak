import express from "express";
import db from "../db/index.js"; // ✅ Correct pool import
import { authenticateToken } from "./auth.js";

const router = express.Router();

// ✅ Batch Insert Route (unchanged)
router.post("/add-batch", async (req, res) => {
  const { entries } = req.body;

  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ message: "No entries provided" });
  }

  try {
    const insertPromises = entries.map((entry) =>
      db.query(
        `INSERT INTO kash_operations_timesheet_table (
          emp_id, sow_id, period_start_date, billable, non_billable_reason, ticket_num,
          monday_hours, tuesday_hours, wednesday_hours, thursday_hours, friday_hours,
          saturday_hours, sunday_hours, sub_assignment,
          sub_assignment_segment_1, sub_assignment_segment_2, timesheet_status_entry
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11,
          $12, $13, $14,
          $15, $16, $17
        )`,
        [
          entry.emp_id, entry.sow_id, entry.period_start_date, entry.billable, entry.non_billable_reason,
          entry.ticket_num, entry.monday_hours, entry.tuesday_hours, entry.wednesday_hours,
          entry.thursday_hours, entry.friday_hours, entry.saturday_hours, entry.sunday_hours,
          entry.sub_assignment, entry.sub_assignment_segment_1, entry.sub_assignment_segment_2,
          entry.timesheet_status_entry
        ]
      )
    );

    await Promise.all(insertPromises);
    return res.status(200).json({ message: "Timesheet batch saved successfully" });
  } catch (err) {
    console.error("Batch insert error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ✅ Insert Single Timesheet Entry (unchanged)
router.post("/add-entry", async (req, res) => {
  const {
    emp_id, sow_id, period_start_date, billable, non_billable_reason, ticket_num,
    monday_hours, tuesday_hours, wednesday_hours, thursday_hours, friday_hours,
    saturday_hours, sunday_hours, sub_assignment, sub_assignment_segment_1, sub_assignment_segment_2
  } = req.body;

  try {
    const existing = await db.query(
      `SELECT * FROM kash_operations_timesheet_table 
       WHERE emp_id = $1 AND period_start_date = $2`,
      [emp_id, period_start_date]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ message: "Timesheet for this week already exists." });
    }

    await db.query(
      `INSERT INTO kash_operations_timesheet_table (
        emp_id, sow_id, period_start_date, billable, non_billable_reason, ticket_num,
        monday_hours, tuesday_hours, wednesday_hours, thursday_hours, friday_hours,
        saturday_hours, sunday_hours, sub_assignment,
        sub_assignment_segment_1, sub_assignment_segment_2, timesheet_status_entry
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14,
        $15, $16, 'Submitted'
      )`,
      [
        emp_id, sow_id, period_start_date, billable, non_billable_reason, ticket_num,
        monday_hours, tuesday_hours, wednesday_hours, thursday_hours, friday_hours,
        saturday_hours, sunday_hours, sub_assignment,
        sub_assignment_segment_1, sub_assignment_segment_2
      ]
    );

    res.status(200).json({ message: "Timesheet submitted successfully." });

  } catch (err) {
    console.error("Error inserting timesheet:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ✅ Corrected GET /api/timesheet/companies?billable=true or false
router.get("/companies", async (req, res) => {
    const { billable } = req.query;
  
    try {
      if (billable === undefined) {
        return res.status(400).json({ error: "Missing billable query param" });
      }
  
      const isBillable = billable === "true";
      const result = await db.query(
        `SELECT company_id, company_name 
         FROM kash_operations_company_table 
         WHERE is_billable = $1`,
        [isBillable]
      );
  
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching companies by billable state:", err);
      res.status(500).json({ error: "Server error" });
    }
  });
  

// ✅ Get Projects by Company
router.get("/projects/:companyId", authenticateToken, async (req, res) => {
  const { companyId } = req.params;

  try {
    const result = await db.query(
      `SELECT sow_id, project_category, current_status
       FROM kash_operations_created_projects_table
       WHERE company_id = $1`,
      [companyId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching projects:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ Get Work Area and Task Area by Project
router.get("/project-details/:sowId", authenticateToken, async (req, res) => {
  const { sowId } = req.params;

  try {
    const result = await db.query(
      `SELECT DISTINCT sub_assignment AS work_area, sub_assignment_segment_1 AS task_area
       FROM kash_operations_timesheet_table
       WHERE sow_id = $1 AND sub_assignment IS NOT NULL`,
      [sowId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching work/task area:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ Route to get Work Area and Task Area based on sow_id
router.get("/areas/:sowId", async (req, res) => {
    const { sowId } = req.params;
  
    try {
      const result = await db.query(
        `SELECT DISTINCT sub_task_title, segment_1 
         FROM kash_operations_project_sub_category_table 
         WHERE sow_id = $1`,
        [sowId]
      );
  
      const workAreas = [...new Set(result.rows.map((r) => r.sub_task_title).filter(Boolean))];
      const taskAreas = [...new Set(result.rows.map((r) => r.segment_1).filter(Boolean))];
  
      res.json({ workAreas, taskAreas });
    } catch (err) {
      console.error("Error fetching areas:", err);
      res.status(500).json({ error: "Failed to fetch work/task areas" });
    }
  });

  // ✅ GET /api/timesheet/report - Return sample timesheet report data
router.get("/report", authenticateToken, async (req, res) => {
    try {
      const result = await db.query(`
        SELECT 
          t.emp_id,
          u.first_name || ' ' || u.last_name AS employee_name,
          t.sow_id,
          p.project_category,
          c.company_name,
          t.period_start_date,
          t.monday_hours, t.tuesday_hours, t.wednesday_hours,
          t.thursday_hours, t.friday_hours, t.saturday_hours, t.sunday_hours,
          t.ticket_num,
          t.sub_assignment AS work_area,
          t.sub_assignment_segment_1 AS task_area,
          t.sub_assignment_segment_2 AS notes
        FROM kash_operations_timesheet_table t
        JOIN kash_operations_user_table u ON t.emp_id = u.emp_id
        JOIN kash_operations_created_projects_table p ON t.sow_id = p.sow_id
        JOIN kash_operations_company_table c ON p.company_id = c.company_id
        ORDER BY t.period_start_date DESC
      `);
  
      res.json(result.rows);
    } catch (err) {
      console.error("❌ Error fetching report data:", err);
      res.status(500).json({ error: "Failed to fetch report data" });
    }
  });
  
  
export default router;

import express from "express";
import db from "../db/index.js";
import { authenticateToken } from "./auth.js";
import { format } from "date-fns";

const router = express.Router();

// ✅ Helper to safely parse hours
const parseNumber = (val) => {
  const num = parseFloat(val);
  return isNaN(num) ? 0 : num;
};

// ✅ Insert new entries only if they don’t exist
router.post("/add-batch", authenticateToken, async (req, res) => {
  const { entries } = req.body;

  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ message: "No entries provided" });
  }

  try {
    for (const entry of entries) {
      const { emp_id, sow_id, period_start_date } = entry;

      if (!emp_id || !sow_id || !period_start_date) {
        console.warn("⛔ Skipping invalid entry:", entry);
        continue;
      }

      // 🔁 Check if this combination already exists
      const existing = await db.query(
        `SELECT timesheet_entry_id FROM kash_operations_timesheet_table
         WHERE emp_id = $1 AND sow_id = $2 AND period_start_date = $3`,
        [emp_id, sow_id, period_start_date]
      );

      if (existing.rows.length > 0) {
        console.log(`⚠️ Skipping existing entry for emp ${emp_id}, sow ${sow_id}, week ${period_start_date}`);
        continue;
      }

      // 🔁 Insert if new
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
          $15, $16, $17
        )`,
        [
          emp_id,
          sow_id,
          period_start_date,
          entry.billable,
          entry.non_billable_reason,
          entry.ticket_num,
          parseNumber(entry.monday_hours),
          parseNumber(entry.tuesday_hours),
          parseNumber(entry.wednesday_hours),
          parseNumber(entry.thursday_hours),
          parseNumber(entry.friday_hours),
          parseNumber(entry.saturday_hours),
          parseNumber(entry.sunday_hours),
          entry.sub_assignment,
          entry.sub_assignment_segment_1,
          entry.sub_assignment_segment_2,
          entry.timesheet_status_entry,
        ]
      );
    }

    res.status(200).json({ message: "✅ Timesheet batch saved. Duplicates skipped." });
  } catch (err) {
    console.error("❌ Insert error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Update Timesheet Entries
router.put("/update-entry", authenticateToken, async (req, res) => {
  const { entries } = req.body;

  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ message: "No entries to update" });
  }

  try {
    const updatePromises = entries.map((entry) =>
      db.query(
        `UPDATE kash_operations_timesheet_table SET
          billable = $4,
          non_billable_reason = $5,
          ticket_num = $6,
          monday_hours = $7,
          tuesday_hours = $8,
          wednesday_hours = $9,
          thursday_hours = $10,
          friday_hours = $11,
          saturday_hours = $12,
          sunday_hours = $13,
          sub_assignment = $14,
          sub_assignment_segment_1 = $15,
          sub_assignment_segment_2 = $16,
          timesheet_status_entry = $17
        WHERE emp_id = $1 AND sow_id = $2 AND period_start_date = $3`,
        [
          entry.emp_id,
          entry.sow_id,
          entry.period_start_date,
          entry.billable,
          entry.non_billable_reason,
          entry.ticket_num,
          parseNumber(entry.monday_hours),
          parseNumber(entry.tuesday_hours),
          parseNumber(entry.wednesday_hours),
          parseNumber(entry.thursday_hours),
          parseNumber(entry.friday_hours),
          parseNumber(entry.saturday_hours),
          parseNumber(entry.sunday_hours),
          entry.sub_assignment,
          entry.sub_assignment_segment_1,
          entry.sub_assignment_segment_2,
          entry.timesheet_status_entry,
        ]
      )
    );

    await Promise.all(updatePromises);
    return res.status(200).json({ message: "Timesheet entries updated successfully" });
  } catch (err) {
    console.error("Update error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ✅ Delete Timesheet Entry by ID
router.delete("/delete-entry-by-id/:entryId", authenticateToken, async (req, res) => {
  const { entryId } = req.params;

  try {
    const result = await db.query(
      `DELETE FROM kash_operations_timesheet_table WHERE timesheet_entry_id = $1`,
      [entryId]
    );

    if (result.rowCount === 0) {
      console.warn(`⚠️ Nothing deleted. No match for timesheet_entry_id=${entryId}`);
      return res.status(404).json({ message: "Entry not found" });
    }

    console.log(`🗑️ Deleted entryId=${entryId}`);
    res.status(200).json({ message: "Entry deleted successfully" });
  } catch (err) {
    console.error("❌ Delete by ID error:", err);
    res.status(500).json({ message: "Failed to delete entry" });
  }
});



// ✅ Get Companies by Billable Status
router.get("/companies", authenticateToken, async (req, res) => {
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

// ✅ Get Work/Task Area from Timesheet by sow_id
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

// ✅ Get Work and Task Areas from Project Sub Category Table
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

// ✅ Get Task Areas by sowId and workArea
router.get("/task-areas/:sowId/:workArea", async (req, res) => {
  const { sowId, workArea } = req.params;

  try {
    const result = await db.query(
      `SELECT DISTINCT segment_1 
       FROM kash_operations_project_sub_category_table 
       WHERE sow_id = $1 AND sub_task_title = $2 
         AND segment_1 IS NOT NULL AND segment_1 <> ''`,
      [sowId, workArea]
    );

    const taskAreas = result.rows.map((r) => r.segment_1);
    res.json({ taskAreas });
  } catch (err) {
    console.error("❌ Error fetching task areas:", err);
    res.status(500).json({ error: "Failed to fetch task areas" });
  }
});

// ✅ Get Timesheet by Week and EmpId
router.get("/week/:empId/:weekStartDate", authenticateToken, async (req, res) => {
  let { empId, weekStartDate } = req.params;

  empId = parseInt(empId);
  if (isNaN(empId)) {
    return res.status(400).json({ error: "Invalid employee ID. Must be a number." });
  }

  try {
    const result = await db.query(
      `SELECT 
         t.*, 
         p.project_category, 
         c.company_name 
       FROM kash_operations_timesheet_table t
       LEFT JOIN kash_operations_created_projects_table p ON t.sow_id = p.sow_id
       LEFT JOIN kash_operations_company_table c ON p.company_id = c.company_id
       WHERE t.emp_id = $1 AND t.period_start_date = $2`,
      [empId, weekStartDate]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching timesheet by week:", err);
    res.status(500).json({ error: "Failed to load timesheet" });
  }
});


// ✅ Get Timesheet Report by Week with Filters
// ✅ Get Timesheet Report by Week with Filters
router.get("/report", authenticateToken, async (req, res) => {
  const { startDate, endDate, clients, projects, employees, billable } = req.query;

  try {
    let query = `
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
        t.sub_assignment_segment_2 AS notes,
        t.billable
      FROM kash_operations_timesheet_table t
      JOIN kash_operations_user_table u ON t.emp_id = u.emp_id
      JOIN kash_operations_created_projects_table p ON t.sow_id = p.sow_id
      JOIN kash_operations_company_table c ON p.company_id = c.company_id
      WHERE 1=1
    `;

    const conditions = [];
    const values = [];

    if (startDate && endDate) {
      conditions.push(`t.period_start_date BETWEEN $${values.length + 1} AND $${values.length + 2}`);
      values.push(startDate, endDate);
    }

    if (clients) {
      const clientArray = clients.split(",");
      conditions.push(`c.company_name = ANY($${values.length + 1})`);
      values.push(clientArray);
    }

    if (projects) {
      const projectArray = projects.split(",");
      conditions.push(`p.project_category = ANY($${values.length + 1})`);
      values.push(projectArray);
    }

    if (employees) {
      const empArray = employees.split(",");
      conditions.push(`u.first_name || ' ' || u.last_name = ANY($${values.length + 1})`);
      values.push(empArray);
    }

    if (billable !== undefined) {
      conditions.push(`t.billable = $${values.length + 1}`);
      values.push(billable === "true");
    }

    if (conditions.length > 0) {
      query += ` AND ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY t.period_start_date DESC`;

    const result = await db.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching report data:", err);
    res.status(500).json({ error: "Failed to fetch report data" });
  }
});


// GET /api/timesheet/hours-report
router.get("/hours-report", authenticateToken, async (req, res) => {
  const { startDate, endDate } = req.query;

  console.log("➡️ Received Start Date:", startDate);
  console.log("➡️ Received End Date:", endDate);

  try {
    let dateFilter = '';
    const values = [];

    if (startDate && endDate) {
      dateFilter = `WHERE entry_date BETWEEN $1 AND $2`;
      values.push(startDate, endDate);
    }

    const result = await db.query(`
      SELECT 
        u.first_name || ' ' || u.last_name AS employee_name,
        c.company_name,
        p.project_category AS project_name,
        '' AS project_type,
        t.sub_assignment AS work_area,
        t.sub_assignment_segment_1 AS task_area,
        t.ticket_num,
        SUM(t.task_hours) AS total_hours
      FROM (
        WITH day_offsets AS (
          SELECT 'Monday' AS day, 0 AS offset
          UNION ALL SELECT 'Tuesday', 1
          UNION ALL SELECT 'Wednesday', 2
          UNION ALL SELECT 'Thursday', 3
          UNION ALL SELECT 'Friday', 4
          UNION ALL SELECT 'Saturday', 5
          UNION ALL SELECT 'Sunday', 6
        ), transformed AS (
          SELECT 
            odt.emp_id,
            odt.sow_id,
            odt.ticket_num,
            (odt.period_start_date + INTERVAL '1 day' * day_offsets.offset)::date AS entry_date,
            odt.sub_assignment,
            odt.sub_assignment_segment_1,
            CASE
              WHEN day_offsets.day = 'Monday' THEN odt.monday_hours
              WHEN day_offsets.day = 'Tuesday' THEN odt.tuesday_hours
              WHEN day_offsets.day = 'Wednesday' THEN odt.wednesday_hours
              WHEN day_offsets.day = 'Thursday' THEN odt.thursday_hours
              WHEN day_offsets.day = 'Friday' THEN odt.friday_hours
              WHEN day_offsets.day = 'Saturday' THEN odt.saturday_hours
              WHEN day_offsets.day = 'Sunday' THEN odt.sunday_hours
              ELSE NULL
            END AS task_hours
          FROM kash_operations_timesheet_table odt
          CROSS JOIN day_offsets
        )
        SELECT * FROM transformed
      ) t
      JOIN kash_operations_user_table u ON u.emp_id = t.emp_id
      JOIN kash_operations_created_projects_table p ON p.sow_id = t.sow_id
      JOIN kash_operations_company_table c ON c.company_id = p.company_id
      ${dateFilter}
      GROUP BY 
        u.first_name, u.last_name, 
        c.company_name, 
        p.project_category, 
        t.sub_assignment, t.sub_assignment_segment_1, 
        t.ticket_num
      ORDER BY employee_name
    `, values);

    console.log("✅ Rows fetched from DB:", result.rows.length);

    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching Hours Report", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// make sure this is at the top if not already

router.get("/daily-report", authenticateToken, async (req, res) => {
  const { startDate, endDate, clients, projects, employees, billable } = req.query;

  try {
    let query = `
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
        t.sub_assignment_segment_2 AS notes,
        t.billable
      FROM kash_operations_timesheet_table t
      JOIN kash_operations_user_table u ON t.emp_id = u.emp_id
      JOIN kash_operations_created_projects_table p ON t.sow_id = p.sow_id
      JOIN kash_operations_company_table c ON p.company_id = c.company_id
      WHERE 1=1
    `;

    const conditions = [];
    const values = [];

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      const adjustedStart = new Date(start);
      adjustedStart.setDate(start.getDate() - 6);

      const adjustedEnd = new Date(end);
      adjustedEnd.setDate(end.getDate() + 6);

      const formattedStart = format(adjustedStart, "yyyy-MM-dd");
      const formattedEnd = format(adjustedEnd, "yyyy-MM-dd");

      conditions.push(`t.period_start_date BETWEEN $${values.length + 1} AND $${values.length + 2}`);
      values.push(formattedStart, formattedEnd);
    }

    if (clients) {
      const clientArray = clients.split(",");
      conditions.push(`c.company_name = ANY($${values.length + 1})`);
      values.push(clientArray);
    }

    if (projects) {
      const projectArray = projects.split(",");
      conditions.push(`p.project_category = ANY($${values.length + 1})`);
      values.push(projectArray);
    }

    if (employees) {
      const empArray = employees.split(",");
      conditions.push(`u.first_name || ' ' || u.last_name = ANY($${values.length + 1})`);
      values.push(empArray);
    }

    if (billable !== undefined) {
      conditions.push(`t.billable = $${values.length + 1}`);
      values.push(billable === "true");
    }

    if (conditions.length > 0) {
      query += ` AND ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY t.period_start_date DESC`;

    const result = await db.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching report data:", err);
    res.status(500).json({ error: "Failed to fetch report data" });
  }
});

// backend/routes/timesheet.js

router.get("/daily-hours-report", authenticateToken, async (req, res) => {
  const { startDate, endDate, emp_ids } = req.query;
  const { emp_id, role } = req.user;

  console.log("➡️ Received Start Date:", startDate);
  console.log("➡️ Received End Date:", endDate);
  console.log("➡️ Received emp_ids:", emp_ids);
  console.log("➡️ User from token:", { emp_id, role });

  try {
    const conditions = [];
    const values = [];

    if (startDate && endDate) {
      conditions.push(`entry_date BETWEEN $${values.length + 1} AND $${values.length + 2}`);
      values.push(startDate, endDate);
    }

    if (role === "Basic") {
      conditions.push(`t.emp_id = $${values.length + 1}`);
      values.push(emp_id);
    } else if (emp_ids) {
      const ids = emp_ids.split(",").map(id => parseInt(id.trim())).filter(Boolean);
      if (ids.length > 0) {
        const placeholders = ids.map((_, i) => `$${values.length + i + 1}`).join(",");
        conditions.push(`t.emp_id IN (${placeholders})`);
        values.push(...ids);
      }
    } else if (role === "Admin" || role === "Super Admin") {
      const result = await db.query(`SELECT emp_id FROM kash_operations_user_table`);
      const ids = result.rows.map(row => row.emp_id);
      if (ids.length > 0) {
        const placeholders = ids.map((_, i) => `$${values.length + i + 1}`).join(",");
        conditions.push(`t.emp_id IN (${placeholders})`);
        values.push(...ids);
        console.log("✅ Loaded all employee IDs for Admin/Super Admin:", ids.length);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
      SELECT 
        u.first_name || ' ' || u.last_name AS employee_name,
        c.company_name,
        p.project_category AS project_name,
        '' AS project_type,
        t.sub_assignment AS work_area,
        t.sub_assignment_segment_1 AS task_area,
        t.ticket_num,
        t.entry_date,
        t.task_hours AS total_hours
      FROM (
        SELECT 
          odt.emp_id,
          odt.sow_id,
          odt.ticket_num,
          odt.sub_assignment,
          odt.sub_assignment_segment_1,
          (odt.period_start_date + i * INTERVAL '1 day')::date AS entry_date,
          CASE
            WHEN i = 0 THEN odt.monday_hours
            WHEN i = 1 THEN odt.tuesday_hours
            WHEN i = 2 THEN odt.wednesday_hours
            WHEN i = 3 THEN odt.thursday_hours
            WHEN i = 4 THEN odt.friday_hours
            WHEN i = 5 THEN odt.saturday_hours
            WHEN i = 6 THEN odt.sunday_hours
          END AS task_hours
        FROM kash_operations_timesheet_table odt
        CROSS JOIN generate_series(0, 6) AS i
        WHERE (odt.period_start_date + i * INTERVAL '1 day')::date BETWEEN $1 AND $2
      ) t
      JOIN kash_operations_user_table u ON u.emp_id = t.emp_id
      JOIN kash_operations_created_projects_table p ON p.sow_id = t.sow_id
      JOIN kash_operations_company_table c ON c.company_id = p.company_id
      ${whereClause}
      AND t.task_hours > 0
      ORDER BY t.entry_date ASC, employee_name ASC
    `;

    const result = await db.query(query, values);
    console.log("✅ Rows fetched from DB:", result.rows.length);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching Hours Report", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});



export default router;

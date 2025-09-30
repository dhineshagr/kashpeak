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
router.post("/add-batch", authenticateToken, async (req, res) => { // Change this so that for non-billable timesheet entries, we default sow_id to NULL 
  const { entries } = req.body;

  console.log("➡️ Received entries to add:", entries?.length || 0, "of length", entries?.length || 0);
  console.log("Received entries full data:", JSON.stringify(entries));

  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ message: "No entries provided" });
  }

  try {
    for (const entry of entries) {
      const { emp_id, sow_id, period_start_date } = entry;

      if (!emp_id || !period_start_date) {
        console.warn("⛔ Skipping invalid entry:", entry);
        continue;
      }

      /*
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
      */

      // 🔁 Insert if new, if no sow_id skip this and just insert the record, this means there's a non-billable reason. If there is a sow_id that means its a client-time non-billable item.
      await db.query(
        `INSERT INTO kash_operations_timesheet_table (
          emp_id,
          sow_id, 
          period_start_date, 
          billable, 
          non_billable_reason, 
          non_billable_reason_uuid,
          ticket_num,
          monday_hours, tuesday_hours, wednesday_hours, thursday_hours, friday_hours,
          saturday_hours, sunday_hours, sub_assignment,
          sub_assignment_segment_1, sub_assignment_segment_2, timesheet_status_entry
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11,
          $12, $13, $14,
          $15, $16, $17, $18
        )`,
        [
          emp_id,
          sow_id,
          period_start_date,
          entry.billable,
          entry.non_billable_reason,
          entry.non_billable_reason_uuid,
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

    console.log("✅ Batch insert completed for entries:", entries.length);
    console.log("Entries data:", JSON.stringify(entries));

    res.status(200).json({ message: "✅ Timesheet batch saved. Duplicates skipped." });
  } catch (err) {
    console.error("❌ Insert error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Update Timesheet Entries
router.put("/update-entry", authenticateToken, async (req, res) => {
  const { entries } = req.body;


  console.log("\n➡️ Received entries to update:", JSON.stringify(entries) || 0, "of length", entries?.length || 0);

  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ message: "No entries to update" });
  }

  try {
    // Do not short-circuit on one failure—collect per-row outcome
    const results = await Promise.allSettled(
      entries.map((entry) => {
        
        if (!entry.timesheet_entry_id) {
          throw new Error("Missing timesheet_entry_id on update entry");
        }

        // If you want an extra safety rail, also require emp_id to match:
        const useEmpGuard = true;

        const sql = `
          UPDATE kash_operations_timesheet_table SET
            billable = $1,
            non_billable_reason = $2,
            ticket_num = $3,
            monday_hours = $4,
            tuesday_hours = $5,
            wednesday_hours = $6,
            thursday_hours = $7,
            friday_hours = $8,
            saturday_hours = $9,
            sunday_hours = $10,
            sub_assignment = $11,
            sub_assignment_segment_1 = $12,
            sub_assignment_segment_2 = $13,
            timesheet_status_entry = $14
          WHERE timesheet_entry_id = $15
          ${useEmpGuard ? "AND emp_id = $16" : ""}
          RETURNING timesheet_entry_id
        `;

        const params = [
          entry.billable,
          entry.non_billable_reason ?? null,
          entry.ticket_num ?? null,
          parseNumber(entry.monday_hours),
          parseNumber(entry.tuesday_hours),
          parseNumber(entry.wednesday_hours),
          parseNumber(entry.thursday_hours),
          parseNumber(entry.friday_hours),
          parseNumber(entry.saturday_hours),
          parseNumber(entry.sunday_hours),
          entry.sub_assignment ?? null,
          entry.sub_assignment_segment_1 ?? null,
          entry.sub_assignment_segment_2 ?? null,
          entry.timesheet_status_entry ?? "Submitted",
          entry.timesheet_entry_id,
          ...(useEmpGuard ? [entry.emp_id] : []),
        ];

        return db.query(sql, params);
      })
    );

    const updated = [];
    const failed = [];

    results.forEach((r, i) => {
      const id = entries[i]?.timesheet_entry_id;
      if (r.status === "fulfilled") {
        if (r.value.rowCount === 0) {
          failed.push({ id, reason: "not found or emp_id mismatch" });
        } else {
          updated.push(r.value.rows[0].timesheet_entry_id);
        }
      } else {
        failed.push({ id, reason: r.reason?.message || String(r.reason) });
      }
    });
    
    console.log(`✅ Updated entries: ${updated.length}`, updated);

    if (failed.length > 0) {
      console.warn(`⚠️ Failed to update entries: ${failed.length}`, failed);
    }

    return res.status(200).json({ message: "Timesheet entries updated successfully" });
    
  } catch (err) {
    console.error("Update error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ✅ Delete Timesheet Entry by ID
router.delete("/delete-entry-by-id/:entryId", authenticateToken, async (req, res) => {
  const { entryId } = req.params;

  console.log("➡️ Deleting entryId:", entryId);

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
router.get("/companies", authenticateToken, async (req, res) => { // Returns based on billable, if non-billable, returns NB1001 only
  const empId = req.user?.emp_id;
  // console.log("Getting companies for emp_id:", empId);

  const { billable } = req.query;

  if (billable === undefined) {
    return res.status(400).json({ error: "Missing billable query param" });
  }

  const isBillable = billable === "true";

  try {
    // Get user role (still useful for Basic check)
    const roleQuery = await db.query(
      "SELECT admin_level FROM kash_operations_user_table WHERE emp_id = $1",
      [empId]
    );
    const adminLevel = roleQuery.rows[0]?.admin_level || "Basic";

    let result;

    if (adminLevel === "Super Admin" || adminLevel === "Admin") {
      // ✅ Both see all companies
      result = await db.query(
        `
        SELECT company_id, company_name
        FROM public.kash_operations_company_table
        WHERE COALESCE(is_billable, false) = $1
        ORDER BY company_name
        `,
        [isBillable]
      );
    } else {
      // Basic (or any other role) → no companies
      result = { rows: [] };
    }

    /*
    console.log(
      `Companies fetched (role=${adminLevel}, billable=${isBillable}):`,
      JSON.stringify(result.rows)
    );
    */

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching companies by billable state:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Get Non-Billable Reasons
router.get("/non-billable-reasons", authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `
      SELECT uuid, non_billable_reason
      FROM public.kash_operations_non_billable_reasons
      ORDER BY non_billable_reason
      `
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching non-billable reasons:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET TIMSHEET DATA STARTS HERE

// ✅ Get Timesheet Report by Week with Filters
router.get("/weekly-report", authenticateToken, async (req, res) => { // Used by Weekly Report
  const empId = req.user?.emp_id;
  const { startDate, endDate, clients, projects, employees, billable } = req.query;

  // console.log("Received weekly report params:", { startDate, endDate, clients, projects, employees, billable });

  try {
    // 1. Get user role
    const roleQuery = await db.query(
      "SELECT admin_level FROM kash_operations_user_table WHERE emp_id = $1",
      [empId]
    );
    const adminLevel = roleQuery.rows[0]?.admin_level || "Basic";

    // if the record from the timesheet_table has no sow_id, that means its a non-billable entry. Entries can non-billable and have an sow_id if its a client-time non-billable entry

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
    `;

    const conditions = [];
    const values = [];

    // 2. Role-based company restriction
    if (adminLevel === "Admin") {
      query += `
        JOIN kash_operations_company_admin_role_table a 
          ON c.company_id = a.company_id
      `;
      conditions.push(`a.emp_id = $${values.length + 1}`);
      values.push(empId);
    } else if (adminLevel === "Basic") {
      // Option A: Restrict to no companies
      return res.json([]);
    }

    // 3. Dynamic filters
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

    // 4. Apply WHERE conditions
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY t.period_start_date DESC`;

    // 5. Run query
    const result = await db.query(query, values);

    // console.log("\n✅ Weekly Report rows fetched:", result.rows.length);
    // console.log("Rows fetched:", JSON.stringify(result.rows));

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching report data:", err);
    res.status(500).json({ error: "Failed to fetch report data" });
  }
});

// ✅ Get Timesheet Report by Daily with Filters
router.get("/daily-report", authenticateToken, async (req, res) => {
  const empId = req.user?.emp_id;
  const { startDate, endDate, clients, projects, employees, billable } = req.query;

  // console.log("Received daily report params:", { startDate, endDate, clients, projects, employees, billable });

  try {
    // 1) Get role
    const roleQuery = await db.query(
      "SELECT admin_level FROM public.kash_operations_user_table WHERE emp_id = $1",
      [empId]
    );
    const adminLevel = roleQuery.rows[0]?.admin_level || "Basic";

    // 2) Base query
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
      FROM public.kash_operations_timesheet_table t
      JOIN public.kash_operations_user_table u ON t.emp_id = u.emp_id
      JOIN public.kash_operations_created_projects_table p ON t.sow_id = p.sow_id
      JOIN public.kash_operations_company_table c ON p.company_id = c.company_id
    `;

    const conditions = [];
    const values = [];

    // 3) Role-based restriction
    if (adminLevel === "Admin") {
      query += `
        JOIN public.kash_operations_company_admin_role_table a
          ON a.company_id = c.company_id
      `;
      conditions.push(`a.emp_id = $${values.length + 1}`);
      values.push(empId);
    } else if (adminLevel === "Basic") {
      // return [] since Basic should see nothing
      return res.json([]);
    }
    // Super Admin: no extra restriction

    // 4) Date window (expand ±6 days as you had)
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const adjustedStart = new Date(start); adjustedStart.setDate(start.getDate() - 6);
      const adjustedEnd = new Date(end); adjustedEnd.setDate(end.getDate() + 6);

      const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
      const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

      const formattedStart = fmt(adjustedStart);
      const formattedEnd = fmt(adjustedEnd);

      conditions.push(`t.period_start_date BETWEEN $${values.length + 1} AND $${values.length + 2}`);
      values.push(formattedStart, formattedEnd);
    }

    // 5) Other filters
    // clients
    const clientArray = clients ? clients.split(",").map(s => s.trim().toLowerCase()).filter(Boolean) : [];
    if (clientArray.length) {
      conditions.push(`LOWER(BTRIM(c.company_name)) = ANY($${values.length + 1}::text[])`);
      values.push(clientArray);
    }

    // employees (already LOWER on left in your weekly route — keep consistent)


    const projectArray = projects
      ? projects.split(",").map(s => s.trim().toLowerCase()).filter(Boolean)
      : [];

    if (projectArray.length) {
      conditions.push(`LOWER(BTRIM(p.project_category)) = ANY($${values.length + 1}::text[])`);
      values.push(projectArray);
    }


    if (employees) {
      const empArray = employees.split(",").map(s => s.trim()).filter(Boolean);
      if (empArray.length) {
        conditions.push(`(u.first_name || ' ' || u.last_name) = ANY($${values.length + 1})`);
        values.push(empArray);
      }
    }

    if (billable !== undefined) {
      const isBillable = `${billable}`.trim().toLowerCase() === "true";
      conditions.push(`t.billable = $${values.length + 1}`);
      values.push(isBillable);
    }

    // 6) WHERE + ORDER
    if (conditions.length > 0) query += ` WHERE ${conditions.join(" AND ")}`;
    query += ` ORDER BY t.period_start_date DESC`;

    // 7) Execute
    const result = await db.query(query, values);

    // console.log("\n✅ Daily Report rows fetched:", result.rows.length);
    // console.log("Rows fetched:", JSON.stringify(result.rows));

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching daily report data:", err);
    res.status(500).json({ error: "Failed to fetch report data" });
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
         p.company_id,   
         c.company_name 
       FROM kash_operations_timesheet_table t
       LEFT JOIN kash_operations_created_projects_table p ON t.sow_id = p.sow_id
       LEFT JOIN kash_operations_company_table c ON p.company_id = c.company_id
       WHERE t.emp_id = $1 AND t.period_start_date = $2`,
      [empId, weekStartDate]
    );

    console.log(`\n✅ Fetched ${result.rows.length} timesheet entries for empId=${empId}, weekStartDate=${weekStartDate}`);
    console.log("Entries fetched:", JSON.stringify(result.rows));


    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching timesheet by week:", err);
    res.status(500).json({ error: "Failed to load timesheet" });
  }
});

// GET TIMSHEET DATA ENDS HERE





// I have no idea what the below routes are doing here, but leaving them for now

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

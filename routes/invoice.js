import express from "express";
import db from "../db/index.js";
import { authenticateToken } from "./auth.js";

const router = express.Router();

/**
 * ✅ GET /api/invoices/companies
 * Returns all company records (id + name)
 */
// ✅ Get all companies
router.get("/companies", authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT company_id, company_name FROM kash_operations_company_table ORDER BY company_name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching companies:", err);
    res.status(500).json({ error: "Failed to fetch companies" });
  }
});


/**
 * ✅ GET /api/invoices/projects/company/:companyId
 * Returns all projects (sow_id + project_name) under a given company
 */
router.get("/projects/company/:companyId", authenticateToken, async (req, res) => {
  const { companyId } = req.params;

  try {
    const result = await db.query(
      `SELECT 
          sow_id, 
          project_category AS project_name
       FROM kash_operations_created_projects_table 
       WHERE company_id = $1
       ORDER BY project_category ASC`,
      [companyId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching projects:", err);
    res.status(500).json({ error: "Failed to fetch projects" });
  }
});

// ✅ Fetch all invoices with company and project info to load the grid.
router.get("/", authenticateToken, async (req, res) => {
  try {
    const query = `
    SELECT
      i.invoice_id,
      i.invoice_num,
      i.company_id,
      c.company_name,
      i.invoice_period_start,
      i.invoice_period_end,
      i.due_date,
      i.tax_rate,
      COALESCE(STRING_AGG(DISTINCT p.project_category, ', '), '—') AS project_name,
      COALESCE(i.grand_total, 0) AS grand_total
    FROM kash_operations_invoice_table i
    LEFT JOIN kash_operations_company_table c ON i.company_id = c.company_id
    LEFT JOIN kash_operations_invoice_detail_table d ON i.invoice_id = d.invoice_id
    LEFT JOIN kash_operations_created_projects_table p ON LOWER(d.sow_id) = LOWER(p.sow_id)
    GROUP BY
      i.invoice_id, i.invoice_num, i.company_id, c.company_name,
      i.invoice_period_start, i.invoice_period_end, i.due_date,
      i.grand_total
    ORDER BY i.invoice_id DESC;
  `;

    const result = await db.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching invoices:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ Get timesheet invoice data for selected projects & date range (with project name)
router.get("/timesheet/invoice-data", authenticateToken, async (req, res) => {
  const { companyId, projectIds, startDate, endDate } = req.query;

  if (!projectIds || !startDate || !endDate) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  const sowIdArray = projectIds.split(",");

  try {
    const result = await db.query(
      `
SELECT 
  v.emp_id,
  u.first_name,
  u.last_name,
  r.role_name AS role,
  v.sow_id,
  cp.project_category AS project_name,
  v.sub_assignment AS work_area,
  v.sub_assignment_segment_1 AS task_area,
  SUM(v.task_hours) AS hours,
  pe.rate  -- ✅ NEW: pull rate from assignment table
FROM v_kash_operations_timesheet_table_date v
JOIN kash_operations_user_table u ON v.emp_id = u.emp_id
JOIN kash_operations_project_employee_table pe ON pe.emp_id = u.emp_id AND pe.sow_id = v.sow_id
JOIN kash_operations_roles_table r ON pe.role_id = r.role_id
LEFT JOIN kash_operations_created_projects_table cp ON cp.sow_id = v.sow_id
WHERE v.sow_id = ANY($1)
  AND v.entry_date BETWEEN $2 AND $3
GROUP BY 
  v.emp_id, u.first_name, u.last_name, r.role_name, v.sow_id,
  v.sub_assignment, v.sub_assignment_segment_1,
  cp.project_category, pe.rate -- ✅ Add pe.rate to GROUP BY
ORDER BY v.sow_id, u.first_name;


      `,
      [sowIdArray, startDate, endDate]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Failed to load timesheet invoice data:", err);
    res.status(500).json({ error: "Failed to load timesheet invoice data" });
  }
});

// Save invoice
router.post("/", authenticateToken, async (req, res) => {
  const client = await db.connect(); // ✅ use 'db' instead of 'pool'

  try {
    const {
      company_id,
      attention_to,
      invoice_num,
      invoice_period_start,
      invoice_period_end,
      due_date,
      tax_rate,
      internal_notes,
      external_notes,
      grand_total,
      details = [],
    } = req.body;

    const created_by = req.user?.emp_id;

    if (!created_by) {
      return res.status(401).json({ error: "Missing creator user ID" });
    }

    await client.query("BEGIN");

    const invoiceRes = await client.query(
      `INSERT INTO kash_operations_invoice_table 
        (company_id, created_by, attention_to, invoice_num, invoice_period_start, invoice_period_end, due_date, tax_rate, internal_notes, external_notes, grand_total, creation_date) 
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW()) 
       RETURNING invoice_id`,
      [
        company_id || null,
        created_by,
        attention_to || null,
        invoice_num || null,
        invoice_period_start || null,
        invoice_period_end || null,
        due_date || null,
        parseFloat(tax_rate) || 0,
        internal_notes || "",
        external_notes || "",
        parseFloat(grand_total) || 0,
      ]
    );

    const invoice_id = invoiceRes.rows[0].invoice_id;

    for (const detail of details) {
      const {
        emp_id,
        rate,
        total_hrs,
        amount,
        resource_role,
        sub_assignment_title,
        sub_assignment_segment_1,
        sow_id,
      } = detail;

      if (!emp_id || !sow_id || isNaN(rate) || isNaN(total_hrs)) {
        console.warn("⚠️ Skipping invoice detail row due to invalid data:", detail);
        continue;
      }

      await client.query(
        `INSERT INTO kash_operations_invoice_detail_table 
         (invoice_id, emp_id, rate, total_hrs, amount, resource_role, sub_assignment_title, sub_assignment_segment_1, sow_id) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          invoice_id,
          parseInt(emp_id),
          parseFloat(rate),
          parseFloat(total_hrs),
          parseFloat(amount) || 0,
          resource_role || null,
          sub_assignment_title || null,
          sub_assignment_segment_1 || null,
          sow_id,
        ]
      );
    }

    await client.query("COMMIT");
    res.status(200).json({ message: "Invoice saved", invoice_id });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Error saving invoice:", error);
    res.status(500).json({ error: "Failed to save invoice" });
  } finally {
    client.release();
  }
});


// ✅ Delete invoice
router.delete("/:invoiceId", authenticateToken, async (req, res) => {
  const { invoiceId } = req.params;
  try {
    await db.query(
      `DELETE FROM kash_operations_invoice_detail_table WHERE invoice_id = $1`,
      [invoiceId]
    );

    await db.query(
      `DELETE FROM kash_operations_invoice_table WHERE invoice_id = $1`,
      [invoiceId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting invoice:", err);
    res.status(500).json({ error: "Failed to delete invoice" });
  }
});

// ✅ Get invoice detail lines by invoice ID
router.get("/:invoiceId/details", authenticateToken, async (req, res) => {
  const { invoiceId } = req.params;
  try {
    const result = await db.query(
      `SELECT 
         d.emp_id, d.rate, d.total_hrs AS hours, d.amount, d.sow_id,
         d.resource_role AS role, d.sub_assignment_title AS work_area,
         d.sub_assignment_segment_1 AS task_area,
         cp.project_category AS project_name,
         u.first_name, u.last_name
       FROM kash_operations_invoice_detail_table d
       LEFT JOIN kash_operations_created_projects_table cp ON d.sow_id = cp.sow_id
       LEFT JOIN kash_operations_user_table u ON d.emp_id = u.emp_id
       WHERE d.invoice_id = $1`,
      [invoiceId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching invoice details:", err);
    res.status(500).json({ error: "Failed to fetch invoice details" });
  }
});

// ✅ Update invoice
router.put("/:invoiceId", authenticateToken, async (req, res) => {
  const client = await db.connect();
  const { invoiceId } = req.params;
  const {
    company_id,
    invoice_period_start,
    invoice_period_end,
    due_date,
    tax_rate,
    grand_total,
    invoice_num, // ✅ Added
    details = [],
  } = req.body;

  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE kash_operations_invoice_table
       SET company_id = $1,
           invoice_period_start = $2,
           invoice_period_end = $3,
           due_date = $4,
           tax_rate = $5,
           grand_total = $6,
           invoice_num = $7
       WHERE invoice_id = $8`,
      [
        company_id,
        invoice_period_start,
        invoice_period_end,
        due_date,
        parseFloat(tax_rate),
        parseFloat(grand_total),
        invoice_num,      // ✅ Make sure frontend sends this
        invoiceId
      ]
    );

    // Delete previous invoice detail rows
    await client.query(
      `DELETE FROM kash_operations_invoice_detail_table WHERE invoice_id = $1`,
      [invoiceId]
    );

    // Insert updated invoice details
    for (const detail of details) {
      const {
        emp_id,
        rate,
        total_hrs,
        amount,
        resource_role,
        sub_assignment_title,
        sub_assignment_segment_1,
        sow_id,
      } = detail;

      await client.query(
        `INSERT INTO kash_operations_invoice_detail_table 
         (invoice_id, emp_id, rate, total_hrs, amount, resource_role, sub_assignment_title, sub_assignment_segment_1, sow_id) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          invoiceId,
          parseInt(emp_id),
          parseFloat(rate),
          parseFloat(total_hrs),
          parseFloat(amount),
          resource_role,
          sub_assignment_title,
          sub_assignment_segment_1,
          sow_id,
        ]
      );
    }

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error updating invoice:", err);
    res.status(500).json({ error: "Failed to update invoice" });
  } finally {
    client.release();
  }
});


export default router;

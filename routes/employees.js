import express from "express";
import db from "../db/index.js";
import { authenticateToken } from "./auth.js";

const router = express.Router();

/**
 * GET /api/employees
 * Returns either all employees (Admin roles) or current user (Basic)
 */
// routes/employee.js
router.get("/allemployees", authenticateToken, async (req, res) => {
  try {
    const { emp_id, role } = req.user;

    const result = await db.query(
      role === "Basic"
        ? `SELECT emp_id, first_name, last_name FROM kash_operations_user_table WHERE emp_id = $1`
        : `SELECT emp_id, first_name, last_name FROM kash_operations_user_table`,
      role === "Basic" ? [emp_id] : []
    );

    const formatted = result.rows.map((e) => ({
      emp_id: e.emp_id,
      first_name: e.first_name,
      last_name: e.last_name,
      full_name: `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim(),
    }));

    res.json(formatted);
  } catch (err) {
    console.error("Fetch employees error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});



/**
 * GET /api/employees/all
 * Returns full employee details for ManageEmployees page
 */
router.get("/", authenticateToken, async (req, res) => {
  try {
    // Step 1: Fetch basic employee details
    const employeeRes = await db.query(`
      SELECT 
        emp_id, first_name, middle_name, last_name,
        kash_operations_usn, admin_level, employee_status,
        employee_type, email_address, phone_number,
        employee_address, employee_address_line2,
        emp_location_city, emp_location_state,
        emp_location_country, employee_zip_code
      FROM kash_operations_user_table
    `);

    const employees = employeeRes.rows;

    // Step 2: Fetch assigned clients
    const clientsRes = await db.query(`
      SELECT 
        car.emp_id,
        c.company_id,
        c.company_name
      FROM kash_operations_company_admin_role_table car
      JOIN kash_operations_company_table c ON car.company_id = c.company_id
    `);

    const clientMap = {};
    for (const row of clientsRes.rows) {
      if (!clientMap[row.emp_id]) clientMap[row.emp_id] = [];
      clientMap[row.emp_id].push({ company_id: row.company_id, company_name: row.company_name });
    }

    // Step 3: Fetch assigned projects
    const projectsRes = await db.query(`
      SELECT 
        pe.emp_id,
        cp.project_category,
        c.company_id,
        c.company_name
      FROM kash_operations_project_employee_table pe
      JOIN kash_operations_created_projects_table cp ON pe.sow_id = cp.sow_id
      JOIN kash_operations_company_table c ON cp.company_id = c.company_id
    `);

    const projectMap = {};
    for (const row of projectsRes.rows) {
      if (!projectMap[row.emp_id]) projectMap[row.emp_id] = [];
      projectMap[row.emp_id].push({
        project_category: row.project_category,
        company_id: row.company_id,
        company_name: row.company_name
      });
    }

    // Step 4: Merge results
    const enriched = employees.map(emp => ({
      ...emp,
      assigned_clients: clientMap[emp.emp_id] || [],
      assigned_projects: projectMap[emp.emp_id] || []
    }));

    res.json(enriched);
  } catch (err) {
    console.error("Error fetching enriched employee data:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * POST /api/employees
 * Insert new employee
 */
router.post("/", authenticateToken, async (req, res) => {
  const fields = req.body;

  try {
    // 🔧 Step 1: Auto-generate emp_id (e.g., EMP-123456)
    let generatedEmpId = `EMP-${Date.now().toString().slice(-6)}`;

    // 🔄 Optional Safety: Check for collision (very unlikely)
    const checkResult = await db.query(
      "SELECT emp_id FROM kash_operations_user_table WHERE emp_id = $1",
      [generatedEmpId]
    );

    if (checkResult.rows.length > 0) {
      return res.status(400).json({ error: "Generated Employee ID already exists. Please retry." });
    }

    // 🧠 Step 2: Prepare insert query
    const insertQuery = `
      INSERT INTO kash_operations_user_table (
        emp_id, first_name, middle_name, last_name,
        kash_operations_usn, admin_level, employee_status,
        employee_type, email_address, phone_number,
        employee_address, employee_address_line2,
        emp_location_city, emp_location_state,
        emp_location_country, employee_zip_code
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7,
        $8, $9, $10,
        $11, $12,
        $13, $14,
        $15, $16
      ) RETURNING *
    `;

    console.log("Inserting values:", values);
    const values = [
      generatedEmpId,
      fields.first_name,
      fields.middle_name || "",
      fields.last_name,
      fields.kash_operations_usn,
      fields.admin_level,
      fields.employee_status,
      fields.employee_type,
      fields.email_address,
      fields.phone_number,
      fields.employee_address,
      fields.employee_address_line2 || "",
      fields.emp_location_city,
      fields.emp_location_state,
      fields.emp_location_country,
      fields.employee_zip_code
    ];

    const result = await db.query(insertQuery, values);

    console.log("✅ New employee added with ID:", generatedEmpId);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error inserting employee:", err.message, err.stack);
    res.status(500).json({ error: "Failed to insert employee" });
  }
});


/**
 * PUT /api/employees/:id
 */
router.put("/:id", authenticateToken, async (req, res) => {
  const emp_id = req.params.id;
  const {
    first_name, middle_name, last_name,
    kash_operations_usn, admin_level, employee_status,
    employee_type, email_address, phone_number,
    employee_address, employee_address_line2,
    emp_location_city, emp_location_state,
    emp_location_country, employee_zip_code
  } = req.body;

  try {
    const result = await db.query(
      `
      UPDATE kash_operations_user_table SET
        first_name = $1,
        middle_name = $2,
        last_name = $3,
        kash_operations_usn = $4,
        admin_level = $5,
        employee_status = $6,
        employee_type = $7,
        email_address = $8,
        phone_number = $9,
        employee_address = $10,
        employee_address_line2 = $11,
        emp_location_city = $12,
        emp_location_state = $13,
        emp_location_country = $14,
        employee_zip_code = $15
      WHERE emp_id = $16
      RETURNING *
      `,
      [
        first_name,
        middle_name,
        last_name,
        kash_operations_usn,
        admin_level,
        employee_status,
        employee_type,
        email_address,
        phone_number,
        employee_address,
        employee_address_line2,
        emp_location_city,
        emp_location_state,
        emp_location_country,
        employee_zip_code,
        emp_id
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error updating employee", err);
    res.status(500).json({ error: "Update failed" });
  }
});

/**
 * DELETE /api/employees/:id
 */
router.delete("/:id", authenticateToken, async (req, res) => {
  const id = req.params.id;
  try {
    await db.query("DELETE FROM kash_operations_user_table WHERE emp_id = $1", [id]);
    res.json({ message: "Employee deleted" });
  } catch (err) {
    console.error("Error deleting employee", err);
    res.status(500).json({ error: "Delete failed" });
  }
});

export default router;

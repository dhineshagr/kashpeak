import express from "express";
import db from "../db/index.js";
import { authenticateToken } from "./auth.js";

const router = express.Router();

// ✅ GET all employees
router.get("/", authenticateToken, async (req, res) => {
    try {
        const result = await db.query(`
      SELECT 
        emp_id, first_name, middle_name, last_name,
        kash_operations_usn, admin_level, employee_status,
        employee_type, email_address, phone_number,
        employee_address, employee_address_line2,
        emp_location_city, emp_location_state,
        emp_location_country, employee_zip_code
      FROM kash_operations_user_table
    `);
        res.json(result.rows);
    } catch (err) {
        console.error("Error fetching employees", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ✅ PUT /api/employees/:id - update employee
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

// ✅ DELETE /api/employees/:id
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

// POST /api/employees
// POST /api/employees
router.post("/", authenticateToken, async (req, res) => {
    const fields = req.body;
  
    try {
      // Check if emp_id already exists
      const checkResult = await db.query(
        "SELECT emp_id FROM kash_operations_user_table WHERE emp_id = $1",
        [fields.emp_id]
      );
  
      if (checkResult.rows.length > 0) {
        return res.status(400).json({ error: "Employee ID already exists" });
      }
  
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
  
      const values = [
        fields.emp_id, fields.first_name, fields.middle_name || "", fields.last_name,
        fields.kash_operations_usn, fields.admin_level, fields.employee_status,
        fields.employee_type, fields.email_address, fields.phone_number,
        fields.employee_address, fields.employee_address_line2 || "",
        fields.emp_location_city, fields.emp_location_state,
        fields.emp_location_country, fields.employee_zip_code
      ];
  
      const result = await db.query(insertQuery, values);
      res.status(201).json(result.rows[0]);
  
    } catch (err) {
      console.error("Error inserting employee:", err);
      res.status(500).json({ error: "Failed to insert employee" });
    }
  });
  
  
  

export default router;

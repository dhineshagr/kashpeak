import express from "express";
import db from "../db/index.js";
import { authenticateToken } from "./auth.js";

const router = express.Router();

// GET /api/admins/employees — return only Admin and Super Admin
router.get("/employees", authenticateToken, async (req, res) => {
    try {
        const result = await db.query(`
        SELECT emp_id, kash_operations_usn, first_name, last_name, admin_level
        FROM kash_operations_user_table
        WHERE admin_level IN ('Admin', 'Super Admin')
      `);

        const employees = result.rows.map(emp => ({
            emp_id: emp.emp_id,
            kash_operations_usn: emp.kash_operations_usn,
            full_name: `${emp.first_name || ""} ${emp.last_name || ""}`.trim(),
            role: emp.admin_level
        }));

        res.json(employees);
    } catch (err) {
        console.error("❌ Failed to fetch employees", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


// ✅ GET all admins for a specific company using admin_level from user table
router.get("/company/:companyId", authenticateToken, async (req, res) => {
    const { companyId } = req.params;
    try {
        const result = await db.query(
            `SELECT 
           a.kash_operations_usn,
           COALESCE(u.first_name || ' ' || u.last_name, a.kash_operations_usn) AS full_name,
           u.admin_level AS role
         FROM kash_operations_company_admin_role_table a
         LEFT JOIN kash_operations_user_table u
           ON a.kash_operations_usn = u.kash_operations_usn
         WHERE a.company_id = $1`,
            [companyId]
        );

        res.json(result.rows);
    } catch (err) {
        console.error("❌ Failed to fetch admins", err);
        res.status(500).json({ error: "Failed to fetch admins" });
    }
});


// ✅ DELETE admin
router.delete("/company/:companyId/:username", authenticateToken, async (req, res) => {
    const { companyId, username } = req.params;
    try {
        await db.query(
            `DELETE FROM kash_operations_company_admin_role_table WHERE company_id = $1 AND kash_operations_usn = $2`,
            [companyId, username]
        );
        res.json({ message: "Admin removed successfully" });
    } catch (err) {
        console.error("❌ Failed to delete admin", err);
        res.status(500).json({ error: "Failed to delete admin" });
    }
});

// GET /api/admins/all-admins
router.get("/all-admins", authenticateToken, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
              car.company_id,
              car.kash_operations_usn,
              COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '') AS full_name,
              u.admin_level
            FROM kash_operations_company_admin_role_table car
            LEFT JOIN kash_operations_user_table u 
              ON car.kash_operations_usn = u.kash_operations_usn
            WHERE u.admin_level IN ('Admin', 'Super Admin') -- ✅ add filter
        `);

        res.json(result.rows);
    } catch (err) {
        console.error("❌ Failed to fetch all company admins:", err);
        res.status(500).json({ error: "Failed to fetch all admins" });
    }
});


// ✅ Add a new admin to a company using admin_level from user table
router.post("/company/add", authenticateToken, async (req, res) => {
    console.log("✅ POST /company/add called");
    const { companyId, username } = req.body;

    if (!companyId || !username) {
        return res.status(400).json({ error: "Missing companyId or username" });
    }

    try {
        // Get emp_id and role from user table
        const userRes = await db.query(
            `SELECT emp_id, admin_level FROM kash_operations_user_table WHERE kash_operations_usn = $1`,
            [username]
        );

        if (userRes.rowCount === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        const { emp_id, admin_level } = userRes.rows[0];

        const insertResult = await db.query(
            `INSERT INTO kash_operations_company_admin_role_table (company_id, kash_operations_usn, emp_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (company_id, kash_operations_usn) DO NOTHING
             RETURNING *`,
            [companyId, username, emp_id]
        );

        if (insertResult.rowCount > 0) {
            console.log("✅ Inserted admin record:", insertResult.rows[0]);
        } else {
            console.log("⚠️ Insert skipped: admin already exists for this company.");
        }


        res.json({ success: true, role: admin_level || "Admin", message: "✅ Admin added successfully" });
    } catch (err) {
        console.error("❌ Failed to add admin", err);
        res.status(500).json({ error: "Failed to add admin" });
    }
});



export default router;

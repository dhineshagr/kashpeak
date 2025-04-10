import cron from 'node-cron';
import db from '../db/index.js';
import { sendBillingAlertEmail } from '../utils/emailService.js';
import dotenv from 'dotenv';
dotenv.config();

const checkBillingAndSendAlerts = async () => {
  try {
    const result = await db.query(`
      SELECT 
        u.first_name, 
        u.last_name, 
        u.emp_id, 
        SUM(
          COALESCE(t.monday_hours, 0) +
          COALESCE(t.tuesday_hours, 0) +
          COALESCE(t.wednesday_hours, 0) +
          COALESCE(t.thursday_hours, 0) +
          COALESCE(t.friday_hours, 0) +
          COALESCE(t.saturday_hours, 0) +
          COALESCE(t.sunday_hours, 0)
        ) AS total_utilized,
        p.total_projected_hours
      FROM kash_operations_timesheet_table t
      JOIN kash_operations_user_table u ON u.emp_id = t.emp_id
      JOIN kash_operations_created_projects_table p ON p.sow_id = t.sow_id
      GROUP BY u.emp_id, u.first_name, u.last_name, p.total_projected_hours
    `);

    for (const emp of result.rows) {
      const percent = ((emp.total_utilized / emp.total_projected_hours) * 100).toFixed(2);

      if (percent >= 80) {
        const fullName = `${emp.first_name} ${emp.last_name}`;
        const subject = `⚠️ ${fullName} reached ${percent}% billing`;
        const message = `Hello Lead,\n\n${fullName} has reached ${percent}% of their total assigned hours.\n\nPlease take action.\n\nThanks,\nKashTech Team`;

        await sendBillingAlertEmail(process.env.ALERT_TO_EMAIL, subject, message);

        // Log the alert
        await db.query(`
          INSERT INTO billing_alert_audit (emp_id, utilization_percent, alert_sent_at)
          VALUES ($1, $2, NOW())
        `, [emp.emp_id, percent]);
      }
    }

    console.log("📧 Billing alerts sent.");
  } catch (err) {
    console.error("❌ Cron job error:", err.message);
  }
};

// ⏰ Run every day at 9 AM
cron.schedule("0 9 * * *", checkBillingAndSendAlerts);

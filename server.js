import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import clientRoutes from "./routes/clients.js";
import authRoutes from "./routes/auth.js";
import metricRoutes from "./routes/metrics.js";
import userRoutes from "./routes/user.js";
import dashboardRoutes from "./routes/dashboard.js";
import projectDetailsRoutes from "./routes/projectDetails.js"; 
import employeeRoutes from "./routes/employees.js";
import manageClientsRoutes from "./routes/manageclients.js";
import projectRoutes from "./routes/projects.js"; // ✅ correctly plural
import timesheetRoutes from "./routes/timesheet.js";
import openaiRoutes from "./routes/openai.js";
import adminRoutes from './routes/admin.js';
import "./jobs/billingCheckJob.js"; 

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Routes
app.use("/api/clients", clientRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/metrics", metricRoutes);
app.use("/api/user", userRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/projects", projectRoutes); // ✅ manage projects (corrected)
app.use("/api/projectdetails", projectDetailsRoutes); // view single project
app.use("/api/employees", employeeRoutes);
app.use("/api/manageclients", manageClientsRoutes);
app.use("/api/timesheet", timesheetRoutes);
app.use("/api/openai", openaiRoutes);
app.use('/api/admins', adminRoutes);
// ✅ Test route
app.get("/", (req, res) => res.send("API is running!"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

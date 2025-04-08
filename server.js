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

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/clients", clientRoutes);
app.use("/api/auth", authRoutes);         // ⬅️ Login
app.use("/api/metrics", metricRoutes);    // ⬅️ Protected metrics
app.use("/api/user", userRoutes);  // ⬅️ Get user details in dashboard
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/projects", projectDetailsRoutes);
app.use("/api/employees", employeeRoutes);

app.get("/", (req, res) => res.send("API is running!"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));


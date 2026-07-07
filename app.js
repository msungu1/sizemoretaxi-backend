
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// 1. Load env variables immediately
dotenv.config(); 

import { connectDB } from "./lib/dbConnect.js";
import AuthRoutes from "./routes/auth.route.js";
import ratingRoutes from "./routes/rating.route.js";
import tripRoutes from "./routes/trip.route.js";
import adminRoute from "./routes/admin.route.js";
import feedbackRoutes from "./routes/feedback.routes.js";

const app = express();

// 2. Essential Middleware to fix that "req.body is undefined" error
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cors({
  origin: "*",
  credentials: true
}));

// 3. Routes
app.get("/", (req, res) => res.send("Sizemore Taxi API is running"));
app.use("/api/auth", AuthRoutes);
app.use("/api/ratings", ratingRoutes);
app.use("/api/trips", tripRoutes);
app.use("/api/admin", adminRoute);
app.use("/api/feedback", feedbackRoutes);
// 4. Connect to DB ONLY after everything else is set up
connectDB();

export default app;
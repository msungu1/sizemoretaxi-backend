// app.js
import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import { connectDB } from "./lib/dbConnect.js"
import AuthRoutes from "./routes/auth.route.js"
import ratingRoutes from "./routes/rating.route.js"
import tripRoutes from "./routes/trip.route.js"
import adminRoute from "./routes/admin.route.js"

dotenv.config()
connectDB()

const app = express()

app.use(express.json());

app.use(cors({
  origin: "*",
  credentials: true
}))
app.get("/", (req, res) => res.send("Sizemore Taxi API is running"));
app.use("/api/auth", AuthRoutes);
app.use("/api/auth", AuthRoutes);
app.use("/api/ratings", ratingRoutes);
app.use("/api/trips", tripRoutes);
app.use("/api/admin", adminRoute);

export default app

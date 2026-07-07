import express from "express"
import { rateDriver, getDriverRatings } from "../controllers/rating.controller.js"
const router = express.Router()

import { rateDriver } from "../controllers/rating.controller.js"
import { verifyToken } from "../middleware/verify.js"

router.post("/", verifyToken, rateDriver);
router.get("/", getDriverRatings);
export default router
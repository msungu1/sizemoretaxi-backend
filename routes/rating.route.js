import express from "express"
const router = express.Router()

import { rateDriver } from "../controllers/rating.controller.js"
import { verifyToken } from "../middleware/verify.js"

router.post("/", verifyToken, rateDriver);

export default router
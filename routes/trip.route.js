import express from "express";
import * as tripController from "../controllers/trip.controller.js";
import { verifyToken } from "../middleware/verify.js"
import { requireAdmin } from "../middleware/requireAdmin.js";

const router = express.Router();

router.post("/available", verifyToken, requireAdmin, tripController.getAvailableDrivers);
router.post("/start/:tripId", tripController.startTrip);
router.post("/complete", tripController.completeTrip);
router.post("/cancel", verifyToken, requireAdmin, tripController.cancelTrip);
router.get("/active", tripController.getActiveTrips);
router.get("/activity", tripController.getTripActivity);
router.get("/:tripId", tripController.getTripById);

// 1) user selects vehicle options after typing pickup + dropoff
router.post("/options", tripController.getTripOptions);

// 2) user selects vehicle and confirms
// router.post("/request", tripController.confirmTrip);
router.post("/confirm", tripController.confirmTrip);
router.post("/assign", verifyToken, requireAdmin, tripController.assignTrip);

router.get("/all", verifyToken, requireAdmin, tripController.getAllTrips);
// Allow riders to cancel their own requests
router.post("/cancel-rider", verifyToken, tripController.cancelTrip);
export default router;

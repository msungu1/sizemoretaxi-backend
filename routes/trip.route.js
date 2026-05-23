// import express from "express";
// import * as tripController from "../controllers/trip.controller.js";
// import { verifyToken } from "../middleware/verify.js"
// import { requireAdmin } from "../middleware/requireAdmin.js";

// const router = express.Router();

// router.post("/available", verifyToken, requireAdmin, tripController.getAvailableDrivers);
// router.post("/start/:tripId",verifyToken, tripController.startTrip);
// router.post("/complete",verifyToken, tripController.completeTrip);
// router.post("/cancel", verifyToken, requireAdmin, tripController.cancelTrip);
// router.get("/active", verifyToken,tripController.getActiveTrips);
// router.get("/activity", verifyToken,tripController.getTripActivity);
// router.get("/:tripId", verifyToken, tripController.getTripById);

// // 1) user selects vehicle options after typing pickup + dropoff
// router.post("/options",verifyToken, tripController.getTripOptions);




// // 2) user selects vehicle and confirms
// // router.post("/request", tripController.confirmTrip);
// router.post("/confirm",verifyToken, tripController.confirmTrip);
// router.post("/assign", verifyToken, requireAdmin, tripController.assignTrip);

// router.get("/all", verifyToken, requireAdmin, tripController.getAllTrips);
// // Allow riders to cancel their own requests
// router.post("/cancel-rider", verifyToken, tripController.cancelTrip);
// export default router;

import express from "express";
import * as tripController from "../controllers/trip.controller.js";
import { verifyToken } from "../middleware/verify.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

const router = express.Router();

// ✅ SPECIFIC routes FIRST — before /:tripId wildcard

// Passenger
router.post("/options", verifyToken, tripController.getTripOptions);
router.post("/confirm", verifyToken, tripController.confirmTrip);
router.post("/cancel-rider", verifyToken, tripController.cancelTrip);
router.get("/active", verifyToken, tripController.getActiveTrips);
router.get("/activity", verifyToken, tripController.getTripActivity);

// Admin
router.get("/all", verifyToken, requireAdmin, tripController.getAllTrips);
router.get("/available", verifyToken, requireAdmin, tripController.getAvailableDrivers); // ✅ GET not POST
router.post("/accept", verifyToken, requireAdmin, tripController.acceptTripByAdmin);     // ✅ NEW
router.post("/assign", verifyToken, requireAdmin, tripController.assignTrip);
router.post("/cancel", verifyToken, requireAdmin, tripController.cancelTrip);
router.post("/decline", verifyToken, requireAdmin, tripController.declineTrip);

// Driver
router.post("/start/:tripId", verifyToken, tripController.startTrip);
router.post("/complete", verifyToken, tripController.completeTrip);

// ✅ WILDCARD LAST — must always be the last route
router.get("/:tripId", verifyToken, tripController.getTripById);

export default router;
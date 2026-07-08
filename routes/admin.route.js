import express from "express";
import {
    getAllUsers,
    getUserById,
    disableUser,
    updateUserFields,
    enableUser,
    deleteUserPermanently,
    getAllTrips,
    getTripDetailsById
    getDashboardStats,
} from "../controllers/admin.controller.js";
import { requireAdmin } from "../middleware/requireAdmin.js"
import { verifyToken } from "../middleware/verify.js"

const router = express.Router();
router.use(verifyToken, requireAdmin);
router.get("/users", getAllUsers);
router.get("/users/:id", getUserById);
router.patch("/users/:id", updateUserFields);
router.put("/users/:id/disable", disableUser);
router.put("/users/:id/enable", enableUser);
router.delete("/users/:id", deleteUserPermanently);

// TRIPS
router.get("/trips", getAllTrips);
router.get("/trips/:id", getTripDetailsById);

router.get("/dashboard/stats", getDashboardStats);
export default router;

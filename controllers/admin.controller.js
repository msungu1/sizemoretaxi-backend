import { Trip } from "../models/trip.model.js";
import { User } from "../models/user.model.js";
import { driverLocations } from "../lib/socket.js";   // add this import

// Get all users from the database
export const getAllUsers = async (req, res) => {
    try {
        const users = await User.find().select("-password"); // exclude password
        res.status(200).json({ success: true, users });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
// Get a specific user by their ID
export const getUserById = async (req, res) => {
    try {
        const { id } = req.params;

        const user = await User.findById(id).select("-password");
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        res.status(200).json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
// Update user fields (for both driver & riders)
export const updateUserFields = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Restrict driver-specific fields if user is not a driver
        const driverFields = ["carModel", "carNumber", "carType", "licenseNumber"];
        if (user.role !== "driver") {
            for (let field of driverFields) {
                if (updates.hasOwnProperty(field)) {
                    return res.status(400).json({
                        success: false,
                        message: `Only drivers can update '${field}'`
                    });
                }
            }
        }

        // Only update fields that were provided
        Object.keys(updates).forEach(key => {
            if (updates[key] !== undefined) {
                user[key] = updates[key];
            }
        });

        await user.save(); // Triggers pre-save validations

        const userWithoutPassword = user.toObject();
        delete userWithoutPassword.password;

        res.status(200).json({
            success: true,
            message: "User updated successfully",
            user: userWithoutPassword
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
// Disable an existing user
export const disableUser = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findByIdAndUpdate(
            id,
            { isBlocked: true },
            { new: true }
        ).select("-password");

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        res.status(200).json({ success: true, message: "User account disabled", user });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
export const getDashboardStats = async (req, res) => {
  try {
    const pendingBookings = await Trip.countDocuments({ status: "requested" });

    const activeRides = await Trip.countDocuments({
      status: { $in: ["assigned", "accepted", "in_progress"] }
    });

    // Real-time count from connected sockets, not a DB flag
    const onlineDrivers = driverLocations.size;

    const revenueResult = await Trip.aggregate([
      { $match: { status: "completed" } },
      { $group: { _id: null, total: { $sum: "$fare" } } }
    ]);
    const totalRevenue = revenueResult[0]?.total || 0;

    const totalTrips = await Trip.countDocuments();
    const completedTrips = await Trip.countDocuments({ status: "completed" });
    const cancelledTrips = await Trip.countDocuments({ status: "cancelled" });

    res.status(200).json({
      pendingBookings,
      activeRides,
      onlineDrivers,
      totalRevenue,
      totalTrips,
      completedTrips,
      cancelledTrips
    });
  } catch (err) {
    console.error("❌ getDashboardStats error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
// Enable a previously blocked user
export const enableUser = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findByIdAndUpdate(
            id,
            { isBlocked: false },
            { new: true }
        ).select("-password");

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        res.status(200).json({ success: true, message: "User account enabled", user });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
// Get all the trips
export const getAllTrips = async (req, res) => {
    try {
        const trips = await Trip.find()
            .populate("rider", "name")
            .populate("driver", "name")
            .sort({ createdAt: -1 });

        const simplifiedTrips = trips.map(trip => ({
            _id: trip._id,
            riderName: trip.rider?.name || "N/A",
            driverName: trip.driver?.name || "N/A",
            pickupLocation: trip.pickupLocation,
            dropoffLocation: trip.dropoffLocation,
            fare: trip.fare,
        }));

        res.status(200).json({ success: true, trips: simplifiedTrips });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
// Get a specific trip by its ID
export const getTripDetailsById = async (req, res) => {
    try {
        const { id } = req.params;

        const trip = await Trip.findById(id)
            .populate("rider", "name phone email role")
            .populate("driver", "name phone email role");

        if (!trip) {
            return res.status(404).json({ success: false, message: "Trip not found" });
        }

        const detailedTrip = {
            _id: trip._id,
            rider: trip.rider,
            driver: trip.driver,
            pickupLocation: trip.pickupLocation,
            dropoffLocation: trip.dropoffLocation,
            scheduledTime: trip.scheduledTime,
            startTime: trip.startTime,
            endTime: trip.endTime,
            status: trip.status,
            fare: trip.fare,
            ratingByRider: trip.ratingByRider,
            cancellationReason: trip.cancellationReason,
            createdAt: trip.createdAt,
            updatedAt: trip.updatedAt
        };

        res.status(200).json({ success: true, trip: detailedTrip });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
// Delete a user for good
export const deleteUserPermanently = async (req, res) => {
    try {
        const { id } = req.params;

        const deletedUser = await User.findByIdAndDelete(id).select("-password");

        if (!deletedUser) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        res.status(200).json({
            success: true,
            message: "User account permanently deleted",
            user: deletedUser,
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
// export const getAllUsers = async (req, res) => {
//     try {
//         const users = await User.find().select("-password");

//         const usersWithStatus = users.map((user) => {
//             const userObj = user.toObject();
//             if (userObj.role === "driver") {
//                 const idStr = user._id.toString();
//                 userObj.isOnline = driverLocations.has(idStr);
//                 userObj.currentLocation = driverLocations.get(idStr) || null;
//             }
//             return userObj;
//         });

//         res.status(200).json({ success: true, users: usersWithStatus });
//     } catch (err) {
//         res.status(500).json({ success: false, message: err.message });
//     }
// };
export const getOnlineDriverLocations = async (req, res) => {
    try {
        const driverIds = Array.from(driverLocations.keys());
        if (driverIds.length === 0) {
            return response(res, 200, "No drivers online.", []);
        }

        const drivers = await User.find({ _id: { $in: driverIds } })
            .select("name phone carModel carNumber");

        const result = drivers.map(d => {
            const loc = driverLocations.get(d._id.toString());
            return {
                driverId: d._id.toString(),
                name: d.name,
                phone: d.phone,
                carModel: d.carModel,
                carNumber: d.carNumber,
                lat: loc?.lat,
                lng: loc?.lng,
                heading: loc?.heading || 0,
                speed: loc?.speed || 0,
                updatedAt: loc?.updatedAt,
            };
        });

        return response(res, 200, "Online driver locations fetched.", result);
    } catch (err) {
        console.error("❌ getOnlineDriverLocations error:", err);
        return response(res, 500, "Internal server error.");
    }
};
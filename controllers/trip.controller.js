import { Trip } from "../models/trip.model.js";
import { User } from "../models/user.model.js";
import axios from "axios";
import { emitToUser, emitToAdmin } from "../lib/socket.js";
import { driverLocations } from "../lib/socket.js";
import mongoose from "mongoose";

const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY;
const MAX_NEARBY_KM = Number(process.env.MAX_NEARBY_KM || 8); // choose your radius

// --- Helper: call Distance Matrix API (returns { distanceMeters, durationSec, distanceText, durationText })
async function getDistanceAndDuration(orig, dest) {
    const origins = `${orig.lat},${orig.lng}`;
    const destinations = `${dest.lat},${dest.lng}`;

    const url = `https://maps.googleapis.com/maps/api/distancematrix/json`;
    const params = {
        origins,
        destinations,
        key: GOOGLE_MAPS_KEY,
        units: "metric"
    };

    const { data } = await axios.get(url, { params });

    if (!data || data.status !== "OK") {
        throw new Error("Distance Matrix API error");
    }

    const row = data.rows?.[0];
    const element = row?.elements?.[0];
    if (!element || element.status !== "OK") {
        throw new Error("Route not found");
    }

    return {
        distanceMeters: element.distance.value,
        durationSec: element.duration.value,
        distanceText: element.distance.text,
        durationText: element.duration.text
    };
}

const normalizeLocation = (loc) => ({
    lat: loc.lat ?? loc.latitude,
    lng: loc.lng ?? loc.longitude,
    address: loc.address ?? loc.formatted_address ?? loc.name ?? ""
})

function overlaps(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
}

function calculateFares(distanceMeters, durationSec) {
    const km = distanceMeters / 1000;
    const mins = Math.ceil(durationSec / 60);

    // Example pricing — tune to your market
    const pricing = {
        Chopper: { base: 225000, perKm: 3760, perMin: 60 },
        // comfort
        Comfort: { base: 120, perKm: 35, perMin: 5 },
        // business
        Business: { base: 200, perKm: 45, perMin: 6 },
        // premium
        Premium: { base: 300, perKm: 50, perMin: 6 },
    };

    const vehicles = Object.entries(pricing).map(([type, p]) => {
        const total =
            Math.max(p.base, p.base + (p.perKm * km) + (p.perMin * mins));
        return {
            type,
            baseFare: p.base,
            distanceKm: +km.toFixed(2),
            durationMin: mins,
            distanceFare: +(p.perKm * km).toFixed(2),
            timeFare: p.perMin * mins,
            total: Math.round(total) // round for UX
        };
    });

    return vehicles;
}

// --- Helper: haversine distance (km)
function haversineKm(a, b) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371; // Earth radius km
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);

    const sinDLat = Math.sin(dLat / 2);
    const sinDLon = Math.sin(dLon / 2);

    const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
    const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    return R * c;
}

export const getTripOptions = async (req, res) => {
    const { riderId, pickupLocation, dropoffLocation } = req.body;

    if (!riderId || !pickupLocation || !dropoffLocation) {
        return response(res, 400, "riderId, pickupLocation and dropoffLocation are required.");
    }

    try {
        // ensure rider exists
        const rider = await User.findById(riderId);
        if (!rider) return response(res, 404, "Rider not found.");

        const pickup = normalizeLocation(pickupLocation);
        const dropoff = normalizeLocation(dropoffLocation);

        // calculate distance & duration
        const route = await getDistanceAndDuration(pickupLocation, dropoffLocation);

        // calculate fares
        const vehicles = calculateFares(route.distanceMeters, route.durationSec);

        return response(res, 200, "Vehicle options generated.", {
            route,
            vehicles, // list of 4 vehicle types + pricing
            pickupLocation: pickup,
            dropoffLocation: dropoff
        });

    } catch (err) {
        console.error("getTripOptions error:", err.message);
        return response(res, 500, "Internal server error.");
    }
};
const response = (res, status, message, data = null) =>
    res.status(status).json({ status, message, data });

// export const confirmTrip = async (req, res) => {
//     try {
//         const { pickup, dropoff, vehicleType, scheduledTime, riderId } = req.body;

//         if (!pickup || !dropoff || !vehicleType || !riderId) {
//             return res.status(400).json({ message: "Missing required trip details." });
//         }

//         const normalizedPickup = normalizeLocation(pickup);
//         const normalizedDropoff = normalizeLocation(dropoff);

//         if (!normalizedPickup.address || !normalizedDropoff.address) {
//             return res.status(400).json({ message: "Valid pickup and dropoff required." });
//         }

//         // 30 min rule
//         const sched = scheduledTime ? new Date(scheduledTime) : new Date();
//         const now = new Date();

//         const diffMins = Math.floor((sched - now) / (1000 * 60));
//         if (diffMins < 30) {
//             return res.status(400).json({
//                 message: "Rides must be booked at least 30 minutes in advance."
//             });
//         }

//         const userRecord = await User.findById(riderId);
//         if (!userRecord) {
//             return res.status(404).json({ message: "Rider not found" });
//         }

//         // ✅ FIX #1: ONLY CHECK ACTIVE TRIPS (this is the real lock)
//         const activeTrip = await Trip.findOne({
//             rider: riderId,
//             status: { $in: ["requested", "assigned", "accepted", "in_progress"] }
//         });

//         if (activeTrip) {
//             return res.status(400).json({
//                 message: "You already have an active trip.",
//                 tripId: activeTrip._id
//             });
//         }

//         // route
//         let route;
//         try {
//             route = await getDistanceAndDuration(normalizedPickup, normalizedDropoff);
//         } catch (err) {
//             return res.status(500).json({ message: "Route calculation failed" });
//         }

//         const fares = calculateFares(route.distanceMeters, route.durationSec);

//         const selectedFare = fares.find(
//             f => f.type?.toLowerCase() === vehicleType?.toLowerCase()
//         );

//         if (!selectedFare) {
//             return res.status(400).json({ message: "Invalid vehicle type." });
//         }

//         // ❌ REMOVE isRiding LOCK (THIS WAS YOUR BUG SOURCE)
//         const newTrip = await Trip.create({
//             rider: riderId,
//             pickupLocation: normalizedPickup,
//             dropoffLocation: normalizedDropoff,
//             vehicleType,
//             scheduledTime: sched,
//             fare: selectedFare.total,
//             status: "requested"
//         });

//         // (optional UI flag only — NOT a blocker anymore)
//         await User.findByIdAndUpdate(riderId, {
//             isRiding: true
//         });

//         emitToAdmin("ride_requested", {
//             tripId: newTrip._id.toString(),
//             rider: {
//                 name: userRecord?.name || "Rider",
//                 phone: userRecord?.phone || ""
//             },
//             pickupLocation: normalizedPickup,
//             dropoffLocation: normalizedDropoff,
//             pickupLabel: normalizedPickup.address,
//             dropoffLabel: normalizedDropoff.address,
//             fare: `KES ${newTrip.fare}`,
//             vehicleType,
//             distance: route.distanceText,
//             duration: route.durationText,
//             scheduledTime: sched,
//         });
// emitToUser(riderId, "trip_created", {
//   tripId: newTrip._id,
// });
//         return res.status(201).json({
//             message: "Trip requested successfully",
//             trip: newTrip
//         });

//     } catch (error) {
//         console.error("❌ confirmTrip error:", error);
//         return res.status(500).json({
//             message: "Internal Server Error",
//             error: error.message
//         });
//     }
// };
export const confirmTrip = async (req, res) => {
    try {
        const { pickup, dropoff, vehicleType, scheduledTime, riderId } = req.body;

        if (!pickup || !dropoff || !vehicleType || !riderId) {
            return res.status(400).json({ message: "Missing required trip details." });
        }

        const normalizedPickup = normalizeLocation(pickup);
        const normalizedDropoff = normalizeLocation(dropoff);

        if (!normalizedPickup.address || !normalizedDropoff.address) {
            return res.status(400).json({ message: "Valid pickup and dropoff required." });
        }

        // 👇 detect the special-case vehicle type
        const isChopper = vehicleType?.toLowerCase() === "chopper";

        const sched = scheduledTime ? new Date(scheduledTime) : new Date();
        const now = new Date();
        const diffMins = Math.floor((sched - now) / (1000 * 60));
        if (diffMins < 30) {
            return res.status(400).json({
                message: "Rides must be booked at least 30 minutes in advance."
            });
        }

        const userRecord = await User.findById(riderId);
        if (!userRecord) {
            return res.status(404).json({ message: "Rider not found" });
        }

        // 👇 include "pending" here so a rider with an open Chopper request
        // can't spam more requests while it's awaiting admin contact
        const activeTrip = await Trip.findOne({
            rider: riderId,
            status: { $in: ["requested", "assigned", "accepted", "in_progress", "pending"] }
        });

        if (activeTrip) {
            return res.status(400).json({
                message: "You already have an active trip.",
                tripId: activeTrip._id
            });
        }

        let route;
        try {
            route = await getDistanceAndDuration(normalizedPickup, normalizedDropoff);
        } catch (err) {
            return res.status(500).json({ message: "Route calculation failed" });
        }

        const fares = calculateFares(route.distanceMeters, route.durationSec);
        const selectedFare = fares.find(
            f => f.type?.toLowerCase() === vehicleType?.toLowerCase()
        );

        if (!selectedFare) {
            return res.status(400).json({ message: "Invalid vehicle type." });
        }

        const newTrip = await Trip.create({
            rider: riderId,
            pickupLocation: normalizedPickup,
            dropoffLocation: normalizedDropoff,
            vehicleType,
            scheduledTime: sched,
            fare: selectedFare.total,
            status: isChopper ? "pending" : "requested"   // 👈 branch here
        });

        await User.findByIdAndUpdate(riderId, { isRiding: true });

        if (isChopper) {
            // 👇 tell admin this needs a manual follow-up call, not a driver match
            emitToAdmin("chopper_request_pending", {
                tripId: newTrip._id.toString(),
                rider: {
                    name: userRecord?.name || "Rider",
                    phone: userRecord?.phone || ""
                },
                pickupLocation: normalizedPickup,
                dropoffLocation: normalizedDropoff,
                pickupLabel: normalizedPickup.address,
                dropoffLabel: normalizedDropoff.address,
                fare: `KES ${newTrip.fare}`,
                vehicleType,
                distance: route.distanceText,
                duration: route.durationText,
                scheduledTime: sched,
            });

            // 👇 tell the rider app to render the PENDING screen
            emitToUser(riderId, "trip_pending", {
                tripId: newTrip._id,
                status: "pending",
                message: "Your Chopper request has been received. Our team will contact you shortly to confirm details."
            });
        } else {
            emitToAdmin("ride_requested", {
                tripId: newTrip._id.toString(),
                rider: {
                    name: userRecord?.name || "Rider",
                    phone: userRecord?.phone || ""
                },
                pickupLocation: normalizedPickup,
                dropoffLocation: normalizedDropoff,
                pickupLabel: normalizedPickup.address,
                dropoffLabel: normalizedDropoff.address,
                fare: `KES ${newTrip.fare}`,
                vehicleType,
                distance: route.distanceText,
                duration: route.durationText,
                scheduledTime: sched,
            });

            emitToUser(riderId, "trip_created", { tripId: newTrip._id });
        }

        return res.status(201).json({
            message: isChopper ? "Chopper request received, pending review" : "Trip requested successfully",
            trip: newTrip
        });

    } catch (error) {
        console.error("❌ confirmTrip error:", error);
        return res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
};

export const cancelTrip = async (req, res) => {
    const { tripId, reason, cancelledBy } = req.body;

    console.log("🛠️ CANCEL REQUEST RECEIVED - TripID:", tripId);

    try {
        if (!tripId) {
            return response(res, 400, "tripId is required for cancellation.");
        }

        const finalReason = reason?.trim() || "Cancelled";

        // 1. Cancel only active trips
        const trip = await Trip.findOneAndUpdate(
            {
                _id: tripId,
                status: { $in: ["requested", "pending", "assigned", "accepted", "in_progress"] }
            },
            {
                $set: {
                    status: "cancelled",
                    cancellationReason: finalReason,
                    cancelledAt: new Date()
                }
            },
            { new: true }
        );

        if (!trip) {
            return response(res, 400, "Trip not found or already closed.");
        }

        console.log("✅ Trip cancelled:", trip._id.toString());

        // 2. ALWAYS unlock rider (UI flag only)
        await User.findByIdAndUpdate(trip.rider, {
            isRiding: false
        });

        console.log(`🔓 Rider unlocked: ${trip.rider}`);

        // 3. Unlock driver ONLY if exists
        if (trip.driver) {
            await User.findByIdAndUpdate(trip.driver, {
                isRiding: false
            });

            emitToUser(trip.driver.toString(), "trip_cancelled", {
                tripId: trip._id.toString(),
                status: "cancelled",
                reason: finalReason
            });

            console.log(`🔓 Driver unlocked: ${trip.driver}`);
        }

        const payload = {
            tripId: trip._id.toString(),
            status: "cancelled",
            reason: finalReason,
            cancelledBy: cancelledBy || "user"
        };

        // 4. Notify systems
        emitToAdmin("trip_cancelled", payload);
        emitToUser(trip.rider.toString(), "trip_cancelled", payload);

        console.log("📡 Cancellation broadcast complete");

        return response(res, 200, "Trip cancelled successfully.", { trip });

    } catch (err) {
        console.error("❌ cancelTrip error:", err);
        return response(res, 500, "Internal server error.");
    }
};
export const declineTrip = async (req, res) => {
    try {
        const { tripId, reason } = req.body;

        const trip = await Trip.findOneAndUpdate(
            {
                _id: tripId,
                status: { $in: ["requested", "pending"] }   
             },
            {
                status: "cancelled",
                cancellationReason: reason || "Declined by admin"
            },
            { new: true }
        );

        if (!trip) {
            return response(res, 400, "Trip not found.");
        }

        // unlock rider
        await User.findByIdAndUpdate(trip.rider, {
            isRiding: false
        });

        const payload = {
            tripId: trip._id.toString(),
            status: "cancelled",
            reason: reason || "Ride declined by admin"
        };

        // notify rider
        emitToUser(
            trip.rider.toString(),
            "ride_declined",
            payload
        );

        // notify admin dashboards
        emitToAdmin("ride_declined", payload);

        return response(res, 200, "Trip declined.");

    } catch (err) {
        console.log(err);
        return response(res, 500, "Internal server error.");
    }
};
export const getAllTrips = async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        const validStatuses = ["pending", "requested", "assigned", "accepted", "in_progress", "completed", "cancelled"];

        const filter = {};
        if (status) {
            const statusArray = status.split(',').map(s => s.trim());
            const invalid = statusArray.filter(s => !validStatuses.includes(s));
            if (invalid.length) {
                return response(res, 400, `Invalid status value(s): ${invalid.join(", ")}`);
            }
            filter.status = statusArray.length > 1 ? { $in: statusArray } : statusArray[0];
        }

        const skip = (page - 1) * limit;
        const trips = await Trip.find(filter)
            .sort({ scheduledTime: -1 })
            .skip(skip)
            .limit(Number(limit))
            .select("rider driver pickupLocation dropoffLocation status fare vehicleType scheduledTime")
            .populate("rider", "name phone")
            .populate("driver", "name phone carModel carNumber");

        const formattedTrips = trips.map(trip => ({
            ...trip.toObject(),
            pickupLabel: trip.pickupLocation?.address,
            dropoffLabel: trip.dropoffLocation?.address,
        }));

        return response(res, 200, "Trips fetched.", formattedTrips);
    } catch (err) {
        console.error("❌ getAllTrips error:", err);
        return response(res, 500, "Internal server error.");
    }
};
// export const getAllTrips = async (req, res) => {
//     try {
//         const { status, page = 1, limit = 20 } = req.query;

//         const validStatuses = ["pending", "requested", "assigned", "accepted", "in_progress", "completed", "cancelled"];

//         if (status && !validStatuses.includes(status)) {
//             return response(res, 400, "Invalid status value.");
//         }

//         const filter = {};
//         if (status) filter.status = status;

//         const skip = (page - 1) * limit;

//         const trips = await Trip.find(filter)
//             .sort({ scheduledTime: -1 })
//             .skip(skip)
//             .limit(Number(limit))
//             .select("rider driver pickupLocation dropoffLocation status fare vehicleType scheduledTime")
//             .populate("rider", "name phone")
//             .populate("driver", "name phone carModel carNumber");

//         const formattedTrips = trips.map(trip => ({
//             ...trip.toObject(),
//             pickupLabel: trip.pickupLocation?.address,
//             dropoffLabel: trip.dropoffLocation?.address,
//         }));

//         return response(res, 200, "Trips fetched.", formattedTrips);

//     } catch (err) {
//         console.error("❌ getAllTrips error:", err);
//         return response(res, 500, "Internal server error.");
//     }
// };
export const getAvailableDrivers = async (req, res) => {
    try {
        const { tripId } = req.query;
        if (!tripId) return response(res, 400, "tripId is required.");

        const allDrivers = await User.find({ role: "driver" });

        const trip = await Trip.findById(tripId);
        if (!trip) return response(res, 404, "Trip not found.");

        const { vehicleType, scheduledTime, durationMinutes } = trip;

        const tripStart = scheduledTime ? new Date(scheduledTime) : new Date();
        const tripEnd = new Date(tripStart.getTime() + (durationMinutes || 60) * 60 * 1000);

        console.log("⏱ Trip start:", tripStart, "Trip end:", tripEnd);

        // Find busy drivers
        const busyDrivers = await Trip.find({
            status: { $in: ["assigned", "in_progress"] },
            driver: { $ne: null },
            scheduledTime: { $exists: true },
            $or: [
                {
                    $expr: {
                        $and: [
                            { $lt: ["$scheduledTime", tripEnd] },
                            { $gt: [{ $add: ["$scheduledTime", { $multiply: ["$durationMinutes", 60000] }] }, tripStart] },
                        ],
                    },
                },
            ],
        }).distinct("driver");

        const busyDriverIds = busyDrivers.map((id) => new mongoose.Types.ObjectId(id));

        // Case-insensitive vehicle filter
        const vehicleFilter = vehicleType
            ? { carType: { $regex: vehicleType, $options: "i" } }
            : {};
        console.log("🚘 Vehicle filter applied:", vehicleFilter);

        const drivers = await User.find({
            role: "driver",
            ...vehicleFilter,
            _id: { $nin: busyDriverIds },
        }).select("-password");


        const driversWithLocation = drivers.map((driver) => ({
            ...driver.toObject(),
            currentLocation: driverLocations.get(driver._id.toString()) || null,
            isOnline: driverLocations.has(driver._id.toString()),
        }));


        return response(res, 200, "Available drivers fetched.", driversWithLocation);

    } catch (err) {
        console.error("❌ getAvailableDrivers error:", err);
        return response(res, 500, "Internal server error.");
    }
};
export const startTrip = async (req, res) => {
    try {
        const { tripId } = req.params;

        console.log("===== START TRIP =====");
        console.log("TripId:", tripId);
        console.log("User:", req.user?.id);
        console.log("Role:", req.user?.role);

        if (!tripId || !mongoose.Types.ObjectId.isValid(tripId)) {
            return response(res, 400, "Invalid tripId.");
        }

        const trip = await Trip.findById(tripId);

        if (!trip) {
            return response(res, 404, "Trip not found.");
        }

        if (!["assigned", "accepted"].includes(trip.status)) {
            return response(res, 400, "Trip cannot be started in its current state.");
        }

        const userId = req.user?.id?.toString();
        const driverId = trip.driver?.toString();

        if (req.user.role !== "admin" && driverId !== userId) {
            return response(res, 403, "Not authorized to start this trip.");
        }

        trip.status = "in_progress";
        trip.startTime = new Date();
        await trip.save();

        const payload = {
            tripId: trip._id.toString(),
            pickupLocation: trip.pickupLocation,
            dropoffLocation: trip.dropoffLocation,
            startTime: trip.startTime
        };

        emitToUser(trip.rider.toString(), "trip_started", payload);

        emitToUser(trip.driver.toString(), "trip_started", {
            ...payload,
            startTracking: true
        });

        return response(res, 200, "Trip started successfully.", { trip });

    } catch (err) {
        console.error("❌ startTrip error:", err);
        return response(res, 500, "Internal server error.");
    }
};
// Driver or rider ends the trip
export const completeTrip = async (req, res) => {
    const { tripId, rating } = req.body;

    try {
        const trip = await Trip.findById(tripId);
        if (!trip) return response(res, 404, "Trip not found.");

        // ✅ Capture raw ObjectId strings BEFORE populating —
        // after populate(), trip.rider/trip.driver become full Documents,
        // and calling .toString() on those returns "[object Object]"
        // instead of the actual user id, which silently breaks emitToUser().
        const riderId = trip.rider?.toString();
        const driverId = trip.driver?.toString();

        trip.status = "completed";
        trip.endTime = new Date();
        if (rating) trip.ratingByRider = rating;
        await trip.save();

        await trip.populate("rider", "name phone");
        await trip.populate("driver", "name phone carModel carNumber");

        // Notify rider and driver
        emitToUser(riderId, "trip_completed", {
            type: "trip_completed",
            status: "completed",
            tripId: trip._id,
            endTime: trip.endTime,
            startTime: trip.startTime,     
            driver: trip.driver,
            fare: trip.fare, 
            pickupLocation: trip.pickupLocation,
            dropoffLocation: trip.dropoffLocation,
        });

        if (driverId) {
            emitToUser(driverId, "trip_completed", {
                type: "trip_completed",
                status: "completed",
                tripId: trip._id,
                endTime: trip.endTime,
                rider: trip.rider,
            });
        }

        return response(res, 200, "Trip completed.");
    } catch (err) {
        console.error(err);
        return response(res, 500, "Internal server error.");
    }
};

export const getTripById = async (req, res) => {
    const { tripId } = req.params;

    try {
        // 1. Validation
        if (!tripId || !mongoose.Types.ObjectId.isValid(tripId)) {
            return response(res, 400, "Invalid tripId.");
        }

        // 2. Fetch data
        const trip = await Trip.findById(tripId)
            .select("rider driver pickupLocation dropoffLocation status fare vehicleType scheduledTime startTime endTime ratingByRider")
            .populate("rider", "name phone")
            .populate("driver", "name phone carModel carNumber");

        if (!trip) {
            return response(res, 404, "Trip not found.");
        }

        // 3. Robust Authorization
        if (!req.user) {
            return response(res, 401, "Authentication required.");
        }

        const currentUserId = (req.user.id || req.user._id).toString();
        const currentUserRole = req.user.role;

        // Check against populated sub-documents
        const isRider = trip.rider?._id?.toString() === currentUserId;
        const isDriver = trip.driver?._id?.toString() === currentUserId;
        const isAdmin = currentUserRole === "admin";

        // If NONE of these are true, block access
        if (!isRider && !isDriver && !isAdmin) {
            return response(res, 403, "Not authorized to view this trip.");
        }

        // 4. Calculate duration
        let durationMin = null;
        if (trip.startTime && trip.endTime) {
            const start = new Date(trip.startTime);
            const end = new Date(trip.endTime);
            durationMin = Math.ceil((end - start) / 60000);
        }

        // 5. Format and Return
        const formattedTrip = {
            ...trip.toObject(),
            // Fallback for address vs label
            pickupLabel: trip.pickupLocation?.address || trip.pickupLocation?.label || "Unknown",
            dropoffLabel: trip.dropoffLocation?.address || trip.dropoffLocation?.label || "Unknown",
            durationMin
        };

        return response(res, 200, "Trip fetched successfully.", formattedTrip);

    } catch (err) {
        console.error("❌ getTripById error:", err);
        return response(res, 500, "Internal server error.");
    }
};
export const getActiveTrips = async (req, res) => {
    try {
        // 1. Check if user is authenticated (prevents TypeError: Cannot read properties of undefined)
        if (!req.user) {
            return response(res, 401, "Authentication required.");
        }

        // 2. Safely extract ID and Role (Supporting both .id and ._id)
        const userId = req.user.id || req.user._id;
        const role = req.user.role; 

        // 3. Validate Role
        if (!["rider", "driver"].includes(role)) {
            return response(res, 400, "Invalid role context.");
        }

        // 4. Define Filter (Dynamic key based on role)
        const filter = {
            [role]: userId,
            status: { $nin: ["completed", "cancelled"] }
        };

        // 5. Database Query
        const trips = await Trip.find(filter)
            .sort({ scheduledTime: -1 }) // Show most recent/upcoming first
            .select("rider driver pickupLocation dropoffLocation status fare vehicleType scheduledTime startTime")
            .populate("rider", "name phone")
            .populate("driver", "name phone carModel carNumber");

        // 6. Format for Flutter UI
        const formattedTrips = trips.map(trip => ({
            ...trip.toObject(),
            // Ensure address is mapped to 'label' if that's what your UI expects
            pickupLabel: trip.pickupLocation?.address || trip.pickupLocation?.label || "Unknown Pickup",
            dropoffLabel: trip.dropoffLocation?.address || trip.dropoffLocation?.label || "Unknown Dropoff",
        }));

        return response(res, 200, "Active trips fetched.", formattedTrips);

    } catch (err) {
        console.error("❌ getActiveTrips error:", err);
        return response(res, 500, "Internal server error.");
    }
};
// Get trips history
export const getTripActivity = async (req, res) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;

        if (!["rider", "driver"].includes(role)) {
            return response(res, 400, "Invalid role.");
        }

        const { page = 1, limit = 20 } = req.query;
        const skip = (page - 1) * limit;

        const trips = await Trip.find({
            [role]: userId,
            status: { $in: ["completed", "cancelled"] },
        })
            .sort({ updatedAt: -1 })
            .skip(skip)
            .limit(Number(limit))
            .populate("rider", "name phone")
            .populate("driver", "name phone carModel carNumber");

        const formattedTrips = trips.map(trip => ({
            ...trip.toObject(),
            pickupLabel: trip.pickupLocation?.address,
            dropoffLabel: trip.dropoffLocation?.address,
        }));

        return response(res, 200, "Trip activity retrieved.", formattedTrips);

    } catch (err) {
        console.error("❌ getTripActivity error:", err);
        return response(res, 500, "Internal server error.");
    }
};

export const assignTrip = async (req, res) => {
    try {
        const { tripId, driverId } = req.body;

        console.log("🚗 Assigning Trip:", tripId, "Driver:", driverId);

        if (!tripId || !driverId) {
            return response(res, 400, "tripId and driverId are required.");
        }

        // 1. Get trip
        const trip = await Trip.findOne({
            _id: tripId,
            status: { $in: ["requested", "accepted"] }
        });

        if (!trip) {
            return response(
                res,
                400,
                "Trip not found or not ready for assignment."
            );
        }

        // 2. Get driver
        const driver = await User.findById(driverId);
        if (!driver) {
            return response(res, 404, "Driver not found.");
        }

        // 3. Get rider (🔥 FIX for your bug)
        const rider = await User.findById(trip.rider);
        if (!rider) {
            return response(res, 404, "Rider not found.");
        }

        // 4. Update trip
        const updatedTrip = await Trip.findOneAndUpdate(
            {
                _id: tripId,
                status: { $in: ["requested", "accepted"] }
            },
            {
                status: "assigned",
                driver: driverId
            },
            { new: true }
        );

        // 5. Build shared payload (clean + consistent)
        const ridePayload = {
            tripId: updatedTrip._id.toString(),
            status: "assigned",

            pickup: updatedTrip.pickupLocation,
            dropoff: updatedTrip.dropoffLocation,

            fare: updatedTrip.fare,
            vehicleType: updatedTrip.vehicleType,

            distance: updatedTrip.distanceText || null,
            duration: updatedTrip.durationText || null,

            rider: {
                id: rider._id.toString(),
                name: rider.name,
                phone: rider.phone
            },

            driver: {
                id: driver._id.toString(),
                name: driver.name,
                phone: driver.phone,
                carModel: driver.carModel,
                carNumber: driver.carNumber
            }
        };

        // ─────────────────────────────
        // 6. NOTIFY DRIVER
        // ─────────────────────────────
        emitToUser(driverId, "ride_assigned", ridePayload);

        // ─────────────────────────────
        // 7. NOTIFY RIDER
        // ─────────────────────────────
        emitToUser(trip.rider.toString(), "driver_assigned", {
            tripId: updatedTrip._id.toString(),
            status: "driver_assigned",
            driver: ridePayload.driver,
            pickup: updatedTrip.pickupLocation,
            dropoff: updatedTrip.dropoffLocation,
            fare: updatedTrip.fare,
            message: "Driver is on the way"
        });

        // ─────────────────────────────
        // 8. NOTIFY ADMIN DASHBOARD
        // ─────────────────────────────
        emitToAdmin("driver_assigned", {
            tripId: updatedTrip._id.toString(),
            driverId,
            riderId: trip.rider.toString(),
            status: "assigned"
        });

        console.log("✅ Trip successfully assigned");

        return response(res, 200, "Driver assigned successfully.", {
            trip: updatedTrip
        });

    } catch (err) {
        console.error("❌ assignTrip error:", err);

        return response(res, 500, "Internal server error.");
    }
};
export const acceptTripByAdmin = async (req, res) => {
    try {
        const { tripId } = req.body;

        const trip = await Trip.findOneAndUpdate(
            {
                _id: tripId,
                status:{$in: ["requested", "pending"]} // allow both requested and pending for admin acceptance
            },
            {
                status: "accepted"
            },
            { new: true }
        );

        if (!trip) {
            return response(res, 400, "Trip not found.");
        }

                const isChopper = trip.vehicleType?.toLowerCase() === "chopper";
                const payload = {
            tripId: trip._id.toString(),
            status: "accepted",
            message: isChopper
                ? "Your Chopper booking has been confirmed. Our team will be in touch with further details."
                : "Ride accepted. Finding a driver..."
        };
        const payload = {
            tripId: trip._id.toString(),
            status: "accepted",
            message: "Ride accepted. Finding a driver..."
        };

        // 🚀 notify rider (WAITING STATE)
        emitToUser(
            trip.rider.toString(),
            "ride_accepted_by_admin",
            payload
        );

        // 🚀 notify admin dashboard
        emitToAdmin("ride_accepted_by_admin", payload);

        return response(res, 200, "Ride accepted.");

    } catch (err) {
        console.log(err);
        return response(res, 500, "Internal server error.");
        
    }
};

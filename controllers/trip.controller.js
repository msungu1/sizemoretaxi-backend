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

// --- Helper: simple fare calculator (tweak numbers to fit business rules)
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


export const confirmTrip = async (req, res) => {
    try {
        const { riderId, pickupLocation, dropoffLocation, vehicleType, scheduledTime } = req.body;

        if (!riderId || !pickupLocation || !dropoffLocation || !vehicleType || !scheduledTime) {
            return response(res, 400, "Missing required fields.");
        }

        const pickup = normalizeLocation(pickupLocation);
        const dropoff = normalizeLocation(dropoffLocation);

        if (!pickup.address || !dropoff.address) {
            return response(res, 400, "Pickup and dropoff address are required.");
        }

        const rider = await User.findById(riderId);
        if (!rider) return response(res, 404, "Rider not found.");


        const sched = new Date(scheduledTime);

        const route = await getDistanceAndDuration(pickup, dropoff);
        const fares = calculateFares(route.distanceMeters, route.durationSec);
        const selectedFare = fares.find(f => f.type === vehicleType);

        if (!selectedFare) return response(res, 400, "Invalid vehicle type.");

        const trip = await Trip.create({
            rider: riderId,
            pickupLocation: pickup,
            dropoffLocation: dropoff,
            scheduledTime: sched,
            vehicleType,
            fare: selectedFare.total,
            status: "requested"
        });

        // ✅ ALL rides go to admin now
        emitToAdmin("ride_requested", {
            tripId: trip._id.toString(),
            rider: { name: rider.name, phone: rider.phone },
            pickupLocation: pickup,
            dropoffLocation: dropoff,
            pickupLabel: pickup.address,
            dropoffLabel: dropoff.address,
            fare: `KES ${trip.fare}`,
            vehicleType,
            distance: route.distanceText,
            duration: route.durationText,
            scheduledTime: sched,
        });

        return response(res, 201, "Trip confirmed. Waiting for admin to assign a driver.", { trip });

    } catch (err) {
        console.error("❌ confirmTrip error:", err);
        return response(res, 500, "Internal server error.");
    }
};

export const assignTrip = async (req, res) => {
    const { tripId, driverId } = req.body;

    try {
        const driver = await User.findById(driverId);
        if (!driver) return response(res, 404, "Driver not found.");

        if (driver.role !== "driver") {
            return response(res, 400, "User is not a driver.");
        }

        // ✅ prevent driver double-booking
        const activeTrip = await Trip.findOne({
            driver: driverId,
            status: { $in: ["assigned", "accepted", "in_progress"] }
        });

        if (activeTrip) {
            return response(res, 409, "Driver already has an active trip.");
        }

        const trip = await Trip.findOneAndUpdate(
            { _id: tripId, status: "requested" },
            { status: "assigned", driver: driverId },
            { new: true }
        );

        if (!trip) {
            return response(res, 409, "Trip not available (already assigned or cancelled).");
        }

        // optional: route info
        const route = await getDistanceAndDuration(
            trip.pickupLocation,
            trip.dropoffLocation
        );

        emitToUser(driverId, "ride_assigned", {
            tripId: trip._id.toString(),
            pickupLocation: trip.pickupLocation,
            dropoffLocation: trip.dropoffLocation,
            pickupLabel: trip.pickupLocation.address,
            dropoffLabel: trip.dropoffLocation.address,
            fare: `KES ${trip.fare}`,
            vehicleType: trip.vehicleType,
            distance: route.distanceText,
            duration: route.durationText,
            scheduledTime: trip.scheduledTime,
        });

        emitToUser(trip.rider.toString(), "ride_assigned", {
            tripId: trip._id.toString(),
            driver: {
                name: driver.name,
                phone: driver.phone,
                carModel: driver.carModel,
                carNumber: driver.carNumber,
            }
        });

        return response(res, 200, "Trip assigned to driver.", { trip });

    } catch (err) {
        console.error("❌ assignTrip error:", err);
        return response(res, 500, "Internal server error.");
    }
};

export const cancelTrip = async (req, res) => {
    const { tripId, reason } = req.body;

    try {
        const finalReason = reason?.trim() || "Cancelled by admin";

        const trip = await Trip.findOneAndUpdate(
            {
                _id: tripId,
                status: { $nin: ["completed", "cancelled"] }
            },
            {
                status: "cancelled",
                cancellationReason: finalReason,
                cancelledBy: "admin",
                cancelledAt: new Date()
            },
            { new: true }
        );

        if (!trip) {
            return response(res, 400, "Trip is already completed or cancelled.");
        }

        const payload = {
            tripId: trip._id.toString(),
            status: "cancelled",
            reason: trip.cancellationReason,
            pickupLocation: trip.pickupLocation,
            dropoffLocation: trip.dropoffLocation,
            pickupLabel: trip.pickupLocation?.address,
            dropoffLabel: trip.dropoffLocation?.address,
        };

        emitToUser(trip.rider.toString(), "trip_cancelled", payload);

        if (trip.driver) {
            emitToUser(trip.driver.toString(), "trip_cancelled", payload);
        }

        return response(res, 200, "Trip cancelled.", { trip });

    } catch (err) {
        console.error("❌ cancelTrip error:", err);
        return response(res, 500, "Internal server error.");
    }
};

export const getAllTrips = async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;

        const validStatuses = ["pending", "requested", "assigned", "accepted", "in_progress", "completed", "cancelled"];

        if (status && !validStatuses.includes(status)) {
            return response(res, 400, "Invalid status value.");
        }

        const filter = {};
        if (status) filter.status = status;

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

// export const getAvailableDrivers = async (req, res) => {
//     try {
//         const { tripId } = req.query;
//         if (!tripId) return response(res, 400, "tripId is required.");

//         const trip = await Trip.findById(tripId);
//         console.log("Trip found:", trip);
//         if (!trip) return response(res, 404, "Trip not found.");

//         const { vehicleType, scheduledTime } = trip;

//         const windowStart = new Date(scheduledTime.getTime() - 60 * 60 * 1000);
//         const windowEnd = new Date(scheduledTime.getTime() + 60 * 60 * 1000);

//         let busyDrivers = await Trip.find({
//             status: { $in: ["assigned", "in_progress"] },
//             scheduledTime: { $gte: windowStart, $lte: windowEnd }
//         }).distinct("driver");

//         busyDrivers = busyDrivers.map(id => mongoose.Types.ObjectId(id));
//         console.log("Busy drivers:", busyDrivers);

//         const vehicleFilter = vehicleType
//             ? { carType: { $regex: new RegExp(`^${vehicleType}$`, "i") } }
//             : {};

//         const drivers = await User.find({
//             role: "driver",
//             ...vehicleFilter,
//             _id: { $nin: busyDrivers }
//         }).select("-password");

//         console.log("Drivers found:", drivers);

//         const driversWithLocation = drivers.map(driver => ({
//             ...driver.toObject(),
//             currentLocation: driverLocations.get(driver._id.toString()) || null,
//             isOnline: driverLocations.has(driver._id.toString())
//         }));

//         return response(res, 200, "Available drivers fetched.", driversWithLocation);

//     } catch (err) {
//         console.error("❌ getAvailableDrivers error:", err);
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

        if (!tripId || !mongoose.Types.ObjectId.isValid(tripId)) {
            return response(res, 400, "Invalid tripId.");
        }

        const trip = await Trip.findOneAndUpdate(
            {
                _id: tripId,
                status: { $in: ["assigned", "accepted"] }
            },
            {
                status: "in_progress",
                startTime: new Date()
            },
            { new: true }
        );

        if (!trip) {
            return response(res, 400, "Trip cannot be started in its current state.");
        }

        // ✅ Optional: verify driver ownership if you have auth
        // if (trip.driver.toString() !== req.user.id.toString()) {
        //     return response(res, 403, "Not authorized.");
        // }

        const payload = {
            tripId: trip._id.toString(),
            pickupLocation: trip.pickupLocation,
            dropoffLocation: trip.dropoffLocation,
            pickupLabel: trip.pickupLocation?.address,
            dropoffLabel: trip.dropoffLocation?.address,
            startTime: trip.startTime
        };

        emitToUser(trip.rider.toString(), "trip_started", payload);

        emitToUser(trip.driver.toString(), "trip_started", {
            ...payload,
            startTracking: true
        });

        console.log(`🚗 Trip ${tripId} started`);

        return response(res, 200, "Trip started.");

    } catch (err) {
        console.error("startTrip error:", err.message);
        return response(res, 500, "Internal server error.");
    }
};

// Driver or rider ends the trip
export const completeTrip = async (req, res) => {
    const { tripId, rating } = req.body;

    try {
        const trip = await Trip.findOneAndUpdate(
            {
                _id: tripId,
                status: "in_progress"
            },
            {
                status: "completed",
                endTime: new Date()
            },
            { new: true }
        );

        if (!trip) {
            return response(res, 400, "Trip is not in progress or already completed.");
        }

        // ✅ Optional: driver auth check
        // if (trip.driver.toString() !== req.user.id.toString()) {
        //     return response(res, 403, "Not authorized.");
        // }

        // ✅ rating validation
        if (rating !== undefined) {
            if (rating < 1 || rating > 5) {
                return response(res, 400, "Rating must be between 1 and 5.");
            }
            trip.ratingByRider = rating;
        }

        await trip.save();

        const durationMs = trip.endTime - trip.startTime;
        const durationMin = Math.ceil(durationMs / 60000);

        await trip.populate("rider", "name phone");
        await trip.populate("driver", "name phone carModel carNumber");

        const payload = {
            tripId: trip._id.toString(),
            endTime: trip.endTime,
            fare: trip.fare,
            durationMin,
            pickupLocation: trip.pickupLocation,
            dropoffLocation: trip.dropoffLocation,
            pickupLabel: trip.pickupLocation?.address,
            dropoffLabel: trip.dropoffLocation?.address,
        };

        emitToUser(trip.rider.toString(), "trip_completed", {
            ...payload,
            driver: trip.driver
        });

        if (trip.driver) {
            emitToUser(trip.driver.toString(), "trip_completed", {
                ...payload,
                rider: trip.rider
            });
        }

        return response(res, 200, "Trip completed.");

    } catch (err) {
        console.error("❌ completeTrip error:", err);
        return response(res, 500, "Internal server error.");
    }
};

export const getTripById = async (req, res) => {
    const { tripId } = req.params;

    try {
        if (!tripId || !mongoose.Types.ObjectId.isValid(tripId)) {
            return response(res, 400, "Invalid tripId.");
        }

        const trip = await Trip.findById(tripId)
            .select("rider driver pickupLocation dropoffLocation status fare vehicleType scheduledTime startTime endTime ratingByRider")
            .populate("rider", "name phone")
            .populate("driver", "name phone carModel carNumber");

        if (!trip) {
            return response(res, 404, "Trip not found.");
        }

        // ✅ Authorization
        const userId = req.user?._id?.toString();

        if (
            trip.rider.toString() !== userId &&
            trip.driver?.toString() !== userId &&
            req.user?.role !== "admin"
        ) {
            return response(res, 403, "Not authorized to view this trip.");
        }

        let durationMin = null;
        if (trip.startTime && trip.endTime) {
            durationMin = Math.ceil((trip.endTime - trip.startTime) / 60000);
        }

        const formattedTrip = {
            ...trip.toObject(),
            pickupLabel: trip.pickupLocation?.address,
            dropoffLabel: trip.dropoffLocation?.address,
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
        const userId = req.user.id;
        const role = req.user.role; // 'rider' or 'driver'

        if (!["rider", "driver"].includes(role)) {
            return response(res, 400, "Invalid role.");
        }

        const filter = {
            [role]: userId,
            status: { $nin: ["completed", "cancelled"] }
        };

        const trips = await Trip.find(filter)
            .sort({ scheduledTime: -1 })
            .select("rider driver pickupLocation dropoffLocation status fare vehicleType scheduledTime startTime")
            .populate("rider", "name phone")
            .populate("driver", "name phone carModel carNumber");

        const formattedTrips = trips.map(trip => ({
            ...trip.toObject(),
            pickupLabel: trip.pickupLocation?.address,
            dropoffLabel: trip.dropoffLocation?.address,
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
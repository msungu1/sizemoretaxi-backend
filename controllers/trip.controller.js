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
    lng: loc.lng ?? loc.longitude
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

        // calculate distance & duration
        const route = await getDistanceAndDuration(pickupLocation, dropoffLocation);

        // calculate fares
        const vehicles = calculateFares(route.distanceMeters, route.durationSec);

        return response(res, 200, "Vehicle options generated.", {
            route,
            vehicles // list of 4 vehicle types + pricing
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

        const rider = await User.findById(riderId);
        if (!rider) return response(res, 404, "Rider not found.");

        const pickup = normalizeLocation(pickupLocation);
        const dropoff = normalizeLocation(dropoffLocation);
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

        const trip = await Trip.findOneAndUpdate(
            { _id: tripId, status: "requested" },
            { status: "accepted", driver: driverId },
            { new: true }
        );

        if (!trip) return response(res, 409, "Trip not available (already assigned or cancelled).");

        // Notify the assigned driver
        emitToUser(driverId, "ride_assigned", {
            tripId: trip._id.toString(),
            pickupLocation: trip.pickupLocation,
            dropoffLocation: trip.dropoffLocation,
            fare: `KES ${trip.fare}`,
            vehicleType: trip.vehicleType,
            scheduledTime: trip.scheduledTime,
        });

        // Notify the rider their trip has a driver
        emitToUser(trip.rider.toString(), "ride_accepted", {
            tripId: trip._id,
            driver: {
                name: driver.name,
                phone: driver.phone,
                carModel: driver.carModel,
                carNumber: driver.carNumber,
            }
        });

        console.log(`✅ Trip ${tripId} assigned to driver ${driver.name}`);
        return response(res, 200, "Trip assigned to driver.", { trip });

    } catch (err) {
        console.error("❌ assignTrip error:", err);
        return response(res, 500, "Internal server error.");
    }
};

export const cancelTrip = async (req, res) => {
    const { tripId, reason } = req.body;

    try {
        const trip = await Trip.findById(tripId);
        if (!trip) return response(res, 404, "Trip not found.");

        if (["completed", "cancelled"].includes(trip.status)) {
            return response(res, 400, "Trip is already completed or cancelled.");
        }

        trip.status = "cancelled";
        trip.cancellationReason = reason || "Cancelled by admin";
        await trip.save();

        const payload = {
            tripId,
            status: "cancelled",
            reason: trip.cancellationReason,
        };

        // Notify rider
        emitToUser(trip.rider.toString(), "trip_cancelled", payload);

        // Notify driver if one was assigned
        if (trip.driver) {
            emitToUser(trip.driver.toString(), "trip_cancelled", payload);
        }

        console.log(`🚫 Trip ${tripId} cancelled by admin.`);
        return response(res, 200, "Trip cancelled.", { trip });

    } catch (err) {
        console.error("❌ cancelTrip error:", err);
        return response(res, 500, "Internal server error.");
    }
};

export const getAllTrips = async (req, res) => {
    try {
        const { status } = req.query;

        const filter = {};
        if (status) filter.status = status;

        const trips = await Trip.find(filter)
            .sort({ scheduledTime: -1 })
            .populate("rider", "name phone")
            .populate("driver", "-password");

        return response(res, 200, "Trips fetched.", trips);

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

        const trip = await Trip.findById(tripId);
        if (!trip) return response(res, 404, "Trip not found.");

        const { vehicleType, scheduledTime } = trip;

        // SAFETY: Handle cases where scheduledTime might be missing/null
        const baseTime = scheduledTime ? new Date(scheduledTime) : new Date();

        const windowStart = new Date(baseTime.getTime() - 60 * 60 * 1000);
        const windowEnd = new Date(baseTime.getTime() + 60 * 60 * 1000);

        let busyDrivers = await Trip.find({
            status: { $in: ["assigned", "in_progress"] },
            scheduledTime: { $gte: windowStart, $lte: windowEnd }
        }).distinct("driver");

        // FIX: Added 'new' keyword to avoid the 500 error
        const busyDriverIds = busyDrivers
            .filter(id => id)
            .map(id => new mongoose.Types.ObjectId(id));

        const vehicleFilter = vehicleType
            ? { carType: { $regex: new RegExp(`^${vehicleType}$`, "i") } }
            : {};
        const drivers = await User.find({
            role: "driver",
            ...vehicleFilter,
            _id: { $nin: busyDriverIds }
        }).select("-password");

        const driversWithLocation = drivers.map(driver => ({
            ...driver.toObject(),
            currentLocation: driverLocations.get(driver._id.toString()) || null,
            isOnline: driverLocations.has(driver._id.toString())
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

        const trip = await Trip.findById(tripId);
        if (!trip) return response(res, 404, "Trip not found.");

        trip.status = "in_progress";
        trip.startTime = new Date();
        await trip.save();

        emitToUser(trip.rider?.toString(), "trip_started", { tripId });
        emitToUser(trip.driver?.toString(), "trip_started", { tripId });
        emitToUser(trip.driver?.toString(), "start_location_tracking", { tripId });

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
        const trip = await Trip.findById(tripId);
        if (!trip) return response(res, 404, "Trip not found.");

        trip.status = "completed";
        trip.endTime = new Date();
        if (rating) trip.ratingByRider = rating;
        await trip.save();

        await trip.populate("rider", "name phone");
        await trip.populate("driver", "name phone carModel carNumber");

        // Notify rider and driver
        emitToUser(trip.rider?.toString(), "trip_completed", {
            tripId: trip._id,
            endTime: trip.endTime,
            driver: trip.driver,
        });

        if (trip.driver) {
            emitToUser(trip.driver?.toString(), "trip_completed", {
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
        const trip = await Trip.findById(tripId)
            .populate("rider", "name phone")
            .populate("driver", "name phone carNumber carModel carType");

        if (!trip) return response(res, 404, "Trip not found.");

        return response(res, 200, "Trip fetched successfully.", trip);
    } catch (err) {
        console.error(err);
        return response(res, 500, "Internal server error.");
    }
};

export const getActiveTrips = async (req, res) => {
    const { userId, role } = req.query; // role: 'rider' or 'driver'

    if (!userId || !["rider", "driver"].includes(role)) {
        return response(res, 400, "userId and valid role (rider/driver) are required.");
    }

    try {
        const filter = {
            [role]: userId,
            status: { $nin: ["completed", "cancelled"] }
        };

        const trips = await Trip.find(filter)
            .sort({ scheduledTime: -1 })
            .populate("rider", "name phone")
            .populate("driver", "name phone carModel carNumber carType");


        return response(res, 200, "Active trips fetched.", trips);
    } catch (err) {
        console.error(err);
        return response(res, 500, "Internal server error.");
    }
};

// Get trips history
export const getTripActivity = async (req, res) => {
    const { userId, role } = req.query;

    if (!userId || !["rider", "driver"].includes(role)) {
        return res.status(400).json({
            status: 400,
            message: "userId and valid role (rider/driver) are required.",
        });
    }

    try {
        const trips = await Trip.find({
            [role]: userId,
            status: { $in: ["completed", "cancelled"] },
        })
            .sort({ updatedAt: -1 })
            .populate("rider", "name phone")
            .populate("driver", "name phone carModel carNumber");

        return res.status(200).json({
            status: 200,
            message: "Trip activity retrieved.",
            data: trips,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({
            status: 500,
            message: "Internal server error.",
        });
    }
};
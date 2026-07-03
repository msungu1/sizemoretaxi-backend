
import mongoose from "mongoose";
import { Server } from "socket.io"

export const onlineUsers = new Map()
export const driverLocations = new Map();
export let io = null

export const initSocket = (server) => {
    io = new Server(server, {
        cors: { origin: "*", credentials: true }
    })

    io.on("connection", (socket) => {
        let userId = socket.handshake.query.userId?.toString();
        const role = socket.handshake.query.role;

        if (userId) {
            onlineUsers.set(userId, socket.id);
            socket.join(userId);

            if (role === "driver") {
                socket.join("drivers_room");
                console.log(`🚕 Driver Joined Room: ${userId}`);
            }
            
            if (role === "admin") {
                socket.join("admin_room"); 
                console.log(`👨‍💼 Admin Joined Room: ${userId}`);
            }

            console.log(`⚡ Connected: ${userId} (${role})`);
        }

        socket.on("ride_cancelled", async ({ tripId }) => {
            console.log(`Socket: ride_cancelled received for ${tripId}`);
        });

        // Driver sends location updates while trip is in progress

socket.on("driver_location_update", async (data) => {
    try {
        const lat = data.lat;
        const lng = data.lng;

        // 🛡️ SAFELY NORMALIZE driverId
        const rawDriverId = data.driverId || userId;

        const driverId =
            typeof rawDriverId === "object" && rawDriverId !== null
                ? (rawDriverId._id || rawDriverId.id)?.toString()
                : rawDriverId?.toString();

        // 🚫 Missing ID
        if (!driverId) {
            console.log("❌ Missing driverId");
            return;
        }

        // 🚫 Invalid Mongo ObjectId
        if (!mongoose.Types.ObjectId.isValid(driverId)) {
            console.log("❌ Invalid driverId:", driverId);
            return;
        }

        // 🔍 DEBUG LOGS
        console.log("📍 driver_location_update");
        console.log("driverId:", driverId);
        console.log("driverId type:", typeof driverId);

        // Store in memory
        driverLocations.set(driverId, {
            lat,
            lng,
            heading: data.heading || 0,
            speed: data.speed || 0,
            updatedAt: new Date(),
        });

        // SAVE LIVE LOCATION TO DATABASE
        const { User } = await import("../models/user.model.js");

        await User.findByIdAndUpdate(
            driverId,
            {
                currentLocation: {
                    lat,
                    lng,
                    heading: data.heading || 0,
                    speed: data.speed || 0,
                    updatedAt: new Date(),
                }
            },
            { new: true }
        );

        const { Trip } = await import("../models/trip.model.js");

        // Find active trips safely
        const activeTrips = await Trip.find({
            driver: driverId,
            // status: "in_progress"
            status: { $in: ["assigned", "accepted", "arrived", "in_progress"] }
        });

        for (const trip of activeTrips) {

            // 🛡️ SAFE rider room generation
            const riderRoom =
                typeof trip.rider === "object" && trip.rider !== null
                    ? (trip.rider._id || trip.rider.id)?.toString()
                    : trip.rider?.toString();

            if (!riderRoom) {
                console.log("❌ Invalid rider room for trip:", trip._id);
                continue;
            }

            // Notify rider of driver's location
            io.to(riderRoom).emit("driver_location_update", {
                tripId: trip._id,
                lat,
                lng,
                heading: data.heading || 0,
                speed: data.speed || 0,
            });

            // Notify admin
            io.to("admin_room").emit("driver_location_update", {
                tripId: trip._id,
                driverId,
                location: {
                    lat,
                    lng,
                    heading: data.heading || 0,
                    speed: data.speed || 0,
                }
            });
        }

    } catch (error) {
        console.error("❌ driver_location_update error:");
        console.error(error);
    }
});
        socket.on("disconnect", () => {
            if (userId) {
                onlineUsers.delete(userId);
                driverLocations.delete(userId);
                console.log(`🔌 Disconnected: ${userId}`);
            }
        });

        socket.on("accept_ride", async ({ tripId, driverId }) => {
            try {
                // 🛡️ FIX: Extract raw ID if driverId is passed as an object payload
                const cleanDriverId = typeof driverId === 'object' && driverId !== null 
                    ? (driverId.id || driverId._id) 
                    : driverId;

                if (!mongoose.Types.ObjectId.isValid(cleanDriverId)) {
                    console.log("❌ Cannot accept ride: Invalid driverId payload format");
                    return;
                }

                const { Trip } = await import("../models/trip.model.js");

                const trip = await Trip.findById(tripId)
                    .populate("driver")
                    .populate("rider");

                if (!trip) return;

                // prevent duplicate acceptance
                if (trip.status === "accepted") return;

                trip.status = "accepted";
                trip.driver = cleanDriverId; // Set clean string ID format safely

                await trip.save();

                // reload populated fields safely
                const updatedTrip = await Trip.findById(tripId)
                    .populate("driver")
                    .populate("rider");

                if (!updatedTrip || !updatedTrip.rider || !updatedTrip.driver) return;

                const riderRoom = updatedTrip.rider._id.toString();

                // 🚀 SEND FULL DATA TO PASSENGER
                io.to(riderRoom).emit(
                    "ride_accepted_by_driver",
                    {
                        tripId: updatedTrip._id,
                        status: "accepted",
                        driver: {
                            id: updatedTrip.driver._id,
                            name: updatedTrip.driver.name,
                            phone: updatedTrip.driver.phone,
                            carModel: updatedTrip.driver.carModel,
                            carNumber: updatedTrip.driver.carNumber,
                        },
                        pickupLocation: updatedTrip.pickupLocation,
                        dropoffLocation: updatedTrip.dropoffLocation,
                        fare: updatedTrip.fare,
                    }
                );

                // notify admin
                io.to("admin_room").emit(
                    "ride_accepted_by_driver",
                    {
                        tripId,
                        driverId: updatedTrip.driver._id,
                    }
                );

                console.log("✅ Driver accepted trip:", tripId);

            } catch (err) {
                console.log("❌ accept_ride error:", err);
            }
        });

        socket.on("join_trip", ({ tripId }) => {
            socket.join(`trip_${tripId}`);
            console.log(`Joined trip room ${tripId}`);
        });

        socket.on("leave_trip", ({ tripId }) => {
            socket.leave(`trip_${tripId}`);
            console.log(`Left trip room ${tripId}`);
        });

        socket.on("reject_ride", async ({ tripId, reason }) => {
            try {
                const { Trip } = await import("../models/trip.model.js");
                const trip = await Trip.findById(tripId);
                if (!trip) return;

                trip.status = "rejected";
                await trip.save();

                const riderRoom = trip.rider?._id ? trip.rider._id.toString() : trip.rider.toString();
                io.to(riderRoom).emit("ride_rejected", {
                    tripId,
                    status: "rejected",
                    reason: reason || "No drivers available"
                });

                console.log("❌ Ride rejected");
            } catch (err) {
                console.log(err);
            }
        });

        socket.on("admin_reject_ride", async ({ tripId, reason }) => {
            try {
                const { Trip } = await import("../models/trip.model.js");

                const trip = await Trip.findById(tripId);
                if (!trip) return;

                trip.status = "cancelled";
                trip.cancellationReason = reason || "Rejected by admin";

                await trip.save();

                const riderRoom = trip.rider?._id ? trip.rider._id.toString() : trip.rider.toString();
                io.to(riderRoom).emit("ride_rejected", {
                    tripId,
                    reason: trip.cancellationReason,
                    status: "rejected"
                });

                console.log("❌ Admin rejected ride:", tripId);
            } catch (err) {
                console.log(err);
            }
        });

        socket.on("register", ({ userId, role }) => {
            if (!userId) return;

            onlineUsers.set(userId, socket.id);
            socket.join(userId);

            if (role === "driver") socket.join("drivers_room");
            if (role === "admin") socket.join("admin_room");

            console.log("📌 REGISTERED:", userId, role);
        });

        // Driver pressed "I Have Arrived"
        socket.on('driver_arrived', async ({ tripId }) => {
            const { Trip } = await import('../models/trip.model.js');
            const trip = await Trip.findByIdAndUpdate(tripId, { status: 'arrived' }, { new: true });
            if (!trip) return;

            const riderRoom = trip.rider?._id ? trip.rider._id.toString() : trip.rider.toString();
            io.to(riderRoom).emit('status_update', { tripId, status: 'arrived' });
        });

        // Driver pressed "Start Trip"
        socket.on('start_trip', async ({ tripId }) => {
            const { Trip } = await import('../models/trip.model.js');
            const trip = await Trip.findByIdAndUpdate(tripId, { status: 'in_progress', startTime: new Date() }, { new: true });
            if (!trip) return;

            const riderRoom = trip.rider?._id ? trip.rider._id.toString() : trip.rider.toString();
            io.to(riderRoom).emit('trip_started', { tripId, status: 'in_progress' });
            io.to('admin_room').emit('trip_started', { tripId });
        });

        // Driver pressed "End Trip"
socket.on('complete_trip', async (payload) => {
    try {

        console.log("🏁 COMPLETE TRIP PAYLOAD:", payload);

        const { Trip } = await import('../models/trip.model.js');
        const { User } = await import('../models/user.model.js');

        const tripId =
            typeof payload?.tripId === 'object'
                ? payload.tripId?._id?.toString()
                : payload?.tripId?.toString();

        const rawDriverId = payload?.driverId;

        const cleanDriverId =
            typeof rawDriverId === 'object' && rawDriverId !== null
                ? (rawDriverId._id || rawDriverId.id)?.toString()
                : rawDriverId?.toString();

        console.log("🧾 tripId:", tripId);
        console.log("🧾 cleanDriverId:", cleanDriverId);

        if (!tripId) {
            console.log("❌ Missing tripId");
            return;
        }

        // =========================
        // FIND TRIP
        // =========================

        const trip = await Trip.findById(tripId)
            .populate('rider')
            .populate('driver');

        if (!trip) {
            console.log("❌ Trip not found");
            return;
        }

        // =========================
        // DRIVER VALIDATION
        // =========================

        const assignedDriverId =
            typeof trip.driver === 'object'
                ? trip.driver?._id?.toString()
                : trip.driver?.toString();

        console.log("🚕 assignedDriverId:", assignedDriverId);
        console.log("🚕 incomingDriverId:", cleanDriverId);

        

        // =========================
        // COMPLETE TRIP
        // =========================

        trip.status = 'completed';
        trip.endTime = new Date();

        await trip.save();

        console.log("✅ Trip marked completed");

        // =========================
        // SAFE USER IDS
        // =========================

        const riderId =
            typeof trip.rider === 'object'
                ? trip.rider?._id?.toString()
                : trip.rider?.toString();

        const finalDriverId =
            typeof trip.driver === 'object'
                ? trip.driver?._id?.toString()
                : trip.driver?.toString();

        console.log("📡 riderId:", riderId);
        console.log("📡 finalDriverId:", finalDriverId);

        // =========================
        // RESET RIDING STATE
        // =========================

        if (riderId) {
            await User.findByIdAndUpdate(
                riderId,
                { isRiding: false }
            );
        }

        if (finalDriverId) {
            await User.findByIdAndUpdate(
                finalDriverId,
                { isRiding: false }
            );
        }

        // =========================
        // FINAL PAYLOAD
        // =========================

        const completionPayload = {
            type: 'trip_completed',
            status: 'completed',
            tripId: trip._id.toString(),
            fare: trip.fare || 0,
            distance: trip.distance || 0,
            endTime: trip.endTime,
        };

        console.log("📡 EMITTING trip_completed");
        console.log(completionPayload);

        // =========================
        // EMIT TO RIDER
        // =========================

        if (riderId) {

            io.to(riderId).emit(
                'trip_completed',
                completionPayload
            );

            console.log(
                `✅ Sent trip_completed to rider ${riderId}`
            );
        }


        if (finalDriverId) {

            io.to(finalDriverId).emit(
                'trip_completed',
                completionPayload
            );

            console.log(
                `✅ Sent trip_completed to driver ${finalDriverId}`
            );
        }

        io.to('admin_room').emit(
            'trip_completed',
            completionPayload
        );

        console.log("🏁 COMPLETE FLOW FINISHED");

    } catch (error) {

        console.error("❌ COMPLETE TRIP ERROR:");
        console.error(error);

    }
});
 ```javascript id="g7m2ka"
socket.on("emergency_alert", async (data) => {
    try {

        console.log("🚨 EMERGENCY ALERT RECEIVED");
        console.log(data);

        const emergencyPayload = {
            type: data.type || "emergency",
            message:
                data.message ||
                "Emergency assistance requested",

            tripId: data.tripId || null,
            riderId: data.riderId || null,
            driverId: data.driverId || null,

            lat: data.lat || null,
            lng: data.lng || null,

            timestamp: new Date(),
        };

        // 🚨 SEND TO ALL ADMINS
        io.to("admin_room").emit(
            "admin_emergency_alert",
            emergencyPayload
        );

        console.log(
            "🚨 Emergency alert sent to admin_room"
        );

    } catch (error) {

        console.log(
            "❌ emergency_alert error:",
            error
        );

    }
});
```

    });
}

export const emitToUser = (userId, event, data) => {
    if (io && userId) {
        const target = userId.toString();
        console.log(`📡 Sending [${event}] to User Room: ${target}`);
        io.to(target).emit(event, data);
    }
};

export const emitToAdmin = (event, data) => {
    if (io) {
        console.log(`📡 Sending [${event}] to Admin Room`);
        io.to("admin_room").emit(event, data);
    }
};
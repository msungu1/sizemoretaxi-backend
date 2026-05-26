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

            // if (role === "driver") socket.join("drivers_room");
            // if (role === "admin") socket.join("admin_room");
            // 🚀 CRITICAL: Ensure this matches the room used in emitToAdmin
        if (role === "driver") {
            socket.join("drivers_room");
            console.log(`🚕 Driver Joined Room: ${userId}`);
        }
        
        if (role === "admin") {
            socket.join("admin_room"); // 👈 This must match exactly
            console.log(`👨‍💼 Admin Joined Room: ${userId}`);
        }

            console.log(`⚡ Connected: ${userId} (${role})`);
        }
socket.on("ride_cancelled", async ({ tripId }) => {
    console.log(`Socket: ride_cancelled received for ${tripId}`);
    // The HTTP endpoint handles the actual DB update
    // This just logs it — HTTP cancel endpoint does the real work
});
        // Driver sends location updates while trip is in progress
        socket.on("driver_location_update", async (data) => {
            const lat = data.lat;
            const lng = data.lng;
            const driverId = data.driverId || userId;

            if (!driverId) return;

            if (!mongoose.Types.ObjectId.isValid(driverId)) {
                console.log(" Invalid driverId:", driverId);
                return;
            }

driverLocations.set(driverId, {
    lat,
    lng,
    heading: data.heading || 0,
    speed: data.speed || 0,
    updatedAt: new Date(),
});

// SAVE LIVE LOCATION TO DATABASE
const { User } = await import("../models/user.model.js");

await User.findByIdAndUpdate(driverId, {
    currentLocation: {
        lat,
        lng,
        heading: data.heading || 0,
        speed: data.speed || 0,
        updatedAt: new Date(),
    }
});
            const { Trip } = await import("../models/trip.model.js");

            const activeTrips = await Trip.find({
                driver: driverId,
                status: "in_progress"
            });

            for (const trip of activeTrips) {

                // Notify rider of driver's location
                io.to(trip.rider.toString()).emit("driver_location_update", {
                    tripId: trip._id,
                     lat,
                     lng,
                });

                // Also keep admin updated on driver location during active trip
                io.to("admin_room").emit("driver_location_update", {
                    tripId: trip._id,
                    driverId,
                    location: { lat, lng }
                });
            }
        });

        socket.on("disconnect", () => {
            if (userId) {
                onlineUsers.delete(userId);
                driverLocations.delete(userId);
                console.log(`🔌 Disconnected: ${userId}`);
            }
        });
//         socket.on("accept_ride", async ({ tripId, driverId }) => {
//     try {

//         const { Trip } = await import("../models/trip.model.js");

//         const trip = await Trip.findById(tripId);

//         if (!trip) return;

//         if (trip.status !== "assigned") return;

//         trip.status = "accepted";
//         trip.driver = driverId;

//         await trip.save();

//         io.to(trip.rider.toString()).emit("driver_accepted_trip", {
//             tripId,
//             driverId,
//             status: "accepted"
//         });

//         io.to("admin_room").emit("driver_accepted_trip", {
//             tripId,
//             driverId
//         });

//     } catch (err) {
//         console.log(err);
//     }

// });
socket.on("accept_ride", async ({ tripId, driverId }) => {
    try {

        const { Trip } = await import("../models/trip.model.js");

        const trip = await Trip.findById(tripId)
            .populate("driver")
            .populate("rider");

        if (!trip) return;

        // prevent duplicate acceptance
        if (trip.status === "accepted") return;

        trip.status = "accepted";

        // ensure driver exists
        if (driverId) {
            trip.driver = driverId;
        }

        await trip.save();

        // reload populated driver
        const updatedTrip = await Trip.findById(tripId)
            .populate("driver")
            .populate("rider");

        // 🚀 SEND FULL DATA TO PASSENGER
        io.to(updatedTrip.rider._id.toString()).emit(
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

        io.to(trip.rider.toString()).emit("ride_rejected", {
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

        // notify rider
        io.to(trip.rider.toString()).emit("ride_rejected", {
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
  const trip = await Trip.findByIdAndUpdate(tripId,
    { status: 'arrived' }, { new: true });
  if (!trip) return;

  // notify rider
  io.to(trip.rider.toString()).emit('status_update', {
    tripId, status: 'arrived'
  });
});

// Driver pressed "Start Trip"
socket.on('start_trip', async ({ tripId }) => {
  const { Trip } = await import('../models/trip.model.js');
  const trip = await Trip.findByIdAndUpdate(tripId,
    { status: 'in_progress', startTime: new Date() }, { new: true });
  if (!trip) return;

  io.to(trip.rider.toString()).emit('trip_started', {
    tripId, status: 'in_progress'
  });
  io.to('admin_room').emit('trip_started', { tripId });
});

// Driver pressed "End Trip"
socket.on('complete_trip', async ({ tripId }) => {
  const { Trip } = await import('../models/trip.model.js');
  const trip = await Trip.findByIdAndUpdate(tripId,
    { status: 'completed', endTime: new Date() }, { new: true });
  if (!trip) return;

  // unlock both parties
  const { User } = await import('../models/user.model.js');
  await User.findByIdAndUpdate(trip.rider, { isRiding: false });
  await User.findByIdAndUpdate(trip.driver, { isRiding: false });

  io.to(trip.rider.toString()).emit('trip_completed', {
    tripId, status: 'completed', fare: trip.fare
  });
  io.to('admin_room').emit('trip_completed', { tripId });
});
    })
}

// Emit to any specific user by their userId room
export const emitToUser = (userId, event, data) => {
    if (io && userId) {
        const target = userId.toString();
        console.log(`📡 Sending [${event}] to User Room: ${target}`);
        io.to(target).emit(event, data);
    }
};

// Emit to admin room — used when a new ride is requested
export const emitToAdmin = (event, data) => {
    if (io) {
        console.log(`📡 Sending [${event}] to Admin Room`);
        io.to("admin_room").emit(event, data);
    }
};

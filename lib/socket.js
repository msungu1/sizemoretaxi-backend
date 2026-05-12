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

            if (role === "driver") socket.join("drivers_room");
            if (role === "admin") socket.join("admin_room");

            console.log(`⚡ Connected: ${userId} (${role})`);
        }

        // Driver sends location updates while trip is in progress
        socket.on("driver_location_update", async (data) => {
            const lat = data.lat;
            const lng = data.lng;
            const driverId = data.driverId || userId;

            if (!driverId) return;

            if (!mongoose.Types.ObjectId.isValid(driverId)) {
                console.log("❌ Invalid driverId:", driverId);
                return;
            }

            driverLocations.set(driverId, { lat, lng, lastSeen: Date.now() });

            const { Trip } = await import("../models/trip.model.js");

            const activeTrips = await Trip.find({
                driver: driverId,
                status: "in_progress"
            });

            for (const trip of activeTrips) {
                // Notify rider of driver's location
                io.to(trip.rider.toString()).emit("driver_location_update", {
                    tripId: trip._id,
                    location: { lat, lng }
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
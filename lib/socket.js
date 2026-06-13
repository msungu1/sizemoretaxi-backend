// import mongoose from "mongoose";
// import { Server } from "socket.io"

// export const onlineUsers = new Map()
// export const driverLocations = new Map();
// export let io = null

// export const initSocket = (server) => {
//     io = new Server(server, {
//         cors: { origin: "*", credentials: true }
//     })

//     io.on("connection", (socket) => {
//         let userId = socket.handshake.query.userId?.toString();
//         const role = socket.handshake.query.role;

//         if (userId) {
//             onlineUsers.set(userId, socket.id);
//             socket.join(userId);

//             // if (role === "driver") socket.join("drivers_room");
//             // if (role === "admin") socket.join("admin_room");
//             // 🚀 CRITICAL: Ensure this matches the room used in emitToAdmin
//         if (role === "driver") {
//             socket.join("drivers_room");
//             console.log(`🚕 Driver Joined Room: ${userId}`);
//         }
        
//         if (role === "admin") {
//             socket.join("admin_room"); // 👈 This must match exactly
//             console.log(`👨‍💼 Admin Joined Room: ${userId}`);
//         }

//             console.log(`⚡ Connected: ${userId} (${role})`);
//         }
// socket.on("ride_cancelled", async ({ tripId }) => {
//     console.log(`Socket: ride_cancelled received for ${tripId}`);
//     // The HTTP endpoint handles the actual DB update
//     // This just logs it — HTTP cancel endpoint does the real work
// });
//         // Driver sends location updates while trip is in progress
//         socket.on("driver_location_update", async (data) => {
//             const lat = data.lat;
//             const lng = data.lng;
//             const driverId = data.driverId || userId;

//             if (!driverId) return;

//             if (!mongoose.Types.ObjectId.isValid(driverId)) {
//                 console.log(" Invalid driverId:", driverId);
//                 return;
//             }

// driverLocations.set(driverId, {
//     lat,
//     lng,
//     heading: data.heading || 0,
//     speed: data.speed || 0,
//     updatedAt: new Date(),
// });

// // SAVE LIVE LOCATION TO DATABASE
// const { User } = await import("../models/user.model.js");

// await User.findByIdAndUpdate(driverId, {
//     currentLocation: {
//         lat,
//         lng,
//         heading: data.heading || 0,
//         speed: data.speed || 0,
//         updatedAt: new Date(),
//     }
// });
//             const { Trip } = await import("../models/trip.model.js");

//             const activeTrips = await Trip.find({
//                 driver: driverId,
//                 status: "in_progress"
//             });

//             for (const trip of activeTrips) {

//                 // Notify rider of driver's location
//                 io.to(trip.rider.toString()).emit("driver_location_update", {
//                     tripId: trip._id,
//                      lat,
//                      lng,
//                 });

//                 // Also keep admin updated on driver location during active trip
//                 io.to("admin_room").emit("driver_location_update", {
//                     tripId: trip._id,
//                     driverId,
//                     location: { lat, lng }
//                 });
//             }
//         });

//         socket.on("disconnect", () => {
//             if (userId) {
//                 onlineUsers.delete(userId);
//                 driverLocations.delete(userId);
//                 console.log(`🔌 Disconnected: ${userId}`);
//             }
//         });

// socket.on("accept_ride", async ({ tripId, driverId }) => {
//     try {

//         const { Trip } = await import("../models/trip.model.js");

//         const trip = await Trip.findById(tripId)
//             .populate("driver")
//             .populate("rider");

//         if (!trip) return;

//         // prevent duplicate acceptance
//         if (trip.status === "accepted") return;

//         trip.status = "accepted";

//         // ensure driver exists
//         if (driverId) {
//             trip.driver = driverId;
//         }

//         await trip.save();

//         // reload populated driver
//         const updatedTrip = await Trip.findById(tripId)
//             .populate("driver")
//             .populate("rider");

//         // 🚀 SEND FULL DATA TO PASSENGER
//         io.to(updatedTrip.rider._id.toString()).emit(
//             "ride_accepted_by_driver",
//             {
//                 tripId: updatedTrip._id,
//                 status: "accepted",

//                 driver: {
//                     id: updatedTrip.driver._id,
//                     name: updatedTrip.driver.name,
//                     phone: updatedTrip.driver.phone,
//                     carModel: updatedTrip.driver.carModel,
//                     carNumber: updatedTrip.driver.carNumber,
//                 },

//                 pickupLocation: updatedTrip.pickupLocation,
//                 dropoffLocation: updatedTrip.dropoffLocation,
//                 fare: updatedTrip.fare,
//             }
//         );

//         // notify admin
//         io.to("admin_room").emit(
//             "ride_accepted_by_driver",
//             {
//                 tripId,
//                 driverId: updatedTrip.driver._id,
//             }
//         );

//         console.log("✅ Driver accepted trip:", tripId);

//     } catch (err) {
//         console.log("❌ accept_ride error:", err);
//     }
// });


// socket.on("join_trip", ({ tripId }) => {
//     socket.join(`trip_${tripId}`);
//     console.log(`Joined trip room ${tripId}`);
// });

// socket.on("leave_trip", ({ tripId }) => {
//     socket.leave(`trip_${tripId}`);
//     console.log(`Left trip room ${tripId}`);
// });

// socket.on("reject_ride", async ({ tripId, reason }) => {
//     try {

//         const { Trip } = await import("../models/trip.model.js");

//         const trip = await Trip.findById(tripId);

//         if (!trip) return;

//         trip.status = "rejected";

//         await trip.save();

//         io.to(trip.rider.toString()).emit("ride_rejected", {
//             tripId,
//             status: "rejected",
//             reason: reason || "No drivers available"
//         });

//         console.log("❌ Ride rejected");
//     } catch (err) {
//         console.log(err);
//     }
// });

// socket.on("admin_reject_ride", async ({ tripId, reason }) => {
//     try {
//         const { Trip } = await import("../models/trip.model.js");

//         const trip = await Trip.findById(tripId);
//         if (!trip) return;

//         trip.status = "cancelled";
//         trip.cancellationReason = reason || "Rejected by admin";

//         await trip.save();

//         // notify rider
//         io.to(trip.rider.toString()).emit("ride_rejected", {
//             tripId,
//             reason: trip.cancellationReason,
//             status: "rejected"
//         });

//         console.log("❌ Admin rejected ride:", tripId);
//     } catch (err) {
//         console.log(err);
//     }
// });
// socket.on("register", ({ userId, role }) => {
//     if (!userId) return;

//     onlineUsers.set(userId, socket.id);
//     socket.join(userId);

//     if (role === "driver") socket.join("drivers_room");
//     if (role === "admin") socket.join("admin_room");

//     console.log("📌 REGISTERED:", userId, role);
// });

// // Driver pressed "I Have Arrived"
// socket.on('driver_arrived', async ({ tripId }) => {
//   const { Trip } = await import('../models/trip.model.js');
//   const trip = await Trip.findByIdAndUpdate(tripId,
//     { status: 'arrived' }, { new: true });
//   if (!trip) return;

//   // notify rider
//   io.to(trip.rider.toString()).emit('status_update', {
//     tripId, status: 'arrived'
//   });
// });

// // Driver pressed "Start Trip"
// socket.on('start_trip', async ({ tripId }) => {
//   const { Trip } = await import('../models/trip.model.js');
//   const trip = await Trip.findByIdAndUpdate(tripId,
//     { status: 'in_progress', startTime: new Date() }, { new: true });
//   if (!trip) return;

//   io.to(trip.rider.toString()).emit('trip_started', {
//     tripId, status: 'in_progress'
//   });
//   io.to('admin_room').emit('trip_started', { tripId });
// });

// // Driver pressed "End Trip"

// socket.on('complete_trip', async ({ tripId, driverId }) => {
//   try {
//     const { Trip } = await import('../models/trip.model.js');

//     // 1. Find trip first
//     const trip = await Trip.findById(tripId);
//     if (!trip) return;

//     // 2. SECURITY: only assigned driver can complete trip
//     const assignedDriverId = trip.driver?.toString();
//     if (assignedDriverId !== driverId) return;

//     // 3. Complete trip
//     const updatedTrip = await Trip.findByIdAndUpdate(
//       tripId,
//       {
//         status: 'completed',
//         endTime: new Date()
//       },
//       { new: true }
//     );

//     if (!updatedTrip) return;

//     const { User } = await import('../models/user.model.js');

//     const riderId = updatedTrip.rider?.toString();
//     const finalDriverId = updatedTrip.driver?.toString();

//     // 4. Unlock both users
//     await User.findByIdAndUpdate(riderId, { isRiding: false });
//     await User.findByIdAndUpdate(finalDriverId, { isRiding: false });

//     // 5. Emit to rider
//     io.to(riderId).emit('trip_completed', {
//       tripId,
//       status: 'completed',
//       fare: updatedTrip.fare,
//       distance: updatedTrip.distance || 0
//     });

//     // 6. Emit to driver (optional but useful)
//     io.to(finalDriverId).emit('trip_completed', {
//       tripId,
//       status: 'completed',
//       fare: updatedTrip.fare,
//       distance: updatedTrip.distance || 0
//     });

//     // 7. Emit to admin
//     io.to('admin_room').emit('trip_completed', {
//       tripId,
//       fare: updatedTrip.fare,
//       distance: updatedTrip.distance || 0
//     });

//   } catch (error) {
//     console.error('❌ complete_trip error:', error);
//   }
// });

//     })
// }

// // Emit to any specific user by their userId room
// export const emitToUser = (userId, event, data) => {
//     if (io && userId) {
//         const target = userId.toString();
//         console.log(`📡 Sending [${event}] to User Room: ${target}`);
//         io.to(target).emit(event, data);
//     }
// };

// // Emit to admin room — used when a new ride is requested
// export const emitToAdmin = (event, data) => {
//     if (io) {
//         console.log(`📡 Sending [${event}] to Admin Room`);
//         io.to("admin_room").emit(event, data);
//     }
// };
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
                // Safe room identifier generation
                const riderRoom = trip.rider?._id ? trip.rider._id.toString() : trip.rider.toString();

                // Notify rider of driver's location
                io.to(riderRoom).emit("driver_location_update", {
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
        socket.on('complete_trip', async ({ tripId, driverId }) => {
            try {
                const { Trip } = await import('../models/trip.model.js');

                const trip = await Trip.findById(tripId);
                if (!trip) return;

                const assignedDriverId = trip.driver?.toString();
                if (assignedDriverId !== driverId) return;

                const updatedTrip = await Trip.findByIdAndUpdate(
                    tripId,
                    { status: 'completed', endTime: new Date() },
                    { new: true }
                );

                if (!updatedTrip) return;

                const { User } = await import('../models/user.model.js');

                const riderId = updatedTrip.rider?.toString();
                const finalDriverId = updatedTrip.driver?.toString();

                await User.findByIdAndUpdate(riderId, { isRiding: false });
                await User.findByIdAndUpdate(finalDriverId, { isRiding: false });

                io.to(riderId).emit('trip_completed', {
                    tripId,
                    status: 'completed',
                    fare: updatedTrip.fare,
                    distance: updatedTrip.distance || 0
                });

                io.to(finalDriverId).emit('trip_completed', {
                    tripId,
                    status: 'completed',
                    fare: updatedTrip.fare,
                    distance: updatedTrip.distance || 0
                });

                io.to('admin_room').emit('trip_completed', {
                    tripId,
                    fare: updatedTrip.fare,
                    distance: updatedTrip.distance || 0
                });

            } catch (error) {
                console.error('❌ complete_trip error:', error);
            }
        });
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
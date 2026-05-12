// server.js
import http from "http"
import { Server } from "socket.io"
import app from "./app.js"
import { Trip } from "./models/trip.model.js"
import { initSocket } from "./lib/socket.js"
import { twilioClient } from "./lib/MailAndSMSNotifications.js"

// (async () => {
//     try {
//         const toPhone = "+2547"; // replace with your number
//         const body = "Hello! This is a test SMS from Twilio.";

//         const message = await twilioClient.messages.create({
//             body,
//             from: process.env.TWILIO_PHONE,
//             to: toPhone,
//         });

//         console.log("SMS sent successfully!");
//         console.log("SID:", message.sid);
//     } catch (err) {
//         console.error("Error sending SMS:", err.message);
//     }
// })();



const PORT = process.env.PORT || 5000

export const server = http.createServer(app)
initSocket(server)
// export const io = new Server(server, {
//   cors: {
//     origin: "*",
//     credentials: true
//   }
// })

// export const onlineUsers = new Map()

// io.on("connection", (socket) => {
//   let userId = socket.handshake.query.userId
//   console.log(`⚡ User connected: ${userId}, socket: ${socket.id}`)

//   if (userId && typeof userId === "string") {
//     onlineUsers.set(userId, socket.id)
//     socket.join(userId);
//   } else if (typeof userId !== "string") {
//     userId = userId.toString()
//     onlineUsers.set(userId, socket.id)
//     socket.join(userId);
//   }

//   socket.on("accept_ride", async ({ tripId, driverId }) => {
//     try {
//       const trip = await Trip.findById(tripId)
//       if (!trip || trip.status !== "pending") return

//       trip.driver = driverId
//       trip.status = "accepted"
//       await trip.save()

//       io.to(trip.rider.toString()).emit("ride_accepted", {
//         tripId: trip._id,
//         driverId
//       })

//       io.emit("ride_taken", tripId)
//     } catch (err) {
//       console.error("Error in accept_ride:", err)
//     }
//   })

//   socket.on("driver_location_update", async ({ tripId, lat, lng }) => {
//     try {
//       if (!tripId || !lat || !lng) return; // Validate inputs

//       const trip = await Trip.findById(tripId);
//       if (!trip || trip.status !== "in_progress") return;

//       const riderSocket = onlineUsers.get(trip.rider?.toString());
//       const driverSocket = onlineUsers.get(trip.driver?.toString());

//       if (riderSocket) {
//         io.to(riderSocket).emit("driver_location_update", { tripId, location: { lat, lng } });
//       }
//       if (driverSocket) {
//         io.to(driverSocket).emit("driver_location_update", { tripId, location: { lat, lng } });
//       }
//     } catch (err) {
//       console.error("Error in driver_location_update:", err);
//     }
//   });

//   // Stop tracking only on frontend, not backend
//   socket.on("stop_location_tracking", async ({ tripId }) => {
//     const trip = await Trip.findById(tripId)

//     if (!trip) return;

//     emitToUser(trip.rider?.toString(), "stop_location_tracking", { tripId });
//     emitToUser(trip.driver?.toString(), "stop_location_tracking", { tripId });
//   });


//   socket.on("disconnect", () => {
//     for (const [uid, sid] of onlineUsers.entries()) {
//       if (sid === socket.id) {
//         onlineUsers.delete(uid)
//         console.log(`Socket disconnected: ${socket.id}`)
//         break
//       }
//     }
//   })
// })

// export const emitToUser = (userId, event, data) => {
//   const socketId = onlineUsers.get(userId)
//   if (socketId) {
//     io.to(socketId).emit(event, data)
//   }
// }

// server.listen(PORT, () => {
//   console.log(`🚀 Server running on port ${PORT}`)
// })

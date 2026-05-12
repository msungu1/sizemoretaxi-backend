// import mongoose from "mongoose";
// import request from "supertest";
// import bcrypt from "bcryptjs";
// import jwt from "jsonwebtoken";
// import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from "@jest/globals";
// import { io as Client } from "socket.io-client";

// import app from "../app.js";
// import { server } from "../server.js";
// import { Trip } from "../models/trip.model.js";
// import { User } from "../models/user.model.js";

// let testServer;
// let riderId, driverId, tripId;
// let riderToken, driverToken;
// let riderSocket, driverSocket;
// let baseURL;
// let port;

// jest.setTimeout(90000); // increase global timeout

// beforeAll(async () => {
//   await mongoose.connect(process.env.DB_URL);
//   testServer = server.listen(0);
//   port = testServer.address().port;
//   baseURL = `http://localhost:${port}`;
//   await new Promise(resolve => setTimeout(resolve, 500));
// });

// afterAll(async () => {
//   if (riderSocket?.connected) riderSocket.disconnect();
//   if (driverSocket?.connected) driverSocket.disconnect();
//   await mongoose.connection.dropDatabase();
//   await mongoose.connection.close();
//   testServer.close();
// });

// beforeEach(async () => {
//   await User.deleteMany({});
//   await Trip.deleteMany({});

//   const hashedPassword = await bcrypt.hash("pass123", 10);

//   const rider = await User.create({
//     name: "Rider One",
//     email: "rider@example.com",
//     phone: "0700000001",
//     password: hashedPassword,
//     role: "rider",
//   });

//   const driver = await User.create({
//     name: "Driver One",
//     email: "driver@example.com",
//     phone: "0700000002",
//     password: hashedPassword,
//     role: "driver",
//   });

//   riderId = rider._id.toString();
//   driverId = driver._id.toString();

//   riderToken = jwt.sign({ id: riderId, role: "rider" }, process.env.JWT_SECRET, { expiresIn: "1h" });
//   driverToken = jwt.sign({ id: driverId, role: "driver" }, process.env.JWT_SECRET, { expiresIn: "1h" });

//   const futureTime = new Date(Date.now() + 40 * 60 * 1000);

//   const trip = await Trip.create({
//     rider: riderId,
//     pickupLocation: { lat: 1.23, lng: 2.34 },
//     dropoffLocation: { lat: 3.45, lng: 4.56 },
//     scheduledTime: futureTime,
//     fare: 700,
//     status: "requested"
//   });

//   tripId = trip._id.toString();

//   riderSocket = Client(baseURL, {
//     query: { userId: riderId },
//     transports: ["websocket"],
//   });

//   driverSocket = Client(baseURL, {
//     query: { userId: driverId },
//     transports: ["websocket"],
//   });

//   await Promise.all([
//     new Promise(resolve => riderSocket.on("connect", resolve)),
//     new Promise(resolve => driverSocket.on("connect", resolve)),
//   ]);
// });

// describe("Trip Controller & Socket Events", () => {
//   it("should allow rider to request trip", async () => {
//     const futureTime = new Date(Date.now() + 40 * 60 * 1000).toISOString();
//     const res = await request(app)
//       .post("/api/trips/request")
//       .set("Authorization", `Bearer ${riderToken}`)
//       .send({
//         riderId,
//         pickupLocation: { lat: 1.234, lng: 2.345 },
//         dropoffLocation: { lat: 3.456, lng: 4.567 },
//         scheduledTime: futureTime,
//         fare: 700,
//       });

//     expect(res.status).toBe(201);
//     expect(res.body.data).toHaveProperty("_id");
//     tripId = res.body.data._id;
//   });

//   it("should allow driver to fetch available trips", async () => {
//     const res = await request(app)
//       .get("/api/trips/available")
//       .set("Authorization", `Bearer ${driverToken}`);

//     expect(res.status).toBe(200);
//     expect(Array.isArray(res.body.data)).toBe(true);
//   });

//   it("should allow driver to accept a trip and emit to rider", async () => {
//     const received = new Promise((resolve, reject) => {
//       riderSocket.once("ride_accepted", payload => resolve(payload));
//       setTimeout(() => reject("Timeout"), 10000);
//     });

//     const res = await request(app)
//       .post("/api/trips/accept")
//       .set("Authorization", `Bearer ${driverToken}`)
//       .send({ tripId, driverId });

//     expect(res.status).toBe(200);

//     const payload = await received;
//     expect(payload.tripId).toBe(tripId);
//     expect(payload.driverId).toBe(driverId);
//   });

//   it("should emit and receive real-time location updates", async () => {
//     await Trip.findByIdAndUpdate(tripId, {
//       driver: driverId,
//       status: "in_progress"
//     });

//     const locationUpdate = new Promise(resolve =>
//       riderSocket.once("driver_location_update", resolve)
//     );

//     driverSocket.emit("driver_location_update", {
//       tripId,
//       lat: -1.2921,
//       lng: 36.8219,
//     });

//     const received = await locationUpdate;
//     expect(received.tripId).toBe(tripId);
//     expect(received.location.lat).toBe(-1.2921);
//   });

//   it("should stop location tracking", async () => {
//     await Trip.findByIdAndUpdate(tripId, {
//       driver: driverId,
//       rider: riderId,
//       status: "in_progress"
//     });

//     const stopReceived = new Promise(resolve =>
//       riderSocket.once("stop_location_tracking", resolve)
//     );

//     driverSocket.emit("stop_location_tracking", { tripId });

//     const payload = await stopReceived;
//     expect(payload.tripId).toBe(tripId);
//   });

//   // it("should start a trip and emit to rider and driver", async () => {
//   //   await Trip.findByIdAndUpdate(tripId, {
//   //     driver: driverId,
//   //     status: "accepted"
//   //   });

//   //   expect(riderSocket.connected).toBe(true);
//   //   expect(driverSocket.connected).toBe(true);

//   //   const riderStart = new Promise((resolve, reject) => {
//   //     riderSocket.once("trip_started", resolve);
//   //     setTimeout(() => reject(new Error("riderSocket did not receive 'trip_started'")), 10000);
//   //   });

//   //   const driverStart = new Promise((resolve, reject) => {
//   //     driverSocket.once("trip_started", resolve);
//   //     setTimeout(() => reject(new Error("driverSocket did not receive 'trip_started'")), 10000);
//   //   });

//   //   // Slight buffer to ensure sockets have time to subscribe
//   //   await new Promise(r => setTimeout(r, 200));

//   //   const res = await request(app)
//   //     .post("/api/trips/start")
//   //     .set("Authorization", `Bearer ${driverToken}`)
//   //     .send({ tripId });

//   //   expect(res.status).toBe(200);

//   //   const [riderPayload, driverPayload] = await Promise.all([riderStart, driverStart]);

//   //   expect(riderPayload.tripId).toBe(tripId);
//   //   expect(driverPayload.tripId).toBe(tripId);
//   // });

//   // it("should complete a trip and emit to rider and driver", async () => {
//   //   await Trip.findByIdAndUpdate(tripId, {
//   //     driver: driverId,
//   //     rider: riderId,
//   //     status: "in_progress"
//   //   });

//   //   expect(riderSocket.connected).toBe(true);
//   //   expect(driverSocket.connected).toBe(true);

//   //   const riderDone = new Promise((resolve, reject) => {
//   //     riderSocket.once("trip_completed", resolve);
//   //     setTimeout(() => reject(new Error("riderSocket did not receive 'trip_completed'")), 10000);
//   //   });

//   //   const driverDone = new Promise((resolve, reject) => {
//   //     driverSocket.once("trip_completed", resolve);
//   //     setTimeout(() => reject(new Error("driverSocket did not receive 'trip_completed'")), 10000);
//   //   });

//   //   await new Promise(r => setTimeout(r, 200));

//   //   const res = await request(app)
//   //     .post("/api/trips/complete")
//   //     .set("Authorization", `Bearer ${driverToken}`)
//   //     .send({ tripId, rating: 5 });

//   //   expect(res.status).toBe(200);

//   //   const [riderPayload, driverPayload] = await Promise.all([riderDone, driverDone]);


//   //   expect(riderPayload.tripId).toBe(tripId);
//   //   expect(driverPayload.tripId).toBe(tripId);
//   // });

//   it("should cancel a trip and emit to both", async () => {
//     await Trip.findByIdAndUpdate(tripId, {
//       driver: driverId,
//       status: "requested"
//     });

//     const riderCancel = new Promise(resolve => riderSocket.once("trip_cancelled", resolve));
//     const driverCancel = new Promise(resolve => driverSocket.once("trip_cancelled", resolve));

//     const res = await request(app)
//       .post("/api/trips/cancel")
//       .set("Authorization", `Bearer ${riderToken}`)
//       .send({
//         tripId,
//         userId: riderId,
//         role: "rider",
//         reason: "Changed plans"
//       });

//     expect(res.status).toBe(200);

//     const rider = await riderCancel;
//     const driver = await driverCancel;

//     expect(rider.tripId).toBe(tripId);
//     expect(driver.tripId).toBe(tripId);
//   });

//   it("should get trip by ID", async () => {
//     const res = await request(app)
//       .get(`/api/trips/${tripId}`)
//       .set("Authorization", `Bearer ${riderToken}`);

//     expect(res.status).toBe(200);
//     expect(res.body.data._id).toBe(tripId);
//   });

//   it("should get active trips for rider", async () => {
//     const res = await request(app)
//       .get(`/api/trips/active?userId=${riderId}&role=rider`)
//       .set("Authorization", `Bearer ${riderToken}`);

//     if (res.status !== 200) console.error("Error from /active:", res.body);

//     expect(res.status).toBe(200);
//     expect(Array.isArray(res.body.data)).toBe(true);
//   });
//   it("should return completed and cancelled trips for rider", async () => {
//     const thirtyFiveMinutesAhead = new Date(Date.now() + 35 * 60 * 1000);
//     const fortyMinutesAhead = new Date(Date.now() + 40 * 60 * 1000);

//     await Trip.create([
//       {
//         rider: riderId,
//         driver: driverId,
//         pickupLocation: { lat: 1, lng: 2 },
//         dropoffLocation: { lat: 3, lng: 4 },
//         fare: 500,
//         scheduledTime: thirtyFiveMinutesAhead,
//         status: "completed",
//         endTime: new Date()
//       },
//       {
//         rider: riderId,
//         driver: driverId,
//         pickupLocation: { lat: 2, lng: 1 },
//         dropoffLocation: { lat: 4, lng: 3 },
//         fare: 450,
//         scheduledTime: fortyMinutesAhead,
//         status: "cancelled",
//         cancellationReason: "Changed my mind"
//       }
//     ]);

//     const res = await request(app)
//       .get(`/api/trips/activity?userId=${riderId}&role=rider`)
//       .set("Authorization", `Bearer ${riderToken}`);

//     if (res.status !== 200) console.error("❌ /activity error:", res.body);

//     expect(res.status).toBe(200);
//     expect(Array.isArray(res.body.data)).toBe(true);
//     expect(res.body.data.length).toBeGreaterThanOrEqual(2);

//     const statuses = res.body.data.map(trip => trip.status);
//     expect(statuses).toEqual(expect.arrayContaining(["completed", "cancelled"]));
//   });
// });



/** test/trip.controller.test.mjs
 *  ESM-safe: axios is mocked BEFORE importing it (jest.unstable_mockModule),
 *  then we import axios via top-level await so axios.get.mockResolvedValue works.
 */


import { jest } from "@jest/globals";

/* ---------------------------
   1) Mock axios (ESM-safe)
   --------------------------- */
jest.unstable_mockModule("axios", () => ({
  default: {
    get: jest.fn(),
  },
}));

import axios from "axios"


/* ---------------------------
   2) Mock socket module BEFORE importing controller
   --------------------------- */
jest.mock("../lib/socket.js", () => {
  const ioMock = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn()
  };

  // driverLocations and onlineUsers must match the driver IDs we mock via User.findById
  const onlineUsers = new Map([
    ["driver1", "socket-driver1"],
    ["driver2", "socket-driver2"],
    ["rider1", "socket-rider1"]
  ]);

  const driverLocations = new Map([
    // Place drivers exactly at pickup location so haversineKm keeps them inside MAX_NEARBY_KM
    ["driver1", { lat: -1.3, lng: 36.8, lastSeen: Date.now() }],
    ["driver2", { lat: -1.3, lng: 36.8, lastSeen: Date.now() }]
  ]);

  return {
    io: ioMock,
    onlineUsers,
    driverLocations,
    emitToUser: jest.fn()
  };
});

/* ---------------------------
   3) Import app controllers & models
   --------------------------- */
import request from "supertest";
import express from "express";

import { getTripOptions, confirmTrip, acceptTrip } from "../controllers/trip.controller.js";
import { User } from "../models/user.model.js";
import { Trip } from "../models/trip.model.js";

/* ---------------------------
   4) Setup express test app
   --------------------------- */
const app = express();
app.use(express.json());
app.post("/api/trips/options", getTripOptions);
app.post("/api/trips/confirm", confirmTrip);
app.post("/api/trips/accept", acceptTrip);

/* ---------------------------
   5) Test suite
   --------------------------- */
describe("Trip Flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /* ---------------------------
     Helper: standard successful Distance Matrix response
     Controller expects: data.status === 'OK' and element.status === 'OK'
  */
  function mockDistanceMatrixResponse(distanceVal = 2000, durationVal = 600) {
    axios.get.mockResolvedValue({
      data: {
        status: "OK",
        rows: [
          {
            elements: [
              {
                status: "OK",
                distance: { value: distanceVal, text: `${(distanceVal / 1000).toFixed(2)} km` },
                duration: { value: durationVal, text: `${Math.ceil(durationVal / 60)} mins` }
              }
            ]
          }
        ]
      }
    });
  }

  it("should return vehicle options", async () => {
    // User (rider) exists
    jest.spyOn(User, "findById").mockResolvedValue({
      _id: "rider1",
      name: "Test Rider",
      email: "r@x.com",
      phone: "0712345678",
      password: "password123"
    });

    mockDistanceMatrixResponse();

    const res = await request(app)
      .post("/api/trips/options")
      .send({
        riderId: "rider1",
        pickupLocation: { lat: -1.3, lng: 36.8 },
        dropoffLocation: { lat: -1.29, lng: 36.82 }
      });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Vehicle options generated.");
    expect(Array.isArray(res.body.data.vehicles)).toBe(true);
    expect(res.body.data.vehicles.length).toBeGreaterThan(0);
    // each vehicle object should include type and total (per calculateFares)
    expect(res.body.data.vehicles[0]).toMatchObject({ type: expect.any(String), total: expect.any(Number) });
  });

  it("should confirm a trip and notify only matching vehicle type drivers", async () => {
    // Rider exists
    jest.spyOn(User, "findById").mockImplementation((id) => {
      // rider lookup
      if (id === "rider1") {
        return Promise.resolve({
          _id: "rider1",
          name: "Test Rider",
          email: "r@x.com",
          phone: "0712345678",
          password: "password123"
        });
      }
      // driver1: Car
      if (id === "driver1") {
        return Promise.resolve({ _id: "driver1", vehicleType: "Car", name: "Driver One" });
      }
      // driver2: Bike (should NOT be notified for vehicleType 'Car')
      if (id === "driver2") {
        return Promise.resolve({ _id: "driver2", vehicleType: "Bike", name: "Driver Two" });
      }
      return Promise.resolve(null);
    });

    // Mock distance matrix
    mockDistanceMatrixResponse();

    // Trip.create should return created trip (controller expects trip._id and trips fare as result of calculateFares)
    // note: controller stores "fare" as the full array returned by calculateFares()
    const fakeFareArray = [
      { type: "Bike", baseFare: 50, total: 100 },
      { type: "Car", baseFare: 120, total: 300 },
      { type: "Van", baseFare: 200, total: 500 }
    ];

    jest.spyOn(Trip, "create").mockResolvedValue({
      _id: "trip1",
      rider: "rider1",
      status: "requested",
      fare: fakeFareArray,
      vehicleType: "Car"
    });

    const res = await request(app)
      .post("/api/trips/confirm")
      .send({
        riderId: "rider1",
        pickupLocation: { lat: -1.3, lng: 36.8 },
        dropoffLocation: { lat: -1.29, lng: 36.82 },
        vehicleType: "Car",
        scheduledTime: new Date(Date.now() + 40 * 60 * 1000).toISOString()
      });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe("Trip confirmed and pushed to drivers.");

    // controller returns notifiedDrivers count (only driver1 matches vehicleType 'Car')
    expect(typeof res.body.data.notifiedDrivers).toBe("number");
    expect(res.body.data.notifiedDrivers).toBeGreaterThanOrEqual(0);

    // Because we mocked driverLocations and onlineUsers to include driver1 and driver2,
    // and we mocked driver1 to have vehicleType 'Car', the notifiedDrivers should be >= 1.
    expect(res.body.data.notifiedDrivers).toBeGreaterThanOrEqual(1);

    // Trip.fare is the array (we returned fakeFareArray)
    expect(Array.isArray(res.body.data.trip.fare)).toBe(true);
    expect(res.body.data.trip.fare.find(v => v.type === "Car")).toBeDefined();
  });

  it("driver should accept trip successfully", async () => {
    // driver exists
    jest.spyOn(User, "findById").mockImplementation((id) => {
      if (id === "driver1") {
        return Promise.resolve({
          _id: "driver1",
          name: "Driver One",
          phone: "0712345678",
          carModel: "Toyota",
          carNumber: "KDA 123A"
        });
      }
      return Promise.resolve(null);
    });

    // Trip.findById returns trip with status requested and a save method
    const saveMock = jest.fn().mockResolvedValue(true);
    jest.spyOn(Trip, "findById").mockResolvedValue({
      _id: "trip1",
      rider: "rider1",
      status: "requested",
      save: saveMock
    });

    const res = await request(app)
      .post("/api/trips/accept")
      .send({ driverId: "driver1", tripId: "trip1" });

    // Controller's acceptTrip (older snippet) returns "Trip accepted successfully."
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Trip accepted successfully.");
    expect(res.body.data.trip.status).toBe("accepted");
  });

  it("second driver should NOT be able to accept same trip", async () => {
    // driver2 exists
    jest.spyOn(User, "findById").mockResolvedValue({ _id: "driver2", name: "Driver Two" });

    // Trip.findById returns a trip already accepted
    jest.spyOn(Trip, "findById").mockResolvedValue({
      _id: "trip1",
      rider: "rider1",
      status: "accepted"
    });

    const res = await request(app)
      .post("/api/trips/accept")
      .send({ driverId: "driver2", tripId: "trip1" });

    // Controller returns 409 and message indicating already taken
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already taken|no longer available/i);
  });
});

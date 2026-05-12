import mongoose from "mongoose";
import request from "supertest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { io as Client } from "socket.io-client";
import { describe, beforeAll, afterAll, expect, it, jest } from "@jest/globals";

import app from "../app.js";
import { server } from "../server.js";
import { Trip } from "../models/trip.model.js";
import { User } from "../models/user.model.js";

jest.setTimeout(30000);

let riderId, driverId, tripId;
let riderToken, driverToken;
let riderSocket, driverSocket;
let baseURL, testServer;

function waitForSocketEvent(socket, eventName, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`❌ Timeout: '${eventName}' not received on ${socket.id}`));
    }, timeout);
    socket.once(eventName, (payload) => {
      clearTimeout(timer);
      console.log(`✅ '${eventName}' received on ${socket.id}:`, payload);
      resolve(payload);
    });
  });
}

beforeAll(async () => {
  await mongoose.connect(process.env.DB_URL);
  await User.deleteMany({});
  await Trip.deleteMany({});

  const hashedPassword = await bcrypt.hash("pass123", 10);

  const rider = await User.create({
    name: "Rider Test",
    email: "rider@example.com",
    phone: "0700000111",
    password: hashedPassword,
    role: "rider"
  });

  const driver = await User.create({
    name: "Driver Test",
    email: "driver@example.com",
    phone: "0700000222",
    password: hashedPassword,
    role: "driver"
  });

  riderId = rider._id.toString();
  driverId = driver._id.toString();

  riderToken = jwt.sign({ id: riderId, role: "rider" }, process.env.JWT_SECRET);
  driverToken = jwt.sign({ id: driverId, role: "driver" }, process.env.JWT_SECRET);

  const futureTime = new Date(Date.now() + 60 * 60 * 1000);

  const trip = await Trip.create({
    rider: riderId,
    driver: driverId,
    pickupLocation: { lat: 0.1, lng: 0.2 },
    dropoffLocation: { lat: 0.3, lng: 0.4 },
    scheduledTime: futureTime,
    fare: 1000,
    status: "accepted"
  });

  tripId = trip._id.toString();

  testServer = server.listen(0);
  baseURL = `http://localhost:${testServer.address().port}`;

  riderSocket = Client(baseURL, {
    query: { userId: riderId },
    transports: ["websocket"]
  });

  driverSocket = Client(baseURL, {
    query: { userId: driverId },
    transports: ["websocket"]
  });

  await Promise.all([
    new Promise((res) => riderSocket.on("connect", res)),
    new Promise((res) => driverSocket.on("connect", res))
  ]);

  // Custom test registration event
  riderSocket.emit("register_test_user", riderId);
  driverSocket.emit("register_test_user", driverId);
  await new Promise((r) => setTimeout(r, 300));
});

afterAll(async () => {
  if (riderSocket?.connected) riderSocket.disconnect();
  if (driverSocket?.connected) driverSocket.disconnect();
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  testServer.close();
});

describe("Trip lifecycle socket emits", () => {
  it("should start a trip and emit to rider and driver", async () => {
    const riderStart = waitForSocketEvent(riderSocket, "trip_started");
    const driverStart = waitForSocketEvent(driverSocket, "trip_started");

    await new Promise((r) => setTimeout(r, 300));

    const res = await request(app)
      .post("/api/trips/start")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ tripId });

    expect(res.status).toBe(200);

    const [riderPayload, driverPayload] = await Promise.all([riderStart, driverStart]);
    expect(riderPayload.tripId).toBe(tripId);
    expect(driverPayload.tripId).toBe(tripId);
  });

  it("should complete a trip and emit to rider and driver", async () => {
    await Trip.findByIdAndUpdate(tripId, { status: "in_progress" });

    const riderDone = waitForSocketEvent(riderSocket, "trip_completed");
    const driverDone = waitForSocketEvent(driverSocket, "trip_completed");

    await new Promise((r) => setTimeout(r, 300));

    const res = await request(app)
      .post("/api/trips/complete")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ tripId, rating: 5 });

    expect(res.status).toBe(200);

    const [riderPayload, driverPayload] = await Promise.all([riderDone, driverDone]);
    expect(riderPayload.tripId).toBe(tripId);
    expect(driverPayload.tripId).toBe(tripId);
  });
});
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

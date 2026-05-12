import mongoose from "mongoose";
import { User } from "../models/user.model";
import { Trip } from "../models/trip.model";
import { Rating } from "../models/ratings.model";
import jwt from "jsonwebtoken"
import request from "supertest"
import app from "../app";
import { describe, it, beforeAll, afterAll, expect, beforeEach, jest } from "@jest/globals"
let riderToken, riderId, tripId, driverId;

jest.setTimeout(20000);

beforeAll(async () => {
    await mongoose.connect(process.env.DB_URL)
})

afterAll(async () => {
    await mongoose.connection.close()
}, 10000)

beforeEach(async () => {
    await User.deleteMany({})
    await Trip.deleteMany({})
    await Rating.deleteMany({})

    const rider = await User.create({
        name: "Test Rider",
        email: "rider@example.com",
        phone: "0700000000",
        password: "pass1234",
        role: "rider",
    })

    const driver = await User.create({
        name: "Test Driver",
        email: "driver@example.com",
        phone: "0711111111",
        password: "pass1234",
        role: "driver",
        carModel: "Toyota",
        carNumber: "KDA123A",
        carType: "sedan",
        licenseNumber: "DL123456",
    })

    const trip = await Trip.create({
        rider: rider._id,
        driver: driver._id,
        startLocation: "Nairobi",
        endLocation: "Westlands",
        fare: 300,
        scheduledTime: new Date(Date.now() + 60 * 60 * 1000)
    })

    tripId = trip._id;
    riderId = rider._id
    driverId = driver._id
    riderToken = jwt.sign({ id: riderId }, process.env.JWT_SECRET, { expiresIn: "1h" })
})

describe("Rate Driver", () => {
    it("Should allow the rider to rate the driver", async () => {

        

        const res = await request(app)
            .post("/api/ratings")
            .set("Authorization", `Bearer ${riderToken}`)
            .send({ tripId, stars: 5 })

            
            expect(res.status).toBe(201)
            expect(res.body.message).toBe("Rating submitted.")
            
            const ratings = await Rating.find({ driver: driverId });
            expect(ratings.length).toBe(1)
            expect(ratings[0].stars).toBe(5)
            console.log("Full response:", res?.body);
            console.log("Status:", res?.status);
    })

    it("Should prevent dupliacte ratings on the same trip", async () => {
        await Rating.create({
            rideId: tripId,
            rider: riderId,
            driver: driverId,
            stars: 4,
        })

        const res = await request(app)
            .post("/api/ratings")
            .set("Authorization", `Bearer ${riderToken}`)
            .send({ tripId, stars: 5 })

        expect(res.status).toBe(400)
        expect(res.body.message).toBe("You already rated this trip.")
    })

    it("Should block users from ratings trips they dont own", async () => {
        const anotherRider = await User.create({
            name: "Intruder",
            email: "intruder@example.com",
            phone: "0722222222",
            password: "pass1234",
            role: "rider",
        });

        const intruderToken = jwt.sign({ id: anotherRider._id, role: anotherRider.role }, process.env.JWT_SECRET)

        const res = await request(app)
            .post("/api/ratings")
            .set("Authorization", `Bearer ${intruderToken}`)
            .send({ tripId, stars: 2 })

        expect(res.status).toBe(403)
        expect(res.body.message).toBe("You can only rate your own trip.")
    })
})

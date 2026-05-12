import request from "supertest";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import app from "../app.js";
import { User } from "../models/user.model.js";
import { MongoMemoryServer } from "mongodb-memory-server";
import dotenv from "dotenv";
dotenv.config();
let mongoServer;
let adminToken;
let userId;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(process.env.DB_URL);

  // Create an admin user and normal user
  // Create an admin user and normal user
  const admin = await User.create({
    name: "Admin User",
    email: "adme.comin_test@exampl",
    phone: "+2547testadmin", // ✅ Add this line
    password: await bcrypt.hash("adminpass", 10),
    role: "admin"
  });

  const user = await User.create({
    name: "Regular User",
    email: "user_test@example.com",
    phone: "+2547testuser", // ✅ Already present
    password: await bcrypt.hash("password123", 10),
    isBlocked: false
  });


  userId = user._id.toString();

  // Generate token manually
  adminToken = jwt.sign({ id: admin._id, role: "admin" }, process.env.JWT_SECRET || "secret", {
    expiresIn: "1h"
  });
}, 100000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe("Admin Controller", () => {
  it("should get all users", async () => {
    const res = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.users)).toBe(true);
  });

  it("should get a user by ID", async () => {
    const res = await request(app)
      .get(`/api/admin/users/${userId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toHaveProperty("email", "user_test@example.com");
  });

  it("should update user fields", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${userId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Updated Name" });

    expect(res.status).toBe(200);
    expect(res.body.user).toHaveProperty("name", "Updated Name");
  });

  it("should disable a user", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${userId}/disable`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toHaveProperty("isBlocked", true);
  });

  it("should prevent a disabled user from logging in", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({
        identifier: "user_test@example.com",
        password: "password123"
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Account has been disabled by admin");
  });

  it("should return 403 if non-admin tries to access admin routes", async () => {
    // Login as normal user to get token
    const normalUser = await User.findOne({ email: "user_test@example.com" });
    const userToken = jwt.sign({ id: normalUser._id, role: "user" }, process.env.JWT_SECRET || "secret", {
      expiresIn: "1h"
    });

    const res = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${userToken}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Access denied. Admins only.");
  });
  it("should get all users including newly created ones", async () => {
    // Create 2 new users
    await User.create([
      {
        name: "User One",
        email: "userone@example.com",
        phone: "+254700000001",
        password: await bcrypt.hash("password1", 10),
      },
      {
        name: "User Two",
        email: "usertwo@example.com",
        phone: "+254700000002",
        password: await bcrypt.hash("password2", 10),
      }
    ]);

    const res = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.users)).toBe(true);

    // Check that at least 4 users exist: 1 admin + 1 initial user + 2 new
    expect(res.body.users.length).toBeGreaterThanOrEqual(4);

    const emails = res.body.users.map(u => u.email);
    expect(emails).toEqual(
      expect.arrayContaining(["userone@example.com", "usertwo@example.com"])
    );
  });
});

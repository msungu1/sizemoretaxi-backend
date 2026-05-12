import request from "supertest";
import mongoose from "mongoose";
import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from "@jest/globals";
import bcrypt from "bcryptjs";
import app from "../app.js";
import { User } from "../models/user.model.js";
import dotenv from "dotenv";
import jwt from "jsonwebtoken"


dotenv.config();

let userId;
let hashedPassword;
let mongoServer;
let accessToken;
let refreshToken;
let testEmail = "testuser@example.com";
let testPhone = "+254712345678";

jest.setTimeout(20000);

beforeAll(async () => {
  await mongoose.connect(process.env.DB_URL);
}, 15000);

afterAll(async () => {
  await mongoose.connection.close();
}, 15000);

beforeEach(async () => {
  // await User.deleteMany({});

  hashedPassword = await bcrypt.hash("securepassword123", 12);

  const user = await User.create({
    name: "driver 1",
    email: "driver1@example.com",
    phone: "0712223344",
    password: hashedPassword,
    role: "driver",
    otp: null,
    otpExpires: null,
  });
  const user2 = await User.create({
    name: "driver 2",
    email: "driver2@example.com",
    phone: "0713223344",
    password: hashedPassword,
    role: "driver",
    otp: null,
    otpExpires: null,
  });
  const user3 = await User.create({
    name: "driver 3",
    email: "driver3@example.com",
    phone: "0714223344",
    password: hashedPassword,
    role: "driver",
    otp: null,
    otpExpires: null,
  });
  const user4 = await User.create({
    name: "driver 4",
    email: "driver4@example.com",
    phone: "0715223344",
    password: hashedPassword,
    role: "driver",
    otp: null,
    otpExpires: null,
  });
  const user5 = await User.create({
    name: "driver 5",
    email: "driver5@example.com",
    phone: "0716223344",
    password: hashedPassword,
    role: "driver",
    otp: null,
    otpExpires: null,
  });

  userId = user._id.toString();

  accessToken = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "15m",
  });

  refreshToken = jwt.sign({ id: user._id, role: user.role }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: "1h",
  });
});

// describe("Auth Controller", () => {

//   describe("User Registration", () => {
//     it("should register a new user", async () => {
//       const res = await request(app).post("/api/auth/register").send({
//         name: "New User",
//         email: `newuser+${Date.now()}@example.com`,
//         phone: "0799999999",
//         password: "newpassword123",
//         role: "rider",
//       });

//       expect(res.status).toBe(201);
//       expect(res.body.message).toBe("User registered. OTP sent.");
//     });

//     it("should reject registration for missing fields", async () => {
//       const res = await request(app).post("/api/auth/register").send({
//         name: "Incomplete User",
//         email: "incomplete@example.com",
//         phone: "0722222222",
//       });

//       expect(res.status).toBe(400);
//       expect(res.body.message).toBe("All fields are required.");
//     });
//   });

//   describe("OTP Verification", () => {
//     it("should verify valid OTP", async () => {
//       // ✅ Set a fresh OTP before running the test
//       await User.updateOne({ _id: userId }, { otp: "123456", otpExpires: Date.now() + 60000 });

//       const user = await User.findById(userId);
//       console.log("Stored OTP:", user?.otp);
//       console.log("Stored OTP Expiry:", user?.otpExpires);

//       const res = await request(app).post("/api/auth/verify-otp").send({
//         userId,
//         otp: "123456",
//       });

//       console.log("OTP verification response:", res.body);

//       expect(res.status).toBe(200);
//       expect(res.body.message).toBe("OTP verified.");
//     });

//     it("should reject invalid OTP", async () => {
//       const res = await request(app).post("/api/auth/verify-otp").send({
//         userId,
//         otp: "654321", // Wrong OTP
//       });

//       expect(res.status).toBe(400);
//       expect(res.body.message).toBe("Invalid or expired OTP.");
//     });
//   });

//   describe("User Login", () => {
//     it("should log in with correct credentials", async () => {
//       // ✅ Ensure user is verified before login
//       await User.updateOne({ _id: userId }, { otp: null });

//       const res = await request(app).post("/api/auth/login").send({
//         identifier: "testuser@example.com",
//         password: "securepassword123",
//       });

//       console.log("Login response:", res.body);

//       expect(res.status).toBe(200);
//       expect(res.body.message).toBe("Login successful");
//       expect(res.body.data).toHaveProperty("accessToken");
//     });

//     it("should fail login with wrong password", async () => {
//       const res = await request(app).post("/api/auth/login").send({
//         identifier: "testuser@example.com",
//         password: "wrongpassword",
//       });

//       expect(res.status).toBe(401);
//       expect(res.body.message).toBe("Invalid password.");
//     });

//     it("should fail login for non-existent user", async () => {
//       const res = await request(app).post("/api/auth/login").send({
//         identifier: "doesnotexist@example.com",
//         password: "securepassword123",
//       });

//       expect(res.status).toBe(404);
//       expect(res.body.message).toBe("User not found.");
//     });
//   });

//   describe("Password Reset", () => {
//     it("should reset password with valid OTP", async () => {
//       // ✅ Ensure OTP is stored correctly
//       await User.updateOne({ email: "testuser@example.com" }, {
//         otp: "654321",
//         otpExpires: Date.now() + 600000 // ⏳ OTP valid for 1 minute
//       });

//       // ✅ Retrieve updated user record
//       const user = await User.findOne({ email: "testuser@example.com" });
//       console.log("Stored OTP before reset request:", user?.otp);
//       console.log("Stored OTP expiry:", user?.otpExpires);
//       console.log("Current time:", Date.now());

//       // ✅ Send password reset request
//       const res = await request(app).post("/api/auth/reset-password").send({
//         identifier: "testuser@example.com",
//         otp: "654321",
//         newPassword: "newsecurepassword123",
//       });

//       console.log("Password reset response:", res.body);

//       expect(res.status).toBe(200);
//       expect(res.body.message).toBe("Password reset successful.");
//       expect(res.body.data).toBeNull()
//     });

//     it("should reject password reset for non-existent user", async () => {
//       const res = await request(app).post("/api/auth/forgot-password").send({
//         identifier: "fakeuser@example.com",
//       });

//       expect(res.status).toBe(404);
//       expect(res.body.message).toBe("User not found.");
//     });

//     it("should reject password reset with invalid OTP", async () => {
//       const res = await request(app).post("/api/auth/reset-password").send({
//         identifier: "testuser@example.com",
//         otp: "000000",
//         newPassword: "newsecurepassword123",
//       });

//       expect(res.status).toBe(400);
//       expect(res.body.message).toBe("Invalid or expired OTP.");
//     });
//   });

// });

describe("Auth Controller", () => {
  it("should resend OTP", async () => {
    await User.findByIdAndUpdate(userId, {
      otp: "111111",
      otpExpires: Date.now() + 10 * 60 * 1000,
    });

    const res = await request(app).post("/api/auth/resend-otp").send({ userId });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("OTP resent.");
  });

  it("should verify OTP", async () => {
    await User.findByIdAndUpdate(userId, {
      otp: "123456",
      otpExpires: Date.now() + 60000,
    });

    const res = await request(app).post("/api/auth/verify-otp").send({
      userId,
      otp: "123456",
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("OTP verified.");
  });

  it("should login successfully", async () => {
    const res = await request(app).post("/api/auth/login").send({
      identifier: testEmail,
      password: "securepassword123",
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Login successful");
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
  });

  it("should refresh access token", async () => {
    const res = await request(app).post("/api/auth/refresh-token").send({
      refreshToken,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
  });

  it("should send OTP for password reset", async () => {
    const res = await request(app).post("/api/auth/forgot-password").send({
      identifier: testEmail,
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("OTP sent.");
  });

  it("should reset password with OTP", async () => {
    await User.findByIdAndUpdate(userId, {
      otp: "999999",
      otpExpires: Date.now() + 60000,
    });

    const res = await request(app).post("/api/auth/reset-password").send({
      identifier: testEmail,
      otp: "999999",
      newPassword: "newPass456",
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Password reset successful.");
  });

  it("should login with new password", async () => {
    await User.findByIdAndUpdate(userId, {
      password: await bcrypt.hash("newPass456", 12),
    });

    const res = await request(app).post("/api/auth/login").send({
      identifier: testEmail,
      password: "newPass456",
    });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
  });

  it("should request phone change", async () => {
    const res = await request(app)
      .post("/api/auth/change-phone")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ userId, newPhone: "0799887766" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("OTP sent to new phone.");
  });

  it("should confirm phone change", async () => {
    await User.findByIdAndUpdate(userId, {
      phoneChangeOTP: "654321",
      phoneChangeOTPExpires: Date.now() + 60000,
      newPhonePending: "0799887766",
    });

    const res = await request(app)
      .post("/api/auth/confirm-phone-change")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ userId, otp: "654321" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Phone updated.");
  });

  it("should request email change", async () => {
    const res = await request(app)
      .post("/api/auth/change-email")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ userId, newEmail: "new@email.com" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("OTP sent to new email.");
  });

  it("should confirm email change", async () => {
    await User.findByIdAndUpdate(userId, {
      emailChangeOTP: "222222",
      emailChangeOTPExpires: Date.now() + 60000,
      newEmailPending: "new@email.com",
    });

    const res = await request(app)
      .post("/api/auth/confirm-email-change")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ userId, otp: "222222" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Email updated.");
  });

  it("should block unauthorized access to protected route", async () => {
    const res = await request(app)
      .post("/api/auth/change-phone")
      .send({ userId, newPhone: "0711111111" });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Unauthorized");
  });
});
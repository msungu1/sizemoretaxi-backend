import express from "express";
import {
    registerUser,
    verifyOtp,
    loginUser,
    resendOtp,
    forgotPassword,
    resetPassword,
    changePhone,
    confirmPhoneChange,
    changeEmail,
    confirmEmailChange,
} from "../controllers/auth.controller.js";

import { refreshAccessToken } from "../middleware/refresh.js";
import { verifyToken } from "../middleware/verify.js";
import { upload } from "../middleware/upload.js";

const router = express.Router();

// Register
router.post("/register", upload.single("profilePicture"), registerUser);

// Verify OTP after registration
router.post("/verify-otp", verifyOtp);

// Login (with email or phone)
router.post("/login", loginUser);

// Resend OTP
router.post("/resend-otp", resendOtp);

// Forgot password
router.post("/forgot-password", forgotPassword);

// Reset password with OTP
router.post("/reset-password", resetPassword);

// Change phone
router.post("/change-phone", verifyToken, changePhone);

// Confirm phone change with OTP
router.post("/confirm-phone-change", verifyToken, confirmPhoneChange);

// Refresh token route
router.post("/refresh-token", refreshAccessToken);

// Change email
router.post("/change-email", verifyToken, changeEmail);

// Confirm email change with OTP
router.post("/confirm-email-change", verifyToken, confirmEmailChange);

export default router;

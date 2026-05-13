import { User } from "../models/user.model.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { sendEmail, sendSMS } from "../lib/MailAndSMSNotifications.js";

const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );

  const refreshToken = jwt.sign(
    { id: user._id, role: user.role },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: "1h" }
  );

  return { accessToken, refreshToken };
};

const response = (res, status, message, data = null) => {
  return res.status(status).json({ status, message, data });
};

export const registerUser = async (req, res) => {
  const {
    name,
    email,
    phone,
    password,
    role,
    carModel,
    carNumber,
    carType,
    licenseNumber,
    idNumber
  } = req.body;

  const allowedCarTypes = ["comfort", "business", "premium",];

  if (!name || !email || !phone || !password)
    return response(res, 400, "All fields are required.");


  // ✅ If registering as a driver, validate driver-specific fields
  if (role === "driver") {
    if (!carModel || !carNumber || !carType || !licenseNumber || !idNumber) {
      return response(res, 400, "All driver vehicle and ID details are required.");
    }

    if (!allowedCarTypes.includes(carType)) {
      return response(res, 400, `carType must be one of: ${allowedCarTypes.join(", ")}`);
    }

    if (req.file && !req.file.mimetype.startsWith("image/")) {
      return response(res, 400, "Uploaded file must be an image.");
    }
  }

  try {
    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser)
      return response(res, 409, "Email or phone already exists.");

    const hashedPassword = await bcrypt.hash(password, 12);
    const registrationOTP = Math.floor(100000 + Math.random() * 900000).toString();
    const registrationOTPExpires = Date.now() + 10 * 60 * 1000;

    const userData = {
      name,
      email,
      phone,
      password: hashedPassword,
      role,
      registrationOTP,
      registrationOTPExpires,
    };

    if (req.file && !req.file.mimetype.startsWith("image/")) {
      return response(res, 400, "Uploaded file must be an image.");
    }

    // ✅ Add driver-specific fields if applicable
    if (role === "driver") {
      userData.carModel = carModel;
      userData.carNumber = carNumber;
      userData.carType = carType;
      userData.licenseNumber = licenseNumber;
      userData.idNumber = idNumber;
    }

    const user = await User.create(userData);

    await sendEmail(userData.email, registrationOTP);
    // TODO: fix twilio account
    // sendSMS(userData.phone, registrationOTP);

    return response(res, 201, "User registered. OTP sent.");
  } catch (err) {
    console.error(err);
    return response(res, 500, "Internal server error.");
  }
};

// Verify otp for ur account
export const verifyOtp = async (req, res) => {
  const { userId, otp } = req.body;
  if (!userId || !otp) return response(res, 400, "User ID and OTP required.");

  try {
    const user = await User.findById(userId);
    if (!user) return response(res, 404, "User not found.");
    if (
      !user.registrationOTP ||
      user.registrationOTP !== otp ||
      user.registrationOTPExpires < Date.now()
    ) {
      return response(res, 400, "Invalid or expired OTP.");
    }
    if (user.isEmailVerified)
      return response(res, 400, "Email already verified.");

    user.registrationOTP = null;
    user.registrationOTPExpires = null;
    user.isEmailVerified = true;
    await user.save();



    return response(res, 200, "OTP verified.");
  } catch (err) {
    console.error(err);
    return response(res, 500, "Internal server error.");
  }
};

// Login a valid user
export const loginUser = async (req, res) => {
  const { identifier, password } = req.body;
  console.log("REQ BODY:", req.body);
  if (!identifier || !password) return response(res, 400, "Credentials required.");

  try {
    // const user = await User.findOne({
    //   $or: [{ email: identifier }, { phone: identifier }]
    // });
const user = await User.findOne({
  $or: [{ email: identifier.trim() }, { phone: identifier.trim() }]
});
    if (!user) return response(res, 404, "User not found.");

    if (user.isBlocked)
      return response(res, 403, "Account has been disabled by admin")

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return response(res, 401, "Invalid password.");

    const tokens = generateTokens(user);

    const userObj = user.toObject()

console.log("Searching for:", identifier.trim());
console.log("User found in DB:", user ? "YES" : "NO");
    const { password: _, ...userWithoutPassword } = userObj

    return response(res, 200, "Login successful", {
      ...tokens,
      user: userWithoutPassword
    });
  } catch (err) {
    console.error(err);
    return response(res, 500, "Internal server error.");
  }
};

// Resend the otp thats used to verify the account
export const resendOtp = async (req, res) => {
  const { userId } = req.body;
  if (!userId) return response(res, 400, "User ID is required.");

  try {
    const user = await User.findById(userId);
    if (!user) return response(res, 404, "User not found.");

    if (user.isEmailVerified)
      return response(res, 400, "Email already verified.");

    const registrationOTP = Math.floor(100000 + Math.random() * 900000).toString();

    user.registrationOTP = registrationOTP;
    user.registrationOTPExpires = Date.now() + 10 * 60 * 1000;
    await user.save();

    await sendEmail(user.email, registrationOTP);
    await sendSMS(user.phone, registrationOTP);

    return response(res, 200, "OTP resent.");
  } catch (err) {
    console.error(err);
    return response(res, 500, "Internal server error.");
  }
};

// When user forgets their password they will be asked their phone number
export const forgotPassword = async (req, res) => {
  const { identifier } = req.body;
  if (!identifier) return response(res, 400, "Identifier required.");

  try {
    const user = await User.findOne({
      $or: [{ email: identifier }, { phone: identifier }]
    });
    if (!user) return response(res, 404, "User not found.");

    if (!user.isEmailVerified)
      return response(res, 400, "Verify your account first.");

    const passwordResetOTP = Math.floor(100000 + Math.random() * 900000).toString();

    user.passwordResetOTP = passwordResetOTP;
    user.passwordResetOTPExpires = Date.now() + 10 * 60 * 1000;
    await user.save();

    if (identifier.includes("@")) await sendEmail(user.email, passwordResetOTP);
    else await sendSMS(user.phone, passwordResetOTP);

    return response(res, 200, "OTP sent.");
  } catch (err) {
    console.error(err);
    return response(res, 500, "Internal server error.");
  }
};

// Resets the password after correct OTP has been entered
export const resetPassword = async (req, res) => {
  const { identifier, otp, newPassword } = req.body;
  if (!identifier || !otp || !newPassword)
    return response(res, 400, "All fields are required.");

  try {
    const user = await User.findOne({
      $or: [{ email: identifier }, { phone: identifier }],
      passwordResetOTP: otp,
      passwordResetOTPExpires: { $gt: Date.now() },
    });

    if (!user) return response(res, 400, "Invalid or expired OTP.");

    user.password = await bcrypt.hash(newPassword, 12);
    user.passwordResetOTP = null;
    user.passwordResetOTPExpires = null;
    await user.save();

    return response(res, 200, "Password reset successful.");
  } catch (err) {
    console.error(err);
    return response(res, 500, "Internal server error.");
  }
};

// Sends an OTP to change phone number
export const changePhone = async (req, res) => {
  const { userId, newPhone } = req.body;
  if (!userId || !newPhone) return response(res, 400, "User ID and phone required.");

  try {
    const user = await User.findById(userId);
    if (!user) return response(res, 404, "User not found.");

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.phoneChangeOTP = otp;
    user.phoneChangeOTPExpires = Date.now() + 10 * 60 * 1000;
    user.newPhonePending = newPhone;
    await user.save();

    await sendSMS(newPhone, otp);

    return response(res, 200, "OTP sent to new phone.");
  } catch (err) {
    console.error(err);
    return response(res, 500, "Internal server error.");
  }
};

// Changes the password once the new OTP has been sent
export const confirmPhoneChange = async (req, res) => {
  const { userId, otp } = req.body;
  if (!userId || !otp) return response(res, 400, "User ID and OTP required.");

  try {
    const user = await User.findById(userId);
    if (
      !user ||
      user.phoneChangeOTP !== otp ||
      user.phoneChangeOTPExpires < Date.now()
    ) {
      return response(res, 400, "Invalid or expired OTP.");
    }

    user.phone = user.newPhonePending;
    user.newPhonePending = null;
    user.phoneChangeOTP = null;
    user.phoneChangeOTPExpires = null;
    await user.save();

    return response(res, 200, "Phone updated.", {
      phone: user.phone
    });
  } catch (err) {
    console.error(err);
    return response(res, 500, "Internal server error.");
  }
};

// Sends an OTP to change email
export const changeEmail = async (req, res) => {
  const { userId, newEmail } = req.body;
  if (!userId || !newEmail) return response(res, 400, "User ID and new email required.");

  try {
    const user = await User.findById(userId);
    if (!user) return response(res, 404, "User not found.");

    const existing = await User.findOne({ email: newEmail });
    if (existing) return response(res, 409, "Email already in use.");

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.emailChangeOTP = otp;
    user.emailChangeOTPExpires = Date.now() + 10 * 60 * 1000;
    user.newEmailPending = newEmail;
    await user.save();

    await sendEmail(newEmail, otp);

    return response(res, 200, "OTP sent to new email.");
  } catch (err) {
    console.error(err);
    return response(res, 500, "Internal server error.");
  }
};

// Changes the email once the new OTP has been sent
export const confirmEmailChange = async (req, res) => {
  const { userId, otp } = req.body;
  if (!userId || !otp) return response(res, 400, "User ID and OTP required.");

  try {
    const user = await User.findById(userId);
    if (
      !user ||
      user.emailChangeOTP !== otp ||
      user.emailChangeOTPExpires < Date.now()
    ) {
      return response(res, 400, "Invalid or expired OTP.");
    }

    user.email = user.newEmailPending;
    user.newEmailPending = null;
    user.emailChangeOTP = null;
    user.emailChangeOTPExpires = null;
    await user.save();

    return response(res, 200, "Email updated.", {
      email: user.email
    });
  } catch (err) {
    console.error(err);
    return response(res, 500, "Internal server error.");
  }
};

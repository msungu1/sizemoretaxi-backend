// import { User } from "../models/user.model.js";
// import bcrypt from "bcryptjs";
// import jwt from "jsonwebtoken";
// import { sendEmail, sendSMS } from "../lib/MailAndSMSNotifications.js";

// const generateTokens = (user) => {
//   const accessToken = jwt.sign(
//     { id: user._id, role: user.role },
//     process.env.JWT_SECRET,
//     { expiresIn: "15m" }
//   );

//   const refreshToken = jwt.sign(
//     { id: user._id, role: user.role },
//     process.env.REFRESH_TOKEN_SECRET,
//     { expiresIn: "1h" }
//   );

//   return { accessToken, refreshToken };
// };

// const response = (res, status, message, data = null) => {
//   return res.status(status).json({ status, message, data });
// };
// export const registerUser = async (req, res) => {
//   const {
//     name,
//     email,
//     phone,
//     password,
//     role,
//     carModel,
//     carNumber,
//     carType,
//     licenseNumber,
//     idNumber
//   } = req.body;

//   const allowedCarTypes = ["Chopper", "Comfort", "Business", "Premium"];

//   if (!name || !email || !phone || !password)
//     return response(res, 400, "All fields are required.");

//   // req.files comes from multer's upload.fields([...]) — each key is an array of files
//   const files = req.files || {};
//   const driverPhotoFile = files.driverPhoto?.[0];
//   const licensePhotoFile = files.licensePhoto?.[0];
//   const nationalIdPhotoFile = files.nationalIdPhoto?.[0];
//   const vehiclePhotoFile = files.vehiclePhoto?.[0];

//   // ✅ If registering as a driver, validate driver-specific fields
//   if (role === "driver") {
//     if (!carModel || !carNumber || !carType || !licenseNumber || !idNumber) {
//       return response(res, 400, "All driver vehicle and ID details are required.");
//     }

//     if (!allowedCarTypes.includes(carType)) {
//       return response(res, 400, `carType must be one of: ${allowedCarTypes.join(", ")}`);
//     }

//     if (!driverPhotoFile || !licensePhotoFile || !nationalIdPhotoFile) {
//       return response(res, 400, "Driver photo, license photo, and national ID photo are required.");
//     }
//   }

//   try {
//     const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
//     if (existingUser)
//       return response(res, 409, "Email or phone already exists.");

//     const hashedPassword = await bcrypt.hash(password, 12);
//     const registrationOTP = Math.floor(100000 + Math.random() * 900000).toString();
//     const registrationOTPExpires = Date.now() + 10 * 60 * 1000;

//     const userData = {
//       name,
//       email,
//       phone,
//       password: hashedPassword,
//       role,
//       registrationOTP,
//       registrationOTPExpires,
//     };

//     // ✅ Add driver-specific fields if applicable
//     if (role === "driver") {
//       userData.carModel = carModel;
//       userData.carNumber = carNumber;
//       userData.carType = carType;
//       userData.licenseNumber = licenseNumber;
//       userData.idNumber = idNumber;

//       // CloudinaryStorage attaches the hosted URL at file.path
//       userData.profilePicture = driverPhotoFile.path;
//       userData.licensePhotoUrl = licensePhotoFile.path;
//       userData.nationalIdPhotoUrl = nationalIdPhotoFile.path;
//       if (vehiclePhotoFile) userData.vehiclePhotoUrl = vehiclePhotoFile.path;
//     }

//     const user = await User.create(userData);

//     await sendEmail(userData.email, registrationOTP);
//     // TODO: fix twilio account
//     // sendSMS(userData.phone, registrationOTP);

//     return response(res, 201, "User registered. OTP sent.");
//   } catch (err) {
//     console.error(err);
//     return response(res, 500, "Internal server error.");
//   }
// };

// // Verify otp for ur account
// export const verifyOtp = async (req, res) => {
//   const { userId, otp } = req.body;
//   if (!userId || !otp) return response(res, 400, "User ID and OTP required.");

//   try {
//     const user = await User.findById(userId);
//     if (!user) return response(res, 404, "User not found.");
//     if (
//       !user.registrationOTP ||
//       user.registrationOTP !== otp ||
//       user.registrationOTPExpires < Date.now()
//     ) {
//       return response(res, 400, "Invalid or expired OTP.");
//     }
//     if (user.isEmailVerified)
//       return response(res, 400, "Email already verified.");

//     user.registrationOTP = null;
//     user.registrationOTPExpires = null;
//     user.isEmailVerified = true;
//     await user.save();



//     return response(res, 200, "OTP verified.");
//   } catch (err) {
//     console.error(err);
//     return response(res, 500, "Internal server error.");
//   }
// };

// // Login a valid user
// export const loginUser = async (req, res) => {
//   const { identifier, password } = req.body;
//   console.log("REQ BODY:", req.body);
//   if (!identifier || !password) return response(res, 400, "Credentials required.");

//   try {
//     // const user = await User.findOne({
//     //   $or: [{ email: identifier }, { phone: identifier }]
//     // });
// const user = await User.findOne({
//   $or: [{ email: identifier.trim() }, { phone: identifier.trim() }]
// });
//     if (!user) return response(res, 404, "User not found.");

//     if (user.isBlocked)
//       return response(res, 403, "Account has been disabled by admin")

//     const isMatch = await bcrypt.compare(password, user.password);
//     if (!isMatch) return response(res, 401, "Invalid password.");

//     const tokens = generateTokens(user);

//     const userObj = user.toObject()

// console.log("Searching for:", identifier.trim());
// console.log("User found in DB:", user ? "YES" : "NO");
//     const { password: _, ...userWithoutPassword } = userObj

//     return response(res, 200, "Login successful", {
//       ...tokens,
//       user: userWithoutPassword
//     });
//   } catch (err) {
//     console.error(err);
//     return response(res, 500, "Internal server error.");
//   }
// };

// // Resend the otp thats used to verify the account
// export const resendOtp = async (req, res) => {
//   const { userId } = req.body;
//   if (!userId) return response(res, 400, "User ID is required.");

//   try {
//     const user = await User.findById(userId);
//     if (!user) return response(res, 404, "User not found.");

//     if (user.isEmailVerified)
//       return response(res, 400, "Email already verified.");

//     const registrationOTP = Math.floor(100000 + Math.random() * 900000).toString();

//     user.registrationOTP = registrationOTP;
//     user.registrationOTPExpires = Date.now() + 10 * 60 * 1000;
//     await user.save();

//     await sendEmail(user.email, registrationOTP);
//     await sendSMS(user.phone, registrationOTP);

//     return response(res, 200, "OTP resent.");
//   } catch (err) {
//     console.error(err);
//     return response(res, 500, "Internal server error.");
//   }
// };

// // When user forgets their password they will be asked their phone number
// export const forgotPassword = async (req, res) => {
//   const { identifier } = req.body;
//   if (!identifier) return response(res, 400, "Identifier required.");

//   try {
//     const user = await User.findOne({
//       $or: [{ email: identifier }, { phone: identifier }]
//     });
//     if (!user) return response(res, 404, "User not found.");

//     if (!user.isEmailVerified)
//       return response(res, 400, "Verify your account first.");

//     const passwordResetOTP = Math.floor(100000 + Math.random() * 900000).toString();

//     user.passwordResetOTP = passwordResetOTP;
//     user.passwordResetOTPExpires = Date.now() + 10 * 60 * 1000;
//     await user.save();

//     if (identifier.includes("@")) await sendEmail(user.email, passwordResetOTP);
//     else await sendSMS(user.phone, passwordResetOTP);

//     return response(res, 200, "OTP sent.");
//   } catch (err) {
//     console.error(err);
//     return response(res, 500, "Internal server error.");
//   }
// };

// // Resets the password after correct OTP has been entered
// export const resetPassword = async (req, res) => {
//   const { identifier, otp, newPassword } = req.body;
//   if (!identifier || !otp || !newPassword)
//     return response(res, 400, "All fields are required.");

//   try {
//     const user = await User.findOne({
//       $or: [{ email: identifier }, { phone: identifier }],
//       passwordResetOTP: otp,
//       passwordResetOTPExpires: { $gt: Date.now() },
//     });

//     if (!user) return response(res, 400, "Invalid or expired OTP.");

//     user.password = await bcrypt.hash(newPassword, 12);
//     user.passwordResetOTP = null;
//     user.passwordResetOTPExpires = null;
//     await user.save();

//     return response(res, 200, "Password reset successful.");
//   } catch (err) {
//     console.error(err);
//     return response(res, 500, "Internal server error.");
//   }
// };

// // Sends an OTP to change phone number
// export const changePhone = async (req, res) => {
//   const { userId, newPhone } = req.body;
//   if (!userId || !newPhone) return response(res, 400, "User ID and phone required.");

//   try {
//     const user = await User.findById(userId);
//     if (!user) return response(res, 404, "User not found.");

//     const otp = Math.floor(100000 + Math.random() * 900000).toString();
//     user.phoneChangeOTP = otp;
//     user.phoneChangeOTPExpires = Date.now() + 10 * 60 * 1000;
//     user.newPhonePending = newPhone;
//     await user.save();

//     await sendSMS(newPhone, otp);

//     return response(res, 200, "OTP sent to new phone.");
//   } catch (err) {
//     console.error(err);
//     return response(res, 500, "Internal server error.");
//   }
// };

// // Changes the password once the new OTP has been sent
// export const confirmPhoneChange = async (req, res) => {
//   const { userId, otp } = req.body;
//   if (!userId || !otp) return response(res, 400, "User ID and OTP required.");

//   try {
//     const user = await User.findById(userId);
//     if (
//       !user ||
//       user.phoneChangeOTP !== otp ||
//       user.phoneChangeOTPExpires < Date.now()
//     ) {
//       return response(res, 400, "Invalid or expired OTP.");
//     }

//     user.phone = user.newPhonePending;
//     user.newPhonePending = null;
//     user.phoneChangeOTP = null;
//     user.phoneChangeOTPExpires = null;
//     await user.save();

//     return response(res, 200, "Phone updated.", {
//       phone: user.phone
//     });
//   } catch (err) {
//     console.error(err);
//     return response(res, 500, "Internal server error.");
//   }
// };

// // Sends an OTP to change email
// export const changeEmail = async (req, res) => {
//   const { userId, newEmail } = req.body;
//   if (!userId || !newEmail) return response(res, 400, "User ID and new email required.");

//   try {
//     const user = await User.findById(userId);
//     if (!user) return response(res, 404, "User not found.");

//     const existing = await User.findOne({ email: newEmail });
//     if (existing) return response(res, 409, "Email already in use.");

//     const otp = Math.floor(100000 + Math.random() * 900000).toString();
//     user.emailChangeOTP = otp;
//     user.emailChangeOTPExpires = Date.now() + 10 * 60 * 1000;
//     user.newEmailPending = newEmail;
//     await user.save();

//     await sendEmail(newEmail, otp);

//     return response(res, 200, "OTP sent to new email.");
//   } catch (err) {
//     console.error(err);
//     return response(res, 500, "Internal server error.");
//   }
// };

// // Changes the email once the new OTP has been sent
// export const confirmEmailChange = async (req, res) => {
//   const { userId, otp } = req.body;
//   if (!userId || !otp) return response(res, 400, "User ID and OTP required.");

//   try {
//     const user = await User.findById(userId);
//     if (
//       !user ||
//       user.emailChangeOTP !== otp ||
//       user.emailChangeOTPExpires < Date.now()
//     ) {
//       return response(res, 400, "Invalid or expired OTP.");
//     }

//     user.email = user.newEmailPending;
//     user.newEmailPending = null;
//     user.emailChangeOTP = null;
//     user.emailChangeOTPExpires = null;
//     await user.save();

//     return response(res, 200, "Email updated.", {
//       email: user.email
//     });
//   } catch (err) {
//     console.error(err);
//     return response(res, 500, "Internal server error.");
//   }
// };
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

// Twilio requires E.164 format (e.g. +254712345678). The app stores phone
// numbers as bare digits (e.g. 0712345678 or 712345678), so convert before
// dialing out. Adjust the country code if you support numbers outside Kenya.
const toE164 = (phone) => {
  const digits = String(phone).replace(/[^0-9]/g, "");
  if (digits.startsWith("254")) return `+${digits}`;
  if (digits.startsWith("0")) return `+254${digits.slice(1)}`;
  return `+254${digits}`;
};
// export const registerUser = async (req, res) => {
//   const {
//     name,
//     email,
//     phone,
//     password,
//     role,
//     carModel,
//     carNumber,
//     carType,
//     licenseNumber,
//     idNumber
//   } = req.body;

//   const allowedCarTypes = ["Chopper", "Comfort", "Business", "Premium"];

//   if (!name || !email || !phone || !password)
//     return response(res, 400, "All fields are required.");

//   // req.files comes from multer's upload.fields([...]) — each key is an array of files
//   const files = req.files || {};
//   const driverPhotoFile = files.driverPhoto?.[0];
//   const licensePhotoFile = files.licensePhoto?.[0];
//   const nationalIdPhotoFile = files.nationalIdPhoto?.[0];
//   const vehiclePhotoFile = files.vehiclePhoto?.[0];

//   // ✅ If registering as a driver, validate driver-specific fields
//   if (role === "driver") {
//     if (!carModel || !carNumber || !carType || !licenseNumber || !idNumber) {
//       return response(res, 400, "All driver vehicle and ID details are required.");
//     }

//     if (!allowedCarTypes.includes(carType)) {
//       return response(res, 400, `carType must be one of: ${allowedCarTypes.join(", ")}`);
//     }

//     // TEMPORARILY DISABLED: photo uploads are turned off on the client for
//     // now, so we skip this check. UNCOMMENT to re-enable once the app is
//     // sending driverPhoto / licensePhoto / nationalIdPhoto again.
//     // if (!driverPhotoFile || !licensePhotoFile || !nationalIdPhotoFile) {
//     //   return response(res, 400, "Driver photo, license photo, and national ID photo are required.");
//     // }
//   }

//   try {
//     const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
//     if (existingUser)
//       return response(res, 409, "Email or phone already exists.");

//     const hashedPassword = await bcrypt.hash(password, 12);
//     const registrationOTP = Math.floor(100000 + Math.random() * 900000).toString();
//     const registrationOTPExpires = Date.now() + 10 * 60 * 1000;

//     const userData = {
//       name,
//       email,
//       phone,
//       password: hashedPassword,
//       role,
//       registrationOTP,
//       registrationOTPExpires,
//     };

//     // ✅ Add driver-specific fields if applicable
//     if (role === "driver") {
//       userData.carModel = carModel;
//       userData.carNumber = carNumber;
//       userData.carType = carType;
//       userData.licenseNumber = licenseNumber;
//       userData.idNumber = idNumber;

//       // CloudinaryStorage attaches the hosted URL at file.path
//       // TEMPORARILY DISABLED along with the check above — only attach these
//       // if the files actually exist, since uploads are currently off.
//       if (driverPhotoFile) userData.profilePicture = driverPhotoFile.path;
//       if (licensePhotoFile) userData.licensePhotoUrl = licensePhotoFile.path;
//       if (nationalIdPhotoFile) userData.nationalIdPhotoUrl = nationalIdPhotoFile.path;
//       if (vehiclePhotoFile) userData.vehiclePhotoUrl = vehiclePhotoFile.path;
//     }

//     console.time("Registration");
//    const user = await User.create(userData);

// response(
//     res,
//     201,
//     "User registered. Check your email for your verification code."
// );

// // Send emails AFTER responding
// sendEmail(
//     user.email,
//     "Your SizemoreTaxi verification code",
//     otpHtml
// ).catch(console.error);

// sendEmail(
//     user.email,
//     "Welcome to SizemoreTaxi 🚕",
//     welcomeHtml
// ).catch(console.error);

//     // Re-enable once Twilio's Kenya Alpha Sender ID is approved:
//     // await sendSMS(
//     //   toE164(user.phone),
//     //   `Your SizemoreTaxi verification code is ${registrationOTP}. It expires in 10 minutes.`
//     // );

//     return response(res, 201, "User registered. Check your email for your verification code.");
//   } catch (err) {
//     console.error(err);
//     return response(res, 500, "Internal server error.");
//   }
// };

// Verify otp for ur account

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
    idNumber,
  } = req.body;

  const allowedCarTypes = ["Chopper", "Comfort", "Business", "Premium"];

  if (!name || !email || !phone || !password) {
    return response(res, 400, "All fields are required.");
  }

  const files = req.files || {};
  const driverPhotoFile = files.driverPhoto?.[0];
  const licensePhotoFile = files.licensePhoto?.[0];
  const nationalIdPhotoFile = files.nationalIdPhoto?.[0];
  const vehiclePhotoFile = files.vehiclePhoto?.[0];

  if (role === "driver") {
    if (!carModel || !carNumber || !carType || !licenseNumber || !idNumber) {
      return response(
        res,
        400,
        "All driver vehicle and ID details are required."
      );
    }

    if (!allowedCarTypes.includes(carType)) {
      return response(
        res,
        400,
        `carType must be one of: ${allowedCarTypes.join(", ")}`
      );
    }
  }

  try {
    console.time("Total Registration");

    const existingUser = await User.findOne({
      $or: [{ email }, { phone }],
    });

    if (existingUser) {
      return response(res, 409, "Email or phone already exists.");
    }

    console.time("Password Hash");

    // Faster than 12 but still secure
    const hashedPassword = await bcrypt.hash(password, 10);

    console.timeEnd("Password Hash");

    const registrationOTP = Math.floor(
      100000 + Math.random() * 900000
    ).toString();

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

    if (role === "driver") {
      userData.carModel = carModel;
      userData.carNumber = carNumber;
      userData.carType = carType;
      userData.licenseNumber = licenseNumber;
      userData.idNumber = idNumber;

      if (driverPhotoFile)
        userData.profilePicture = driverPhotoFile.path;

      if (licensePhotoFile)
        userData.licensePhotoUrl = licensePhotoFile.path;

      if (nationalIdPhotoFile)
        userData.nationalIdPhotoUrl = nationalIdPhotoFile.path;

      if (vehiclePhotoFile)
        userData.vehiclePhotoUrl = vehiclePhotoFile.path;
    }

    console.time("Create User");

    const user = await User.create(userData);

    console.timeEnd("Create User");

    console.timeEnd("Total Registration");

    // Respond immediately
    response(
      res,
      201,
      "User registered successfully. Please check your email for your verification code."
    );

    // Send email in the background
    (async () => {
      try {
        console.time("Send Email");

        await sendEmail(
          user.email,
          "🎉 Welcome to SizemoreTaxi - Verify Your Account",
          `
          <div style="
              font-family:Arial,sans-serif;
              max-width:600px;
              margin:auto;
              background:#0F172A;
              color:white;
              border-radius:18px;
              overflow:hidden;
          ">

            <div style="background:#22D3EE;padding:20px;text-align:center;">
              <h1 style="margin:0;color:#0F172A;">
                🚕 Welcome to SizemoreTaxi
              </h1>
            </div>

            <div style="padding:30px;">

              <h2>Hello ${user.name}, 👋</h2>

              <p style="line-height:1.7;font-size:16px;">
                Thank you for creating your
                <strong>SizemoreTaxi</strong> account.
              </p>

              <p style="line-height:1.7;">
                To activate your account, use the verification code below.
              </p>

              <div style="
                  margin:35px auto;
                  width:220px;
                  background:#22D3EE;
                  color:#0F172A;
                  padding:18px;
                  border-radius:12px;
                  text-align:center;
                  font-size:34px;
                  font-weight:bold;
                  letter-spacing:8px;
              ">
                ${registrationOTP}
              </div>

              <p style="color:#CBD5E1;">
                ⏰ This code expires in
                <strong>10 minutes</strong>.
              </p>

              <hr style="border:none;border-top:1px solid #334155;margin:30px 0;">

              <h3>Why SizemoreTaxi?</h3>

              <ul style="line-height:2;">
                <li>✅ Safe & Secure Rides</li>
                <li>✅ Fast Driver Matching</li>
                <li>✅ Real-time Trip Tracking</li>
                <li>✅ Emergency Assistance</li>
              </ul>

              <p style="margin-top:30px;">
                If you didn't create this account, you can safely ignore this email.
              </p>

            </div>

            <div style="
                background:#111827;
                padding:18px;
                text-align:center;
                color:#94A3B8;
                font-size:13px;
            ">
              © ${new Date().getFullYear()} SizemoreTaxi
              <br>
              Safe • Reliable • Fast
            </div>

          </div>
          `
        );

        console.timeEnd("Send Email");
      } catch (emailError) {
        console.error("Email Error:", emailError);
      }
    })();

    // Uncomment when Twilio is ready
    /*
    (async () => {
      try {
        await sendSMS(
          toE164(user.phone),
          \`Your SizemoreTaxi verification code is ${registrationOTP}. It expires in 10 minutes.\`
        );
      } catch (smsErr) {
        console.error("SMS Error:", smsErr);
      }
    })();
    */
  } catch (err) {
    console.error(err);

    if (!res.headersSent) {
      return response(res, 500, "Internal server error.");
    }
  }
};
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

    // INTERIM: resend via email too, same reason as registerUser above.
    await sendEmail(
      user.email,
      "Your SizemoreTaxi verification code",
      `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #0F172A; color: #ffffff; border-radius: 16px;">
          <h2 style="color: #22D3EE; margin-bottom: 4px;">Here's your new code</h2>
          <p style="color: #cbd5e1; font-size: 15px; line-height: 1.6;">
            Hi ${user.name}, use the code below to verify your SizemoreTaxi account. It expires in 10 minutes.
          </p>
          <p style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #22D3EE; margin: 20px 0;">${registrationOTP}</p>
          <p style="color: #64748b; font-size: 13px; margin-top: 24px;">
            If you didn't request this, you can safely ignore this email.
          </p>
        </div>
      `
    );

    // Re-enable once Twilio's Kenya Alpha Sender ID is approved:
    // await sendSMS(
    //   toE164(user.phone),
    //   `Your SizemoreTaxi verification code is ${registrationOTP}. It expires in 10 minutes.`
    // );

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

    await sendEmail(
      user.email,
      "Reset your SizemoreTaxi password",
      `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #0F172A; color: #ffffff; border-radius: 16px;">
          <h2 style="color: #22D3EE;">Password reset code</h2>
          <p style="color: #cbd5e1; font-size: 15px; line-height: 1.6;">
            Use the code below to reset your password. It expires in 10 minutes.
          </p>
          <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #22D3EE;">${passwordResetOTP}</p>
          <p style="color: #64748b; font-size: 13px; margin-top: 24px;">
            If you didn't request this, you can safely ignore this email.
          </p>
        </div>
      `
    );

    // Re-enable once Twilio's Kenya Alpha Sender ID is approved:
    // if (!identifier.includes("@")) {
    //   await sendSMS(
    //     toE164(user.phone),
    //     `Your SizemoreTaxi password reset code is ${passwordResetOTP}. It expires in 10 minutes.`
    //   );
    // }

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

    await sendEmail(
      user.email,
      "Confirm your phone number change",
      `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #0F172A; color: #ffffff; border-radius: 16px;">
          <h2 style="color: #22D3EE;">Confirm your new phone number</h2>
          <p style="color: #cbd5e1; font-size: 15px; line-height: 1.6;">
            We received a request to change your SizemoreTaxi phone number to
            <strong>${newPhone}</strong>. Use the code below to confirm it. It expires in 10 minutes.
          </p>
          <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #22D3EE;">${otp}</p>
          <p style="color: #64748b; font-size: 13px; margin-top: 24px;">
            If you didn't request this, you can safely ignore this email.
          </p>
        </div>
      `
    );

    // Re-enable once Twilio's Kenya Alpha Sender ID is approved:
    // await sendSMS(toE164(newPhone), `Your SizemoreTaxi phone-change verification code is ${otp}. It expires in 10 minutes.`);

    return response(res, 200, "OTP sent to your email.");
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

    await sendEmail(
      newEmail,
      "Confirm your new email address",
      `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #0F172A; color: #ffffff; border-radius: 16px;">
          <h2 style="color: #22D3EE;">Confirm your email change</h2>
          <p style="color: #cbd5e1; font-size: 15px; line-height: 1.6;">
            Use the code below to confirm this is your new email address. It expires in 10 minutes.
          </p>
          <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #22D3EE;">${otp}</p>
        </div>
      `
    );

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
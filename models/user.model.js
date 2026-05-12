import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        email: { type: String, required: true, unique: true, lowercase: true },
        phone: { type: String, required: true, unique: true },
        password: { type: String, required: true, minlength: 8 },
        profilePicture: { type: String },

        role: {
            type: String,
            enum: ["driver", "rider", "admin"],
            default: "rider"
        },

        // === EMAIL RESET ===
        emailResetToken: String,
        emailResetExpires: Date,
        emailChangeOTP: String,
        emailChangeOTPExpires: Date,
        newEmailPending: String,

        // === PHONE CHANGE ===
        phoneChangeOTP: String,
        phoneChangeOTPExpires: Date,
        newPhonePending: String,

        // === REGISTRATION VERIFICATION ===
        registrationOTP: String,
        registrationOTPExpires: Date,

        // === PASSWORD RESET ===
        passwordResetOTP: String,
        passwordResetOTPExpires: Date,

        isEmailVerified: { type: Boolean, default: false },

        isBlocked: { type: Boolean, default: false },

        // === IS CURRENTLY IN A RIDE ===
        isRiding: { type: Boolean, default: false },

        // === CAR DETAILS / DRIVER DETAILS LINKED WITH CAR ===
        carModel: { type: String },
        carNumber: { type: String },
        // carType: { type: String, enum: ["comfort", "business", "premium",], },
        enum: ["Chopper", "Comfort", "Business", "Premium"],
        licenseNumber: { type: String }, // existing driving license
        idNumber: { type: String }, // ID number field
    },
    { timestamps: true }
);

userSchema.pre("save", async function (next) {
    if (process.env.NODE_ENV === "test") return next();
    // If user is NOT a driver but tries to save driver-only fields
    if (this.role !== "driver") {
        if (this.carModel || this.carNumber || this.carType || this.licenseNumber || this.idNumber) {
            return next(new Error("Only users with role 'driver' can have vehicle and ID fields."));
        }
    }

    if (this.role === "admin") {
        const existingAdmin = await this.constructor.findOne({ role: "admin" });

        if (existingAdmin && existingAdmin._id.toString() !== this._id?.toString()) {
            return next(new Error("An Admin account already exists"));
        }
    }
    next();
});

export const User = mongoose.model("User", userSchema);

import mongoose from "mongoose";

const tripSchema = new mongoose.Schema(
    {
        rider: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        driver: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },

        pickupLocation: {
            lat: Number,
            lng: Number,
            address: String,
        },
        dropoffLocation: {
            lat: Number,
            lng: Number,
            address: String,
        },

        status: {
            type: String,
            enum: ["pending", "assigned", "requested", "accepted", "in_progress", "completed", "cancelled"],
            default: "pending"
        },

        scheduledTime: {
            type: Date,
            required: true,
            validate: {
                validator: function (value) {
                    // ✅ Only validate when creating a new trip
                    if (!this.isNew) return true;

                    const now = new Date();
                    const minTime = new Date(now.getTime() + 30 * 60 * 1000);
                    return value > minTime;
                },
                message: "Trip must be scheduled at least 30 minutes in advance.",
            },
        },

        startTime: Date,
        endTime: Date,

        fare: {
            type: Number,
            required: true,
        },

        ratingByRider: {
            type: Number,
            min: 1,
            max: 5,
        },

        cancellationReason: {
            type: String,
        },

        vehicleType: {
            type: String,
            enum: ["Comfort", "Business", "Premium", "Chopper"],
            // required: true,
        },
    },
    { timestamps: true }
);

export const Trip = mongoose.model("Trip", tripSchema);

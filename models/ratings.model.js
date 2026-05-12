import mongoose from "mongoose";

const ratingSchema = new mongoose.Schema(
    {
        rideId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Trip",
            required: true,
            unique: true,
        },
        rider: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        driver: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        stars: {
            type: Number,
            min: 1,
            max: 5,
            required: true,
        },
    },
    { timestamps: true }
);

export const Rating = mongoose.model("Rating", ratingSchema);

import mongoose from "mongoose";

const feedbackSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    userName: { type: String, required: true },
    userRole: { type: String, enum: ["rider", "driver"], required: true },
    message: { type: String, required: true },
    type: { type: String, default: "feedback" },
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: "Trip", default: null },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    rating: { type: Number, min: 0, max: 5, default: 0 },
    handled: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Feedback = mongoose.model("Feedback", feedbackSchema);
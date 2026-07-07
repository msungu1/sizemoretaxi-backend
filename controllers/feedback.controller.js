// controllers/feedback.controller.js
import { Feedback } from "../models/feedback.model.js";
import { emitToAdmin } from "../lib/socket.js";
import mongoose from "mongoose";

const response = (res, status, message, data = null) =>
  res.status(status).json({ status, message, data });

// ─────────────────────────────────────────────
// Rider (or driver) submits feedback
// ─────────────────────────────────────────────
export const submitFeedback = async (req, res) => {
  try {
    const { userId, userName, userRole, message, type, tripId, driverId, rating } = req.body;

    if (!userId || !userName || !userRole || !message) {
      return response(res, 400, "userId, userName, userRole and message are required.");
    }

    const feedback = await Feedback.create({
      userId,
      userName,
      userRole,
      message,
      type: type || "feedback",
      tripId: tripId && mongoose.Types.ObjectId.isValid(tripId) ? tripId : null,
      driverId: driverId && mongoose.Types.ObjectId.isValid(driverId) ? driverId : null,
      rating: rating || 0,
    });

    // Notify admin dashboard in real time
    emitToAdmin("new_feedback", {
      id: feedback._id,
      userName: feedback.userName,
      userRole: feedback.userRole,
      message: feedback.message,
      rating: feedback.rating,
      timestamp: feedback.createdAt,
    });

    return response(res, 201, "Feedback submitted successfully.", feedback);
  } catch (err) {
    console.error("❌ submitFeedback error:", err);
    return response(res, 500, "Internal server error.");
  }
};

// ─────────────────────────────────────────────
// Admin fetches all feedback
// ─────────────────────────────────────────────
export const getAllFeedback = async (req, res) => {
  try {
    const feedbacks = await Feedback.find()
      .sort({ createdAt: -1 })
      .populate("driverId", "name carModel carNumber");

    return response(res, 200, "Feedback fetched.", feedbacks);
  } catch (err) {
    console.error("❌ getAllFeedback error:", err);
    return response(res, 500, "Internal server error.");
  }
};

// ─────────────────────────────────────────────
// Admin marks feedback as handled
// ─────────────────────────────────────────────
export const markFeedbackHandled = async (req, res) => {
  try {
    const { feedbackId } = req.params;

    if (!feedbackId || !mongoose.Types.ObjectId.isValid(feedbackId)) {
      return response(res, 400, "Invalid feedbackId.");
    }

    const feedback = await Feedback.findByIdAndUpdate(
      feedbackId,
      { handled: true },
      { new: true }
    );

    if (!feedback) return response(res, 404, "Feedback not found.");

    return response(res, 200, "Feedback marked as handled.", feedback);
  } catch (err) {
    console.error("❌ markFeedbackHandled error:", err);
    return response(res, 500, "Internal server error.");
  }
};
import express from "express";
import {
  submitFeedback,
  getAllFeedback,
  markFeedbackHandled,
} from "../controllers/feedback.controller.js";

const router = express.Router();

router.post("/", submitFeedback);
router.get("/", getAllFeedback);
router.patch("/:feedbackId/handle", markFeedbackHandled);

export default router;
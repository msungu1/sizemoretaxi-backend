import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";

const response = (res, status, message, data = null) => {
  return res.status(status).json({ status, message, data });
};

export const refreshAccessToken = async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) return response(res, 401, "Refresh token missing.");

  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);

    const user = await User.findById(decoded.id);
    if (!user) return response(res, 404, "User not found.");

    const accessToken = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    return response(res, 200, "Access token refreshed.", { accessToken });
  } catch (err) {
    console.error(err);
    return response(res, 403, "Invalid or expired refresh token.");
  }
};

import { User } from "../models/user.model.js";
import jwt from "jsonwebtoken";

export const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ status: 401, message: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ status: 404, message: "User not found" });

    req.user = { id: user._id, role: user.role }; // ✅
    next();
  } catch (err) {
    return res.status(403).json({ status: 403, message: "Invalid or expired token" });
  }
};

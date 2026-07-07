import { Rating } from "../models/ratings.model.js";
import { User } from "../models/user.model.js";
import { Trip } from "../models/trip.model.js";


export const rateDriver = async (req, res) => {
    const { tripId, stars } = req.body;
    const userId = req.user.id;

    if (!tripId || !stars) {
        return res.status(400).json({ message: "Trip ID and stars are required." });
    }

    try {
        const trip = await Trip.findById(tripId).populate("rider driver");

        if (!trip) return res.status(404).json({ message: "Trip not found." });
        if (trip.rider._id.toString() !== userId) {
            return res.status(403).json({ message: "You can only rate your own trip." });
        }

        const alreadyRated = await Rating.findOne({ rideId: tripId });
        if (alreadyRated) {
            return res.status(400).json({ message: "You already rated this trip." });
        }

        await Rating.create({
            rideId: tripId,
            rider: userId,
            driver: trip.driver._id,
            stars,
        });

        // ✅ Aggregate ratings to calculate new driver average
        const allRatings = await Rating.find({ driver: trip.driver._id });
        const totalStars = allRatings.reduce((sum, rating) => sum + rating.stars, stars);
        const totalCount = allRatings.length + 1;
        const newAvg = parseFloat((totalStars / totalCount).toFixed(2));

        return res.status(201).json({ message: "Rating submitted.", newAverage: newAvg });
    } catch (err) {
        console.error("Rating error:", err);
        return res.status(500).json({ message: "Internal server error.", error: err.message });
    }

    export const getDriverRatings = async (req, res) => {
  try {
    const ratings = await Rating.find()
      .populate("rider", "name phone")
      .populate("driver", "name phone carModel carNumber")
      .sort({ createdAt: -1 });

    return res.status(200).json({ status: 200, message: "Ratings fetched.", data: ratings });
  } catch (err) {
    return res.status(500).json({ status: 500, message: "Internal server error.", error: err.message });
  }
};
};
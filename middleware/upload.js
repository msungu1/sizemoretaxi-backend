import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";

const storage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => {
        let folder = "sizemore";

        switch (file.fieldname) {
            case "driverPhoto":
                folder = "sizemore/drivers/profile";
                break;

            case "licensePhoto":
                folder = "sizemore/drivers/licenses";
                break;

            case "nationalIdPhoto":
                folder = "sizemore/drivers/national_ids";
                break;

            case "vehiclePhoto":
                folder = "sizemore/drivers/vehicles";
                break;

            default:
                folder = "sizemore/others";
        }

        return {
            folder,
            allowed_formats: ["jpg", "jpeg", "png"],
            transformation: [
                {
                    width: 800,
                    height: 800,
                    crop: "limit",
                },
            ],
        };
    },
});

export const upload = multer({ storage });
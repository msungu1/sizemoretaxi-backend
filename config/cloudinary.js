import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

export default cloudinary;


// CLOUDINARY_URL=cloudinary://<your_api_key>:<your_api_secret>@dovho0fdz
// cloudinary apikey 498451226226119
// api secret yu8hE7w5gOO_QB0jnyV6B5-ziAc
//cloud name dovho0fdz
import mongoose from "mongoose"

export const connectDB = async () => {
    try {
        const connect = await mongoose.connect(process.env.DB_URL)
        if (connect) {
            console.log("DATABASE CONNECTED")
        }
    } catch (error) {
        console.log(`MONGODB ERROR CONNECTING: ${error.message}`)
    }
}
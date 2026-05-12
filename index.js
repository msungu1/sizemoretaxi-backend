import dotenv from "dotenv"
dotenv.config()

import { server } from "./server.js"

// Use Render's port or 10000
const PORT = process.env.PORT || 10000 

server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`)
})
import dotenv from "dotenv"
dotenv.config()

import { server } from "./server.js"

const PORT = process.env.PORT || 5000

server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`)
})
app.get('/', (req, res) => {
  res.send('Server is running perfectly!');
});
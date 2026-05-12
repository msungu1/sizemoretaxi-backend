import dotenv from "dotenv"
dotenv.config()

import { server } from "./server.js"

const PORT = process.env.PORT || 10000 // Render uses 10000 by default

// Use 'server' instead of 'app'
server.on('request', (req, res) => {
  if (req.url === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Sizemore Taxi Server is Live!');
  }
});

server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`)
})
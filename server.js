// server.js
import http from "http"
import { Server } from "socket.io"
import app from "./app.js"
import { Trip } from "./models/trip.model.js"
import { initSocket } from "./lib/socket.js"
import { twilioClient } from "./lib/MailAndSMSNotifications.js"


const PORT = process.env.PORT || 5000

export const server = http.createServer(app)
initSocket(server)

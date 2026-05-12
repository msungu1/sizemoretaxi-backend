import "dotenv/config.js"
import nodemailer from "nodemailer"
import twilio from "twilio"

const EMAIL_USER = process.env.EMAIL_USER
const EMAIL_PASS = process.env.EMAIL_PASS

console.log(EMAIL_PASS)
console.log(EMAIL_USER)

export const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
    },

})

export const sendEmail = async (to, subject, html) => {
    try {
        const info = await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to,
            subject,
            html
        })
        return info
    } catch (error) {
        console.log(error.message)
    }
}

export const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN)
export const sendSMS = async (to, body) => {
    try {
        const message = await twilioClient.messages.create({
            body,
            from: process.env.TWILIO_PHONE,
            to,
        })
        return message
    } catch (error) {
        console.log(error.message)
    }
}
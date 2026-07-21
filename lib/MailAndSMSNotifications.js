import "dotenv/config.js"
import nodemailer from "nodemailer"
import twilio from "twilio"

const EMAIL_USER = process.env.EMAIL_USER
const EMAIL_PASS = process.env.EMAIL_PASS

console.log(EMAIL_PASS)
console.log(EMAIL_USER)

// export const transporter = nodemailer.createTransport({
//     service: "gmail",
//     auth: {
//         user: EMAIL_USER,
//         pass: EMAIL_PASS
//     },

// });
export const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  requireTLS: true,

  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },

  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000,

  tls: {
    rejectUnauthorized: false,
  },
});


transporter.verify((error) => {
  if (error) {
    console.error("❌ Email transporter error:", error);
  } else {
    console.log("✅ Email transporter ready");
  }
});
// export const sendEmail = async (to, subject, html) => {
//     try {
//             console.time(`Email -> ${to}`);
//         const info = await transporter.sendMail({
//             from: process.env.EMAIL_USER,
//             to,
//             subject,
//             html
//         })
//         return info
//     } catch (error) {
//         console.log(error.message)
//     }
// }
export const sendEmail = async (to, subject, html) => {
  try {
    console.time(`Email -> ${to}`);

    const info = await transporter.sendMail({
      from: `"SizemoreTaxi" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });

    console.timeEnd(`Email -> ${to}`);

    return info;
  } catch (error) {
    console.error("❌ Email Error:", error);
    throw error;
  }
};

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
// import "dotenv/config.js"
// import nodemailer from "nodemailer"
// import twilio from "twilio"

// const EMAIL_USER = process.env.EMAIL_USER
// const EMAIL_PASS = process.env.EMAIL_PASS

// console.log(EMAIL_PASS)
// console.log(EMAIL_USER)

// // export const transporter = nodemailer.createTransport({
// //     service: "gmail",
// //     auth: {
// //         user: EMAIL_USER,
// //         pass: EMAIL_PASS
// //     },

// // });
// export const transporter = nodemailer.createTransport({
//   host: "smtp.gmail.com",
//   port: 587,
//   secure: false,
//   requireTLS: true,

//   auth: {
//     user: process.env.EMAIL_USER,
//     pass: process.env.EMAIL_PASS,
//   },

//   connectionTimeout: 10000,
//   greetingTimeout: 10000,
//   socketTimeout: 10000,

//   tls: {
//     rejectUnauthorized: false,
//   },
// });


// transporter.verify((error) => {
//   if (error) {
//     console.error("❌ Email transporter error:", error);
//   } else {
//     console.log("✅ Email transporter ready");
//   }
// });
// // export const sendEmail = async (to, subject, html) => {
// //     try {
// //             console.time(`Email -> ${to}`);
// //         const info = await transporter.sendMail({
// //             from: process.env.EMAIL_USER,
// //             to,
// //             subject,
// //             html
// //         })
// //         return info
// //     } catch (error) {
// //         console.log(error.message)
// //     }
// // }
// export const sendEmail = async (to, subject, html) => {
//   try {
//     console.time(`Email -> ${to}`);

//     const info = await transporter.sendMail({
//       from: `"SizemoreTaxi" <${process.env.EMAIL_USER}>`,
//       to,
//       subject,
//       html,
//     });

//     console.timeEnd(`Email -> ${to}`);

//     return info;
//   } catch (error) {
//     console.error("❌ Email Error:", error);
//     throw error;
//   }
// };

// export const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN)
// export const sendSMS = async (to, body) => {
//     try {
//         const message = await twilioClient.messages.create({
//             body,
//             from: process.env.TWILIO_PHONE,
//             to,
//         })
//         return message
//     } catch (error) {
//         console.log(error.message)
//     }
// }

import "dotenv/config.js"
import twilio from "twilio"

const EMAIL_USER = process.env.EMAIL_USER // must be a verified sender in Brevo
const BREVO_API_KEY = process.env.BREVO_API_KEY

console.log("EMAIL_USER:", EMAIL_USER)
console.log("BREVO_API_KEY set:", !!BREVO_API_KEY)

// Sends email over HTTPS via Brevo's REST API instead of SMTP.
// Render's free tier blocks ALL outbound SMTP ports (25, 465, 587), so
// Nodemailer + Gmail SMTP will ALWAYS time out there, no matter which
// port/TLS combination you try. Brevo's API is a plain HTTPS POST, so it
// works on Render's free tier with no upgrade needed.
export const sendEmail = async (to, subject, html) => {
  try {
    console.time(`Email -> ${to}`);

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
        "api-key": BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: { email: EMAIL_USER, name: "SizemoreTaxi" },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });

    console.timeEnd(`Email -> ${to}`);

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Brevo error ${res.status}: ${errBody}`);
    }

    return await res.json();
  } catch (error) {
    console.error("❌ Email Error:", error.message);
    throw error;
  }
};

// SMS left intact for when Twilio's Kenya Alpha Sender ID is approved.
export const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN)

const toE164 = (number) => {
  const raw = String(number).trim()
  return raw.startsWith("+") ? raw : `+${raw.replace(/^0+/, "")}`
}

export const sendSMS = async (to, body) => {
  try {
    const message = await twilioClient.messages.create({
      body,
      from: toE164(process.env.TWILIO_PHONE),
      to: toE164(to),
    })
    return message
  } catch (error) {
    console.log(error.message)
  }
}
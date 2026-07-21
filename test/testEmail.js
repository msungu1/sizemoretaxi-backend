// import nodemailer from "nodemailer";
// import dotenv from "dotenv";

// dotenv.config();

// const transporter = nodemailer.createTransport({
//     host: "smtp.gmail.com",
//     port: 465,
//     secure: true,
//     auth: {
//         user: process.env.EMAIL_USER,
//         pass: process.env.EMAIL_PASS,
//     },
// });

// (async () => {
//     try {
//         console.log("Connecting...");

//         await transporter.verify();

//         console.log("Connected!");

//         await transporter.sendMail({
//             from: process.env.EMAIL_USER,
//             to: "akidivarobert@gmail.com",
//             subject: "Testing",
//             html: "<h1>Hello</h1>",
//         });

//         console.log("Email sent");
//     } catch (err) {
//         console.error(err);
//     }
// })();
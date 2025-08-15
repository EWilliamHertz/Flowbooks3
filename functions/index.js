// functions/index.js

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");
const imaps = require("imap-simple");
const nodemailer = require("nodemailer");
const cors = require("cors")({origin: true});

admin.initializeApp();
const db = admin.firestore();

// ===================================
//  Mail Client Functions and Utilities
// ===================================

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const IV_LENGTH = 16;

function encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString("hex") + ":" + encrypted.toString("hex");
}

function decrypt(text) {
    const textParts = text.split(":");
    const iv = Buffer.from(textParts.shift(), "hex");
    const encryptedText = Buffer.from(textParts.join(":"), "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

// Securely saves user's mail credentials
exports.saveMailCredentials = functions.runWith({ secrets: ["ENCRYPTION_KEY"] }).https.onCall(async (data, context) => {
    if (!context.auth) { throw new functions.https.HttpsError("unauthenticated", "You must be logged in."); }
    const { username, password, imap, smtp } = data;
    const uid = context.auth.uid;
    const userDoc = await db.collection("users").doc(uid).get();
    const companyId = userDoc.data().companyId;
    if (!companyId) { throw new functions.https.HttpsError("failed-precondition", "User not associated with a company.");}
    const encryptedPassword = encrypt(password);
    const mailSettingsRef = db.collection("companies").doc(companyId).collection("mailSettings").doc(uid);
    await mailSettingsRef.set({ username, encryptedPassword, imap, smtp });
    return { success: true };
});

// Fetches email list for the inbox
exports.listInbox = functions.runWith({ secrets: ["ENCRYPTION_KEY"] }).https.onCall(async (data, context) => {
    if (!context.auth) { throw new functions.https.HttpsError("unauthenticated", "You must be logged in."); }
    const uid = context.auth.uid;
    const userDoc = await db.collection("users").doc(uid).get();
    const companyId = userDoc.data().companyId;
    const settingsRef = db.collection("companies").doc(companyId).collection("mailSettings").doc(uid);
    const settingsDoc = await settingsRef.get();
    if (!settingsDoc.exists) { throw new functions.https.HttpsError("not-found", "No mail settings found.");}
    const settings = settingsDoc.data();
    const password = decrypt(settings.encryptedPassword);

    const config = {
        imap: {
            user: settings.username,
            password,
            host: settings.imap.host,
            port: settings.imap.port,
            tls: true,
            tlsOptions: { rejectUnauthorized: false },
            authTimeout: 8000
        }
    };

    try {
        const connection = await imaps.connect(config);
        await connection.openBox("INBOX");
        const messages = await connection.search(["ALL"], { bodies: ["HEADER.FIELDS (FROM SUBJECT DATE)"] });
        const emails = messages.map(item => {
            const header = item.parts.find(p => p.which === "HEADER.FIELDS (FROM SUBJECT DATE)").body;
            return { from: header.from[0], subject: header.subject[0], date: header.date[0] };
        });
        connection.end();
        return { emails: emails.reverse().slice(0, 50) };
    } catch (error) {
        console.error("IMAP connection failed with detailed error:", error);
        throw new functions.https.HttpsError("internal", `Failed to connect to the mail server: ${error.message}`);
    }
});

// Sends an email
exports.sendEmail = functions.runWith({ secrets: ["ENCRYPTION_KEY"] }).https.onCall(async (data, context) => {
    if (!context.auth) { throw new functions.https.HttpsError("unauthenticated", "You must be logged in."); }
    const { to, subject, body } = data;
    const uid = context.auth.uid;
    const userDoc = await db.collection("users").doc(uid).get();
    const companyId = userDoc.data().companyId;
    const settingsRef = db.collection("companies").doc(companyId).collection("mailSettings").doc(uid);
    const settingsDoc = await settingsRef.get();
    if (!settingsDoc.exists) { throw new functions.https.HttpsError("not-found", "No mail settings found.");}
    const settings = settingsDoc.data();
    const password = decrypt(settings.encryptedPassword);

    const transporter = nodemailer.createTransport({
        host: settings.smtp.host,
        port: settings.smtp.port,
        secure: true,
        auth: { user: settings.username, pass: password },
        tls: { rejectUnauthorized: false }
    });

    try {
        await transporter.sendMail({
            from: `"${userDoc.data().firstName} ${userDoc.data().lastName}" <${settings.username}>`,
            to: to,
            subject: subject,
            html: body,
        });
        return { success: true };
    } catch (error) {
        console.error("Nodemailer failed to send email with detailed error:", error);
        throw new functions.https.HttpsError("internal", `Failed to send email: ${error.message}`);
    }
});

// ===================================
//  Existing Banking Functions
// ===================================

exports.fetchBankData = functions.https.onRequest((req, res) => {
    cors(req, res, () => {
        // Your actual code for fetchBankData goes here
        res.send("This is the fetchBankData function.");
    });
});

exports.exchangeCodeForToken = functions.https.onRequest((req, res) => {
    cors(req, res, () => {
        // Your actual code for exchangeCodeForToken goes here
        res.send("This is the exchangeCodeForToken function.");
    });
});

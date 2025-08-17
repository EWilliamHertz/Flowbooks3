// functions/index.js

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");
const imaps = require("imap-simple");
const nodemailer = require("nodemailer");
const cors = require("cors")({origin: true});
const { simpleParser } = require("mailparser");
const { google } = require("googleapis");

admin.initializeApp();
const db = admin.firestore();
const fieldValue = admin.firestore.FieldValue;

// ... (Alla andra funktioner som encrypt, decrypt, listInbox etc. förblir oförändrade) ...
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const IV_LENGTH = 16;
const OAUTH_REDIRECT_URI = `https://us-central1-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/handleGoogleAuthCallback`;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ===================================
//  Encryption Utilities
// ===================================

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

// ===================================
//  Mail Client Core Functions
// ===================================

async function getMailSettings(uid, companyId) {
    const settingsRef = db.collection("companies").doc(companyId).collection("mailSettings").doc(uid);
    const settingsDoc = await settingsRef.get();
    if (!settingsDoc.exists) {
        // Return null instead of throwing an error for the scheduler
        return null;
    }
    return settingsDoc.data();
}

exports.saveMailCredentials = functions.runWith({ secrets: ["ENCRYPTION_KEY"] }).https.onCall(async (data, context) => {
    if (!context.auth) { throw new functions.https.HttpsError("unauthenticated", "You must be logged in."); }
    const { username, password, imap, smtp } = data;
    const uid = context.auth.uid;
    const userDoc = await db.collection("users").doc(uid).get();
    const companyId = userDoc.data().companyId;
    if (!companyId) { throw new functions.https.HttpsError("failed-precondition", "User not associated with a company.");}
    const encryptedPassword = encrypt(password);
    const mailSettingsRef = db.collection("companies").doc(companyId).collection("mailSettings").doc(uid);
    await mailSettingsRef.set({
        type: 'manual',
        username,
        encryptedPassword,
        imap,
        smtp
    });
    return { success: true };
});

exports.listInbox = functions.runWith({ secrets: ["ENCRYPTION_KEY"] }).https.onCall(async (data, context) => {
    if (!context.auth) { throw new functions.https.HttpsError("unauthenticated", "You must be logged in."); }
    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    const companyId = userDoc.data().companyId;
    const settings = await getMailSettings(context.auth.uid, companyId);
    if (!settings) {
        throw new functions.https.HttpsError("not-found", "No mail settings found for this user in the specified company.");
    }
    const password = decrypt(settings.encryptedPassword);
    const config = { imap: { user: settings.username, password, host: settings.imap.host, port: settings.imap.port, tls: true, tlsOptions: { rejectUnauthorized: false } } };
    const connection = await imaps.connect(config);
    await connection.openBox("INBOX");
    const messages = await connection.search(["ALL"], { bodies: ["HEADER.FIELDS (FROM SUBJECT DATE)"], struct: true });
    const emails = messages.map(item => ({
        uid: item.attributes.uid,
        from: item.parts.find(p => p.which === "HEADER.FIELDS (FROM SUBJECT DATE)").body.from[0],
        subject: item.parts.find(p => p.which === "HEADER.FIELDS (FROM SUBJECT DATE)").body.subject[0],
        date: item.parts.find(p => p.which === "HEADER.FIELDS (FROM SUBJECT DATE)").body.date[0],
    }));
    connection.end();
    return { emails: emails.reverse().slice(0, 50) };
});

exports.fetchEmailContent = functions.runWith({ secrets: ["ENCRYPTION_KEY"] }).https.onCall(async (data, context) => {
    if (!context.auth) { throw new functions.https.HttpsError("unauthenticated", "You must be logged in."); }
    const { uid } = data;
    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    const companyId = userDoc.data().companyId;
    const settings = await getMailSettings(context.auth.uid, companyId);
    if (!settings) { throw new functions.https.HttpsError("not-found", "No mail settings found."); }
    const password = decrypt(settings.encryptedPassword);
    const config = { imap: { user: settings.username, password, host: settings.imap.host, port: settings.imap.port, tls: true, tlsOptions: { rejectUnauthorized: false } } };
    const connection = await imaps.connect(config);
    await connection.openBox("INBOX");
    const messages = await connection.search([["UID", uid]], { bodies: [""], struct: true });
    if (messages.length === 0) { throw new functions.https.HttpsError("not-found", "Email not found."); }
    const emailBody = messages[0].parts.find(p => p.which === "").body;
    const parsedEmail = await simpleParser(emailBody);
    connection.end();
    return {
        from: parsedEmail.from.text, to: parsedEmail.to.text, subject: parsedEmail.subject,
        date: parsedEmail.date, html: parsedEmail.html || parsedEmail.textAsHtml,
        attachments: parsedEmail.attachments.map(att => ({ filename: att.filename, contentType: att.contentType, size: att.size }))
    };
});

exports.sendEmail = functions.runWith({ secrets: ["ENCRYPTION_KEY"] }).https.onCall(async (data, context) => {
    if (!context.auth) { throw new functions.https.HttpsError("unauthenticated", "You must be logged in."); }
    const { to, subject, body, attachments } = data;
    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    const companyId = userDoc.data().companyId;
    const settings = await getMailSettings(context.auth.uid, companyId);
    if (!settings) { throw new functions.https.HttpsError("not-found", "No mail settings found."); }
    const password = decrypt(settings.encryptedPassword);
    const transporter = nodemailer.createTransport({ host: settings.smtp.host, port: settings.smtp.port, secure: true, auth: { user: settings.username, pass: password } });
    await transporter.sendMail({ from: `"${userDoc.data().firstName} ${userDoc.data().lastName}" <${settings.username}>`, to, subject, html: body, attachments });
    return { success: true };
});

// UPPDATERAD FUNKTION
exports.sendInvoiceWithAttachment = functions.runWith({ secrets: ["ENCRYPTION_KEY"] }).https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "You must be logged in.");
    }
    
    // Hämta companyId från datan som skickas från frontend
    const { to, subject, body, attachments, companyId } = data;

    if (!to || !subject || !body || !attachments || attachments.length === 0 || !companyId) {
        throw new functions.https.HttpsError("invalid-argument", "To, subject, body, companyId, and attachments are required.");
    }
    
    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    if (!userDoc.exists) {
        throw new functions.https.HttpsError("unauthenticated", "User not found.");
    }

    // Använd det companyId som skickades med för att hämta rätt inställningar
    const settings = await getMailSettings(context.auth.uid, companyId);
    if (!settings) { 
        throw new functions.https.HttpsError("not-found", "No mail settings found for this user. Please configure your email account first."); 
    }
    
    const password = decrypt(settings.encryptedPassword);

    const transporter = nodemailer.createTransport({ 
        host: settings.smtp.host, 
        port: settings.smtp.port, 
        secure: true, 
        auth: { 
            user: settings.username, 
            pass: password 
        } 
    });

    const mailOptions = {
        from: `"${userDoc.data().firstName} ${userDoc.data().lastName}" <${settings.username}>`,
        to,
        subject,
        html: body,
        attachments: attachments.map(att => ({
            filename: att.filename,
            content: Buffer.from(att.content, 'base64'),
            contentType: att.contentType || 'application/pdf'
        }))
    };
    
    await transporter.sendMail(mailOptions);
    return { success: true };
});

// ... (Resten av dina funktioner, t.ex. sendInvoiceReminders, AI-funktioner, etc., förblir oförändrade) ...
// ===================================
//  Invoice Reminder Scheduler
// ===================================
exports.sendInvoiceReminders = functions.runWith({ secrets: ["ENCRYPTION_KEY"] }).pubsub.schedule('every day 09:00').onRun(async (context) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const companiesSnap = await db.collection('companies').get();

    for (const companyDoc of companiesSnap.docs) {
        const company = companyDoc.data();
        const settings = company.reminderSettings;
        if (!settings || !settings.enabled) {
            continue;
        }
        
        const mailSettings = await getMailSettings(company.ownerId, companyDoc.id);
        if(!mailSettings) continue;

        const invoicesSnap = await db.collection('invoices')
            .where('companyId', '==', companyDoc.id)
            .where('status', 'in', ['Skickad', 'Delvis betald'])
            .get();

        for (const invoiceDoc of invoicesSnap.docs) {
            const invoice = invoiceDoc.data();
            if (!invoice.dueDate) continue;

            const dueDate = new Date(invoice.dueDate);
            const daysDiff = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));

            let shouldSend = false;
            let reminderType = '';

            if (settings.before && daysDiff === settings.daysBefore) {
                shouldSend = true;
                reminderType = 'before';
            } else if (settings.on && daysDiff === 0) {
                shouldSend = true;
                reminderType = 'on';
            } else if (settings.after && daysDiff === -settings.daysAfter) {
                shouldSend = true;
                reminderType = 'after';
            }

            if (shouldSend && invoice.customerEmail) {
                const password = decrypt(mailSettings.encryptedPassword);
                const transporter = nodemailer.createTransport({ host: mailSettings.smtp.host, port: mailSettings.smtp.port, secure: true, auth: { user: mailSettings.username, pass: password } });
                
                const subject = `Påminnelse: Faktura #${invoice.invoiceNumber} från ${company.name}`;
                const body = `<p>Hej,</p><p>Detta är en vänlig påminnelse om faktura #${invoice.invoiceNumber} som ${reminderType === 'after' ? 'förföll' : 'förfaller'} ${invoice.dueDate}.</p><p>Belopp att betala: ${invoice.balance.toLocaleString('sv-SE', {style: 'currency', currency: 'SEK'})}</p><p>Vänligen bortse från detta meddelande om betalning redan är gjord.</p><br><p>Med vänliga hälsningar,</p><p>${company.name}</p>`;

                await transporter.sendMail({ from: `"${company.name}" <${mailSettings.username}>`, to: invoice.customerEmail, subject, html: body });
                
                await invoiceDoc.ref.update({
                    remindersSent: fieldValue.arrayUnion({ date: new Date().toISOString(), type: reminderType })
                });
            }
        }
    }
    return null;
});

// ===================================
//  AI & Google Integration Functions
// ===================================
// (The rest of the functions: getAIEmailSuggestion, getGoogleAuthUrl, etc. remain unchanged)
exports.getAIEmailSuggestion = functions.runWith({ secrets: ["GEMINI_API_KEY"] }).https.onCall(async (data, context) => {
    if (!context.auth) { throw new functions.https.HttpsError("unauthenticated", "You must be logged in."); }

    const { prompt } = data;
    const fullPrompt = `You are a professional business assistant. Write a clear, concise, and polite email based on the following instruction. Respond with only the HTML body of the email. Instruction: "${prompt}"`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }] })
    });
    const result = await response.json();

    if (result.candidates && result.candidates.length > 0 && result.candidates[0].content && result.candidates[0].content.parts) {
        const suggestion = result.candidates[0].content.parts[0].text;
        return { suggestion };
    } else {
        console.error("AI suggestion failed: Invalid response structure from API", result);
        throw new functions.https.HttpsError("internal", "Failed to get AI suggestion due to invalid API response.");
    }
});

exports.getGoogleAuthUrl = functions.runWith({ secrets: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] }).https.onCall((data, context) => {
    if (!context.auth) { throw new functions.https.HttpsError("unauthenticated", "You must be logged in."); }

    const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OAUTH_REDIRECT_URI);
    const scopes = ['https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/contacts.readonly'];
    const url = oauth2Client.generateAuthUrl({ access_type: 'offline', scope: scopes, state: context.auth.uid });
    return { authUrl: url };
});

exports.handleGoogleAuthCallback = functions.runWith({ secrets: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "ENCRYPTION_KEY"] }).https.onRequest(async (req, res) => {
    const { code, state } = req.query;
    const uid = state;
    const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OAUTH_REDIRECT_URI);

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const people = google.people({ version: 'v1', auth: oauth2Client });
    const profile = await people.people.get({ resourceName: 'people/me', personFields: 'emailAddresses' });
    const email = profile.data.emailAddresses[0].value;

    const userDoc = await db.collection("users").doc(uid).get();
    const companyId = userDoc.data().companyId;
    const mailSettingsRef = db.collection("companies").doc(companyId).collection("mailSettings").doc(uid);

    await mailSettingsRef.set({
        type: 'google',
        username: email,
        refreshToken: encrypt(tokens.refresh_token)
    }, { merge: true });

    res.send("<script>window.close();</script><h1>Authentication successful! You can close this window.</h1>");
});

exports.listGoogleContacts = functions.runWith({ secrets: ["ENCRYPTION_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] }).https.onCall(async (data, context) => {
    if (!context.auth) { throw new functions.https.HttpsError("unauthenticated", "You must be logged in."); }
    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    const companyId = userDoc.data().companyId;
    const settings = await getMailSettings(context.auth.uid, companyId);
    if (settings.type !== 'google' || !settings.refreshToken) {
        throw new functions.https.HttpsError("failed-precondition", "Google account not connected.");
    }

    const refreshToken = decrypt(settings.refreshToken);
    const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const people = google.people({ version: 'v1', auth: oauth2Client });
    const { data: { connections } } = await people.people.connections.list({
        resourceName: 'people/me',
        pageSize: 500,
        personFields: 'names,emailAddresses',
    });

    const contacts = connections.map(person => ({
        name: person.names ? person.names[0].displayName : '',
        email: person.emailAddresses ? person.emailAddresses[0].value : '',
    })).filter(c => c.name && c.email);

    return { contacts };
});
// ===================================
//  Company Management Functions
// ===================================

exports.createNewCompany = functions.https.onCall(async (data, context) => {
    if (!context.auth) { throw new functions.https.HttpsError("unauthenticated", "You must be logged in."); }

    const { companyName } = data;
    if (!companyName) {
        throw new functions.https.HttpsError("invalid-argument", "Company name is required.");
    }

    const uid = context.auth.uid;
    const newCompanyRef = db.collection('companies').doc();

    await newCompanyRef.set({
        name: companyName,
        ownerId: uid,
        members: { [uid]: 'owner' },
        createdAt: fieldValue.serverTimestamp()
    });

    const userRef = db.collection('users').doc(uid);
    await userRef.update({
        userCompanies: fieldValue.arrayUnion({
            id: newCompanyRef.id,
            name: companyName,
            role: 'owner'
        })
    });

    return { companyId: newCompanyRef.id };
});

exports.joinCompany = functions.https.onCall(async (data, context) => {
    if (!context.auth) { throw new functions.https.HttpsError("unauthenticated", "You must be logged in."); }

    const { companyId } = data;
    if (!companyId) {
        throw new functions.https.HttpsError("invalid-argument", "Company ID is required.");
    }

    const uid = context.auth.uid;
    const companyRef = db.collection('companies').doc(companyId);
    const companyDoc = await companyRef.get();

    if (!companyDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Company not found.");
    }
    const companyData = companyDoc.data();

    await companyRef.update({
        [`members.${uid}`]: 'member'
    });

    const userRef = db.collection('users').doc(uid);
    await userRef.update({
        userCompanies: fieldValue.arrayUnion({
            id: companyId,
            name: companyData.name,
            role: 'member'
        })
    });

    return { success: true };
});

exports.deleteCompany = functions.https.onCall(async (data, context) => {
    if (!context.auth) { throw new functions.https.HttpsError("unauthenticated", "You must be logged in."); }

    const { companyId } = data;
    const uid = context.auth.uid;
    
    const companyRef = db.collection('companies').doc(companyId);
    const companyDoc = await companyRef.get();

    if (!companyDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Company not found.");
    }
    const companyData = companyDoc.data();
    const isOwner = companyData.ownerId === uid || (companyData.members && companyData.members[uid] === 'owner');

    if (!isOwner) {
        throw new functions.https.HttpsError("permission-denied", "Only the company owner can delete the company.");
    }
    const batch = db.batch();
    
    const collections = ['incomes', 'expenses', 'products', 'categories', 'recurring', 'invoices', 'contacts', 'quotes', 'mailSettings'];
    for (const collectionName of collections) {
        const snapshot = await db.collection(collectionName).where('companyId', '==', companyId).get();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
    }

    batch.delete(companyRef);
    if (companyData.members) {
        const memberIds = Object.keys(companyData.members);
        for (const memberId of memberIds) {
            const userRef = db.collection('users').doc(memberId);
            const userDoc = await userRef.get();
            if (userDoc.exists) {
                const userCompanies = userDoc.data().userCompanies || [];
                const companyToRemove = userCompanies.find(c => c.id === companyId);
                if (companyToRemove) {
                     batch.update(userRef, { userCompanies: fieldValue.arrayRemove(companyToRemove) });
                }
            }
        }
    } else if (companyData.ownerId) { // Fallback
        const userRef = db.collection('users').doc(companyData.ownerId);
        const userDoc = await userRef.get();
        if (userDoc.exists) {
            const userCompanies = userDoc.data().userCompanies || [];
            const companyToRemove = userCompanies.find(c => c.id === companyId);
            if (companyToRemove) {
                 batch.update(userRef, { userCompanies: fieldValue.arrayRemove(companyToRemove) });
            }
        }
    }

    await batch.commit();
    return { success: true };
});


// ===================================
//  Existing Banking Functions
// ===================================
exports.fetchBankData = functions.https.onRequest((req, res) => {
    cors(req, res, () => { res.send("This is the fetchBankData function."); });
});
exports.exchangeCodeForToken = functions.https.onRequest((req, res) => {
    cors(req, res, () => { res.send("This is the exchangeCodeForToken function."); });
});
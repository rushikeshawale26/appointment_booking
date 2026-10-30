require("dotenv").config();

const crypto = require("node:crypto");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookie = require("cookie");
const nodemailer = require("nodemailer");
const { ObjectId, MongoClient } = require("mongodb");

const app = express();
const PORT = Number(process.env.PORT) || 5050;
const MONGO_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const SESSION_COOKIE = "appointment_session";
const SMTP_PLACEHOLDERS = new Set([
    "smtp.example.com",
    "your-smtp-username",
    "your-smtp-password",
]);
const hasSmtpCredentials = [process.env.SMTP_HOST, process.env.SMTP_USER, process.env.SMTP_PASS]
    .every((value) => value && !SMTP_PLACEHOLDERS.has(value.trim().toLowerCase()));
const mailTransport = hasSmtpCredentials
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === "true",
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
    : null;
const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60 * 1000,
};

if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is required in production");
}

app.use(cors({
    origin: process.env.APP_ORIGIN || "http://localhost:5173",
    credentials: true,
}));
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: "32kb" }));

const mongoClient = new MongoClient(MONGO_URI);
let databasePromise;
function getDatabase() {
    if (!databasePromise) {
        databasePromise = mongoClient.connect().then(() => mongoClient.db("AppointmentBooking"));
    }
    return databasePromise;
}

function asyncRoute(handler) {
    return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function requireAuth(req, res, next) {
    const token = cookie.parseCookie(req.headers.cookie || "")[SESSION_COOKIE];
    if (!token) return res.status(401).json({ error: "Authentication required" });

    try {
        req.auth = jwt.verify(token, SESSION_SECRET);
        next();
    } catch {
        res.clearCookie(SESSION_COOKIE, COOKIE_OPTIONS);
        return res.status(401).json({ error: "Authentication required" });
    }
}

function requireRoles(...roles) {
    return (req, res, next) => {
        if (!req.auth || !roles.includes(req.auth.role)) {
            return res.status(403).json({ error: "Forbidden" });
        }
        next();
    };
}

function validId(id) {
    return ObjectId.isValid(id) && String(new ObjectId(id)) === id;
}

function normalizeStatus(status) {
    const value = String(status || "pending").toLowerCase();
    if (value === "accepted") return "accepted";
    if (value === "waited" || value === "waiting") return "waited";
    return "pending";
}

function serializeAppointment(appointment) {
    return { ...appointment, status: normalizeStatus(appointment.status) };
}

async function verifyAndUpgradePassword(collection, record, password, passwordField = "password") {
    const hash = record.passwordHash;
    const legacyPassword = record[passwordField];
    const valid = hash
        ? await bcrypt.compare(password, hash)
        : typeof legacyPassword === "string" && legacyPassword === password;

    if (valid && !hash) {
        await collection.updateOne(
            { _id: record._id },
            { $set: { passwordHash: await bcrypt.hash(password, 12) }, $unset: { [passwordField]: "" } }
        );
    }
    return valid;
}

function setSession(res, identity) {
    const token = jwt.sign(identity, SESSION_SECRET, { expiresIn: "8h" });
    res.cookie(SESSION_COOKIE, token, COOKIE_OPTIONS);
}

function validString(value, maxLength) {
    return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength;
}

function endOfTodayInKolkata() {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), 18, 29, 59, 999));
}

app.get("/check-username", asyncRoute(async (req, res) => {
    const username = String(req.query.username || "").trim();
    if (!validString(username, 40)) return res.status(400).json({ error: "Invalid username" });
    const db = await getDatabase();
    const exists = await db.collection("users").findOne({ username }, { projection: { _id: 1 } });
    res.json({ available: !exists });
}));

app.post("/login", asyncRoute(async (req, res) => {
    const { username, password } = req.body;
    if (!validString(username, 40) || typeof password !== "string" || password.length > 200) {
        return res.status(400).json({ error: "Invalid username or password" });
    }
    const db = await getDatabase();
    const users = db.collection("users");
    const user = await users.findOne({ username: username.trim() });
    if (!user || !(await verifyAndUpgradePassword(users, user, password))) {
        return res.status(401).json({ error: "Invalid username or password" });
    }
    const role = ["user", "receptionist"].includes(user.role) ? user.role : "user";
    setSession(res, { sub: String(user._id), username: user.username, role });
    res.json({ username: user.username, role });
}));

app.post("/register-user", asyncRoute(async (req, res) => {
    const { username, email, password } = req.body;
    if (!validString(username, 40) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "") ||
        typeof password !== "string" || password.length < 8 || password.length > 200) {
        return res.status(400).json({ error: "Provide a username, valid email, and password of at least 8 characters" });
    }
    const db = await getDatabase();
    const users = db.collection("users");
    const normalizedUsername = username.trim();
    if (await users.findOne({ username: normalizedUsername }, { projection: { _id: 1 } })) {
        return res.status(409).json({ error: "Username already exists" });
    }
    await users.insertOne({
        username: normalizedUsername,
        email: email.trim().toLowerCase(),
        passwordHash: await bcrypt.hash(password, 12),
        role: "user",
    });
    res.status(201).json({ message: "Register Successfully" });
}));

app.post("/admin-login", asyncRoute(async (req, res) => {
    const { user_id, password } = req.body;
    if (!validString(user_id, 80) || typeof password !== "string" || password.length > 200) {
        return res.status(400).json({ error: "Invalid user id or password" });
    }
    const db = await getDatabase();
    const admins = db.collection("admin-login");
    const admin = await admins.findOne({ user_id: user_id.trim() });
    if (!admin || !(await verifyAndUpgradePassword(admins, admin, password))) {
        return res.status(401).json({ error: "Invalid user id or password" });
    }
    setSession(res, { sub: String(admin._id), username: admin.user_id, role: "admin" });
    res.json({ username: admin.user_id, role: "admin" });
}));

app.post("/logout", (req, res) => {
    res.clearCookie(SESSION_COOKIE, COOKIE_OPTIONS);
    res.sendStatus(204);
});

app.get("/profile", requireAuth, asyncRoute(async (req, res) => {
    const db = await getDatabase();
    const collection = req.auth.role === "admin" ? db.collection("admin-login") : db.collection("users");
    const record = await collection.findOne({ _id: new ObjectId(req.auth.sub) });
    if (!record) return res.status(404).json({ error: "Profile not found" });
    res.json({
        name: record.name || record.username || record.user_id || "",
        phone: record.phone || "",
    });
}));

app.put("/profile", requireAuth, asyncRoute(async (req, res) => {
    const { name, phone, password } = req.body;
    if (!validString(name, 80) || typeof phone !== "string" || phone.length > 30 ||
        (phone && !/^[\d+().\-\s]{5,30}$/.test(phone)) ||
        (password !== undefined && password !== "" && (typeof password !== "string" || password.length < 8 || password.length > 200))) {
        return res.status(400).json({ error: "Provide a valid name, phone number, and optional password of at least 8 characters" });
    }
    const db = await getDatabase();
    const collection = req.auth.role === "admin" ? db.collection("admin-login") : db.collection("users");
    const update = { name: name.trim(), phone: phone.trim() };
    if (password) update.passwordHash = await bcrypt.hash(password, 12);
    const result = await collection.updateOne({ _id: new ObjectId(req.auth.sub) }, { $set: update, $unset: password ? { password: "" } : {} });
    if (!result.matchedCount) return res.status(404).json({ error: "Profile not found" });
    res.json({ message: "Profile updated" });
}));

app.get("/appointments", requireAuth, asyncRoute(async (req, res) => {
    const db = await getDatabase();
    const query = req.auth.role === "user" ? { username: req.auth.username } : {};
    const appointments = await db.collection("appointments").find(query).toArray();
    res.json(appointments.map(serializeAppointment));
}));

app.post("/add-appointment", requireAuth, requireRoles("user"), asyncRoute(async (req, res) => {
    const { title, description, date, time, category } = req.body;
    if (!validString(title, 160) || !validString(description, 2000) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !/^\d{2}:\d{2}$/.test(time || "")) {
        return res.status(400).json({ error: "Invalid appointment details" });
    }
    const db = await getDatabase();
    await db.collection("appointments").insertOne({
        username: req.auth.username,
        title: title.trim(),
        description: description.trim(),
        date,
        time,
        category: validString(category, 60) ? category.trim() : "Other",
        status: "pending",
    });
    res.status(201).json({ message: "Inserted Successfully" });
}));

app.get("/appointment", requireAuth, requireRoles("admin", "receptionist"), asyncRoute(async (_req, res) => {
    const db = await getDatabase();
    const appointments = await db.collection("appointments").find({}).toArray();
    res.json(appointments.map(serializeAppointment));
}));

app.put("/edit-appointment/:id", requireAuth, requireRoles("user"), asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ error: "Invalid appointment id" });
    const { title, description, date, time, category } = req.body;
    if (!validString(title, 160) || !validString(description, 2000) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date || "") || (time && !/^\d{2}:\d{2}$/.test(time)) ||
        !validString(category, 60)) {
        return res.status(400).json({ error: "Invalid appointment details" });
    }
    const db = await getDatabase();
    const result = await db.collection("appointments").updateOne(
        { _id: new ObjectId(req.params.id), username: req.auth.username },
        { $set: { title: title.trim(), description: description.trim(), date, time: time || "", category: category.trim() } }
    );
    if (!result.matchedCount) return res.status(404).json({ error: "Appointment not found" });
    res.json({ message: "Update Successfully" });
}));

app.delete("/delete-appointment/:id", requireAuth, asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ error: "Invalid appointment id" });
    if (req.auth.role !== "admin" && req.auth.role !== "user") return res.status(403).json({ error: "Forbidden" });
    const db = await getDatabase();
    const query = { _id: new ObjectId(req.params.id) };
    if (req.auth.role === "user") query.username = req.auth.username;
    const result = await db.collection("appointments").deleteOne(query);
    if (!result.deletedCount) return res.status(404).json({ error: "Appointment not found" });
    res.json({ message: "Delete Successfully" });
}));

app.put("/accept-appointment/:id", requireAuth, requireRoles("admin", "receptionist"), asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ error: "Invalid appointment id" });
    const db = await getDatabase();
    const result = await db.collection("appointments").updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { status: "accepted" } }
    );
    if (!result.matchedCount) return res.status(404).json({ error: "Appointment not found" });
    res.json({ message: "Accepted Successfully" });
}));

app.put("/wait-appointment/:id", requireAuth, requireRoles("admin"), asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ error: "Invalid appointment id" });
    const db = await getDatabase();
    const result = await db.collection("appointments").updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { status: "waited" } }
    );
    if (!result.matchedCount) return res.status(404).json({ error: "Appointment not found" });
    res.json({ message: "Waited Successfully" });
}));

app.patch("/appointments/:id/status", requireAuth, requireRoles("admin", "receptionist"), asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ error: "Invalid appointment id" });
    const status = String(req.body.status || "").toLowerCase();
    if (!["pending", "waited", "accepted"].includes(status)) {
        return res.status(400).json({ error: "Invalid appointment status" });
    }
    if (req.auth.role === "receptionist" && status !== "accepted") {
        return res.status(403).json({ error: "Receptionists may only accept appointments" });
    }
    const db = await getDatabase();
    const result = await db.collection("appointments").updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { status } }
    );
    if (!result.matchedCount) return res.status(404).json({ error: "Appointment not found" });
    res.json({ message: "Appointment status updated" });
}));

app.post("/appointment-shares", requireAuth, requireRoles("admin"), asyncRoute(async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const appointmentIds = req.body.appointmentIds;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !Array.isArray(appointmentIds) ||
        appointmentIds.length < 1 || appointmentIds.length > 100 || !appointmentIds.every(validId)) {
        return res.status(400).json({ error: "Provide a valid email and between 1 and 100 appointment IDs" });
    }
    if (!mailTransport) {
        return res.status(503).json({ error: "Email service is not configured. Set real SMTP credentials in .env." });
    }

    const expiresAt = req.body.expiresAt === null || req.body.expiresAt === undefined || req.body.expiresAt === ""
        ? endOfTodayInKolkata()
        : new Date(req.body.expiresAt);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
        return res.status(400).json({ error: "Expiry must be a valid future date and time" });
    }

    const db = await getDatabase();
    const appointmentObjectIds = [...new Set(appointmentIds)].map((id) => new ObjectId(id));
    const found = await db.collection("appointments").countDocuments({ _id: { $in: appointmentObjectIds } });
    if (found !== appointmentObjectIds.length) return res.status(400).json({ error: "One or more appointments do not exist" });

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const createdAt = new Date();
    const record = {
        tokenHash,
        contactEmail: email,
        appointmentIds: appointmentObjectIds,
        createdAt,
        expiresAt,
        revokedAt: null,
        createdBy: req.auth.sub,
    };
    const shares = db.collection("appointment-shares");
    const result = await shares.insertOne(record);
    const link = `${process.env.APP_ORIGIN || "http://localhost:5173"}/contact-view/${token}`;

    try {
        await mailTransport.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: email,
            subject: "Shared appointment details",
            text: `The administrator shared appointment details with you. View them here: ${link}\nThis link expires at ${expiresAt.toISOString()}. Only accepted appointments are displayed.`,
            html: `<p>The administrator shared appointment details with you.</p><p><a href="${link}">View shared appointments</a></p><p>This link expires at ${expiresAt.toISOString()}. Only accepted appointments are displayed.</p>`,
        });
    } catch (error) {
        await shares.deleteOne({ _id: result.insertedId });
        console.error("Email delivery failed. Check SMTP settings and connectivity.");
        return res.status(503).json({ error: "Email could not be sent. Check SMTP settings and connectivity." });
    }

    res.status(201).json({ message: "Access link sent", shareId: String(result.insertedId) });
}));

app.get("/appointment-shares", requireAuth, requireRoles("admin"), asyncRoute(async (_req, res) => {
    const db = await getDatabase();
    const shares = await db.collection("appointment-shares")
        .find({}, { projection: { tokenHash: 0, appointmentIds: 0, createdBy: 0 } })
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray();
    res.json(shares.map(({ _id, ...share }) => ({ ...share, _id: String(_id) })));
}));

app.patch("/appointment-shares/:id/revoke", requireAuth, requireRoles("admin"), asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ error: "Invalid share id" });
    const db = await getDatabase();
    const result = await db.collection("appointment-shares").updateOne(
        { _id: new ObjectId(req.params.id), revokedAt: null },
        { $set: { revokedAt: new Date() } }
    );
    if (!result.matchedCount) return res.status(404).json({ error: "Active share not found" });
    res.json({ message: "Access revoked" });
}));

app.get("/contact-view/:token", asyncRoute(async (req, res) => {
    if (!/^[a-f0-9]{64}$/.test(req.params.token)) return res.status(410).json({ error: "Link expired" });
    const tokenHash = crypto.createHash("sha256").update(req.params.token).digest("hex");
    const db = await getDatabase();
    const share = await db.collection("appointment-shares").findOne({ tokenHash });
    if (!share || share.revokedAt || share.expiresAt <= new Date()) {
        return res.status(410).json({ error: "Link expired" });
    }
    const appointments = await db.collection("appointments").find({
        _id: { $in: share.appointmentIds },
        status: { $in: ["accepted", "Accepted"] },
    }, {
        projection: { username: 0 },
    }).toArray();
    res.json({
        contactEmail: share.contactEmail,
        expiresAt: share.expiresAt,
        appointments: appointments.map(serializeAppointment),
    });
}));

app.use((error, _req, res, _next) => {
    console.error("Request failed:", error.message);
    res.status(500).json({ error: "Internal server error" });
});

if (require.main === module) {
    app.listen(PORT, () => console.log(`Server Started : http://localhost:${PORT}`));
}

module.exports = app;
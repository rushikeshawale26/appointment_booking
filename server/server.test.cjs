process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "appointment-booking-test-session-secret";
process.env.SMTP_HOST = "smtp.example.com";
process.env.SMTP_USER = "your-smtp-username";
process.env.SMTP_PASS = "your-smtp-password";

const jwt = require("jsonwebtoken");
const request = require("supertest");
const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const app = require("./server.cjs");

const appointmentId = "507f1f77bcf86cd799439011";

function session(role) {
    const token = jwt.sign({ sub: "test-account", username: "test-user", role }, process.env.SESSION_SECRET);
    return `appointment_session=${token}`;
}

describe("role-based API access", () => {
    test("rejects unauthenticated profile requests", async () => {
        const response = await request(app).get("/profile");

        assert.equal(response.status, 401);
    });

    test("prevents users from viewing all appointments", async () => {
        const response = await request(app)
            .get("/appointment")
            .set("Cookie", session("user"));

        assert.equal(response.status, 403);
    });

    for (const [action, method, path] of [
        ["waiting appointments", "put", `/wait-appointment/${appointmentId}`],
        ["deleting appointments", "delete", `/delete-appointment/${appointmentId}`],
        ["setting waited status", "patch", `/appointments/${appointmentId}/status`],
        ["sharing appointments", "post", "/appointment-shares"],
    ]) {
        test(`prevents receptionists from ${action}`, async () => {
            const response = await request(app)[method](path)
                .set("Cookie", session("receptionist"))
                .send({ status: "waited", email: "contact@example.net", appointmentIds: [appointmentId] });

            assert.equal(response.status, 403);
        });
    }

    test("reports placeholder SMTP settings as unconfigured", async () => {
        const response = await request(app)
            .post("/appointment-shares")
            .set("Cookie", session("admin"))
            .send({ email: "contact@example.net", appointmentIds: [appointmentId] });

        assert.equal(response.status, 503);
        assert.match(response.body.error, /SMTP credentials/);
    });
});
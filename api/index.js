import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cors from "cors";
import crypto from "crypto";
import { connectedDB } from "./config/db.js";
import { stkPush } from "./mpesa/stkPush.js";
import { savePending, handleCallback, getTransaction, maskPhone } from "./mpesa/callbackUrl.js";
import config from "./config/indexMpesa.js";

dotenv.config();

const app = express();

// --- Helpers ---

// Mask phone for logs (show only last 3 digits)
function maskPhoneLog(phone) {
  if (!phone) return "";
  const s = String(phone);
  return s.length > 3 ? "*".repeat(s.length - 3) + s.slice(-3) : s;
}

// Sanitize log objects: redact secrets, mask phones
function safeLog(obj) {
  const sanitized = { ...obj };
  const secretKeys = [
    "passkey",
    "consumerSecret",
    "consumer_key",
    "consumer_secret",
    "token",
    "access_token",
    "password",
    "Authorization",
    "callbackSecret",
  ];
  for (const key of secretKeys) {
    if (sanitized[key] !== undefined) sanitized[key] = "[REDACTED]";
  }
  if (sanitized.phone) sanitized.phone = maskPhoneLog(sanitized.phone);
  if (sanitized.body && typeof sanitized.body === "object") {
    sanitized.body = safeLog(sanitized.body);
  }
  return sanitized;
}

// --- Middleware ---

// CORS allowlist from env (comma-separated). Allow no Origin (curl/server-to-server).
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(helmet());
app.use(express.json({ limit: "10kb" }));

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no Origin header (curl, server-to-server)
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"), false);
    },
    credentials: true,
  })
);

// --- Rate limiters ---
const stkpushLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Too many STK push requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

const statusLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: "Too many status requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

// --- Routes ---

app.post("/api/mpesa/stkpush", stkpushLimiter, async (req, res) => {
  try {
    const body = req.body;

    // Reject extra or missing fields
    const allowedFields = new Set(["phone", "amount"]);
    const extraFields = Object.keys(body).filter((k) => !allowedFields.has(k));
    if (extraFields.length > 0) {
      return res
        .status(400)
        .json({ error: `Unexpected fields: ${extraFields.join(", ")}` });
    }

    const { phone, amount } = body;

    if (!phone || amount === undefined || amount === null) {
      return res.status(400).json({ error: "Phone and amount are required" });
    }

    // Amount must be a number (not a string)
    if (typeof amount !== "number" || !Number.isFinite(amount)) {
      return res.status(400).json({ error: "Amount must be a number" });
    }

    const roundedAmount = Math.round(amount);
    const maxAmount = config.maxAmount || 150000;

    if (roundedAmount < 1) {
      return res.status(400).json({ error: "Amount must be at least 1" });
    }

    if (roundedAmount > maxAmount) {
      return res
        .status(400)
        .json({ error: `Amount exceeds maximum of ${maxAmount}` });
    }

    // Validate phone format
    let msisdn;
    const { formatPhone } = await import("./utils/format.js");
    try {
      msisdn = formatPhone(phone);
    } catch (err) {
      return res.status(400).json({ error: "Invalid phone number format" });
    }

    const data = await stkPush({ phone: msisdn, amount: roundedAmount });
    await savePending(data.CheckoutRequestID, {
      phone: msisdn,
      amount: roundedAmount,
    });

    res.json({ message: "STK push initiated", data });
  } catch (error) {
    console.error(
      "STK push error:",
      safeLog({
        message: error.message,
        phone: maskPhoneLog(req.body.phone),
      })
    );
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/mpesa/callback/:secret", async (req, res) => {
  // Secret path: compare with timingSafeEqual (handle different lengths safely)
  const expected = config.callbackSecret || "";
  const provided = req.params.secret || "";

  if (provided.length !== expected.length) {
    return res.status(404).json({ error: "Not found" });
  }

  if (!crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
    return res.status(404).json({ error: "Not found" });
  }

  try {
    await handleCallback(req.body, config);
    // Always reply 200 to Safaricom to prevent retries
    return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (error) {
    console.error("Callback error:", safeLog({ message: error.message }));
    // Still return 200 so Safaricom does not retry on processing errors
    return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
  }
});

app.get("/api/mpesa/status/:id", statusLimiter, async (req, res) => {
  try {
    const tx = await getTransaction(req.params.id);
    if (!tx) {
      return res.status(404).json({ status: "NOT_FOUND" });
    }
    res.json(tx);
  } catch (error) {
    console.error("Status error:", safeLog({ message: error.message }));
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- Central error middleware ---
app.use((err, req, res, next) => {
  console.error(
    "Unhandled error:",
    safeLog({
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    })
  );
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 5000;
const start = async () => {
  await connectedDB(process.env.MONGO_URI);
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
};

start();

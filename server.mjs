import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import cors from "cors";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// --- CORS (Railway via env var) ---
const corsOriginsEnv = process.env.CORS_ORIGINS || "";
const allowedOrigins = corsOriginsEnv
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests without Origin (curl/postman/server-to-server)
      if (!origin) return cb(null, true);

      // If no origins configured, block by default (safer)
      if (allowedOrigins.length === 0) {
        return cb(new Error("CORS_ORIGINS is not set"), false);
      }

      if (allowedOrigins.includes(origin)) return cb(null, true);

      return cb(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Preflight support (important for POST with JSON)
app.options("*", cors());

// ChatKit env vars
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CHATKIT_WORKFLOW_ID = process.env.CHATKIT_WORKFLOW_ID;

// Tableau Connected App env vars
const TABLEAU_SERVER_CONAPP_CLIENT_ID = process.env.TABLEAU_SERVER_CONAPP_CLIENT_ID;
const TABLEAU_SERVER_CONAPP_CLIENT_KEY_ID = process.env.TABLEAU_SERVER_CONAPP_CLIENT_KEY_ID;
const TABLEAU_SERVER_CONAPP_CLIENT_SECRET = process.env.TABLEAU_SERVER_CONAPP_CLIENT_SECRET;
const TABLEAU_SERVER_CONAPP_USER = process.env.TABLEAU_SERVER_CONAPP_USER;

app.use(express.json());

app.post("/api/chatkit/session", async (req, res) => {
  try {
    const response = await fetch("https://api.openai.com/v1/chatkit/sessions", {
      method: "POST",
      headers: {
        "OpenAI-Beta": "chatkit_beta=v1",
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        workflow: { id: CHATKIT_WORKFLOW_ID },
        user: "website-user",
      }),
    });

    const data = await response.json();
    res.json({ client_secret: data.client_secret });
  } catch (err) {
    res.status(500).json({ error: "Session failed", details: err.message });
  }
});

app.post("/api/tableau/jwt", (req, res) => {
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const expSec = nowSec + 300; // 5 minutes

    if (
      !TABLEAU_SERVER_CONAPP_CLIENT_ID ||
      !TABLEAU_SERVER_CONAPP_CLIENT_KEY_ID ||
      !TABLEAU_SERVER_CONAPP_CLIENT_SECRET
    ) {
      return res.status(500).json({
        error: "Server not configured for Tableau JWT",
        details:
          "Missing one or more env vars: TABLEAU_SERVER_CONAPP_CLIENT_ID, TABLEAU_SERVER_CONAPP_CLIENT_KEY_ID, TABLEAU_SERVER_CONAPP_CLIENT_SECRET",
      });
    }

    const jwtPayload = {
      sub: TABLEAU_SERVER_CONAPP_USER,
      aud: "tableau",
      scp: ["tableau:views:embed"],
      exp: expSec,
      jti: crypto.randomUUID(),
    };

    const jwtHeaders = {
      iss: TABLEAU_SERVER_CONAPP_CLIENT_ID,
      kid: TABLEAU_SERVER_CONAPP_CLIENT_KEY_ID,
    };

    const token = jwt.sign(jwtPayload, TABLEAU_SERVER_CONAPP_CLIENT_SECRET, {
      algorithm: "HS256",
      header: jwtHeaders,
    });

    return res.json({ token });
  } catch (err) {
    return res
      .status(500)
      .json({ error: "JWT generation failed", details: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running"));

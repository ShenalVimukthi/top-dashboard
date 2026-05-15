import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createServer } from "http";
import process from "node:process";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "..", ".env.local") });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;
const port = Number(process.env.PORT || 3001);
const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:5173";
const pollIntervalMs = Number(process.env.POLL_INTERVAL_MS || 1000);

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_ANON_KEY, or VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
    methods: ["GET", "POST"],
  },
});

app.use(
  cors({
    origin: corsOrigin,
  }),
);

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

let latestSnapshot = [];
let latestSignature = "";

const buildSignature = (rows) =>
  JSON.stringify(
    rows.map((row) => ({
      id: row.id,
      otp: row.otp,
      phone: row.phone,
      app_name: row.app_name,
      created_at: row.created_at,
    })),
  );

const fetchOtpRows = async () => {
  const { data, error } = await supabase
    .from("otp_master")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw error;
  }

  return data || [];
};

const syncRows = async () => {
  try {
    const rows = await fetchOtpRows();
    const signature = buildSignature(rows);

    if (signature === latestSignature) {
      return;
    }

    latestSignature = signature;
    latestSnapshot = rows;
    io.emit("otp_master:snapshot", latestSnapshot);
  } catch (error) {
    console.error("Failed to sync otp_master rows:", error.message);
  }
};

io.on("connection", (socket) => {
  socket.emit("otp_master:snapshot", latestSnapshot);
});

await syncRows();
setInterval(syncRows, pollIntervalMs);

httpServer.listen(port, () => {
  console.log(`Live OTP bridge running on http://localhost:${port}`);
});

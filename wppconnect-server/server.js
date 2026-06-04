/* eslint-disable no-console */
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const wppconnect = require("@wppconnect-team/wppconnect");

const PORT = Number(process.env.WPP_PORT || 3333);
const SESSION_NAME = process.env.WPP_SESSION_NAME || "mesquita";
const WEBHOOK_URL = process.env.WPP_WEBHOOK_URL || "";
const API_KEY = process.env.WPP_API_KEY || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: "20mb" }));

let client = null;
let status = "disconnected"; // disconnected | qrcode | connecting | connected
let lastQr = null;           // base64 do QR
let lastError = null;

// --- Auth simples por header ----------------------------------------------
function auth(req, res, next) {
  if (!API_KEY) return next();
  if (req.headers["x-api-key"] === API_KEY) return next();
  return res.status(401).json({ error: "unauthorized" });
}

// --- Helpers --------------------------------------------------------------
function normalizePhone(p) {
  let d = String(p || "").replace(/\D/g, "");
  if (!d) return "";
  if (!d.startsWith("55")) d = "55" + d;
  return d;
}
function toJid(phone) {
  const n = normalizePhone(phone);
  return n.includes("@") ? n : `${n}@c.us`;
}

async function saveMessageToSupabase(payload) {
  if (!SUPABASE_URL || !SERVICE_ROLE) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_messages`, {
      method: "POST",
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error("[supabase] erro ao gravar mensagem:", e.message);
  }
}

async function findTenantIdByPhone(phone) {
  if (!SUPABASE_URL || !SERVICE_ROLE) return null;
  const norm = normalizePhone(phone).replace(/^55/, "");
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/tenants?select=id,phone&status=eq.active`, {
      headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
    });
    const list = await r.json();
    if (!Array.isArray(list)) return null;
    const found = list.find((t) => String(t.phone || "").replace(/\D/g, "").replace(/^55/, "") === norm);
    return found ? found.id : null;
  } catch {
    return null;
  }
}

async function forwardToWebhook(message) {
  if (!WEBHOOK_URL) return;
  try {
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
  } catch (e) {
    console.error("[webhook] erro:", e.message);
  }
}

// --- Inicialização do WPPConnect ------------------------------------------
async function startSession() {
  if (client) return client;
  status = "connecting";
  lastError = null;
  try {
    client = await wppconnect.create({
      session: SESSION_NAME,
      headless: true,
      puppeteerOptions: { args: ["--no-sandbox", "--disable-setuid-sandbox"] },
      logQR: false,
      autoClose: 0,
      catchQR: (base64Qr, asciiQR) => {
        lastQr = base64Qr;
        status = "qrcode";
        console.log("[wpp] novo QR gerado. Acesse o painel para escanear.");
      },
      statusFind: (statusSession) => {
        console.log("[wpp] status:", statusSession);
        if (["isLogged", "qrReadSuccess", "chatsAvailable", "inChat"].includes(statusSession)) {
          status = "connected";
          lastQr = null;
        } else if (statusSession === "notLogged" || statusSession === "browserClose") {
          status = "disconnected";
        }
      },
    });

    status = "connected";
    lastQr = null;

    client.onMessage(async (msg) => {
      try {
        if (msg.fromMe) return;
        const fromPhone = String(msg.from || "").split("@")[0];
        const tenantId = await findTenantIdByPhone(fromPhone);
        const payload = {
          direction: "inbound",
          from_phone: fromPhone,
          to_phone: null,
          message_type: msg.type || "text",
          body: msg.body || msg.caption || "",
          media_mime_type: msg.mimetype || null,
          tenant_id: tenantId,
          wa_message_id: msg.id?.id || msg.id || null,
          raw_payload: msg,
          processed: false,
        };
        await saveMessageToSupabase(payload);
        await forwardToWebhook({ event: "message", data: payload });
      } catch (e) {
        console.error("[onMessage] erro:", e.message);
      }
    });

    client.onStateChange((state) => {
      console.log("[wpp] state change:", state);
      if (["CONNECTED"].includes(state)) status = "connected";
      if (["UNPAIRED", "UNPAIRED_IDLE", "CONFLICT", "UNLAUNCHED"].includes(state)) status = "disconnected";
    });

    return client;
  } catch (e) {
    console.error("[wpp] falha ao iniciar:", e);
    status = "disconnected";
    lastError = e.message;
    client = null;
    throw e;
  }
}

// --- Endpoints ------------------------------------------------------------
app.get("/", (_req, res) => res.send("WPPConnect server OK"));

app.get("/status", auth, (_req, res) => {
  res.json({ status, session: SESSION_NAME, error: lastError });
});

app.get("/qr-code", auth, async (_req, res) => {
  if (!client) {
    startSession().catch(() => {});
  }
  res.json({ status, qr: lastQr });
});

app.post("/start", auth, async (_req, res) => {
  try {
    await startSession();
    res.json({ ok: true, status });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/reconnect", auth, async (_req, res) => {
  try {
    if (client) {
      try { await client.close(); } catch {}
      client = null;
    }
    status = "disconnected";
    lastQr = null;
    await startSession();
    res.json({ ok: true, status });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/logout", auth, async (_req, res) => {
  try {
    if (client) {
      try { await client.logout(); } catch {}
      try { await client.close(); } catch {}
    }
    client = null;
    status = "disconnected";
    lastQr = null;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/send-message", auth, async (req, res) => {
  try {
    const { phone, message, tenantId } = req.body || {};
    if (!phone || !message) return res.status(400).json({ error: "phone e message obrigatórios" });
    if (!client || status !== "connected") return res.status(400).json({ error: "sessão não conectada" });

    const jid = toJid(phone);
    const result = await client.sendText(jid, message);

    const payload = {
      direction: "outbound",
      from_phone: "system",
      to_phone: normalizePhone(phone),
      message_type: "text",
      body: message,
      tenant_id: tenantId || null,
      wa_message_id: result?.id || null,
      raw_payload: result,
      processed: true,
    };
    await saveMessageToSupabase(payload);

    res.json({ ok: true, id: result?.id });
  } catch (e) {
    console.error("[send] erro:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Webhook genérico — recebe eventos externos e grava
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body || {};
    console.log("[webhook] in:", body?.event || "raw");
    if (body?.from && body?.body) {
      await saveMessageToSupabase({
        direction: "inbound",
        from_phone: normalizePhone(body.from),
        message_type: body.type || "text",
        body: body.body,
        raw_payload: body,
        processed: false,
      });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n✅ WPPConnect server rodando em http://localhost:${PORT}`);
  console.log(`   Sessão: ${SESSION_NAME}`);
  console.log(`   API Key: ${API_KEY ? "ativada" : "DESATIVADA (defina WPP_API_KEY no .env)"}\n`);
  // inicia sessão automaticamente
  startSession().catch((e) => console.error("Falha ao iniciar sessão:", e.message));
});

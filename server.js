import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import session from "express-session";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ================= CORE MIDDLEWARE =================

app.use(express.json());

// ✅ SESSION SYSTEM (ADDED)
app.use(
  session({
    name: "nuggets_admin_session",
    secret: process.env.SESSION_SECRET || "super-secret-session-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 6 // 6 hours
    }
  })
);

// Serve static files
app.use(express.static(__dirname, { extensions: ["html"] }));

// ================= PAGE ROUTES =================

app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "index.html"))
);

app.get("/about", (req, res) =>
  res.sendFile(path.join(__dirname, "about.html"))
);

app.get("/clients", (req, res) =>
  res.sendFile(path.join(__dirname, "clients.html"))
);

app.get("/past-work", (req, res) =>
  res.sendFile(path.join(__dirname, "past-work.html"))
);

app.get("/past-work/:workId", (req, res) =>
  res.sendFile(path.join(__dirname, "past-work.html"))
);

app.get("/contact", (req, res) =>
  res.sendFile(path.join(__dirname, "contact.html"))
);

// ================= PORTAL / BOARD PAGES =================

app.get("/portal", (req, res) =>
  res.sendFile(path.join(__dirname, "portal.html"))
);

// Client board (cookie-based – unchanged)
app.get("/client-board", (req, res) => {
  const cookies = parseCookies(req);
  const role = cookies.role || "";
  if (role !== "client" && role !== "admin") return res.redirect("/portal");
  return res.sendFile(path.join(__dirname, "client-board.html"));
});

// ✅ ADMIN BOARD (SESSION PROTECTED)
app.get("/admin-board", requireAdminSession, (req, res) => {
  return res.sendFile(path.join(__dirname, "admin-board.html"));
});

// ================= PAST WORK API =================

app.get("/api/past-work", (req, res) => {
  try {
    const imagesDir = path.join(__dirname, "images");
    const files = fs.readdirSync(imagesDir);

    const workFiles = files
      .filter((f) => /^work-.+\.(png|jpg|jpeg|webp|gif)$/i.test(f))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    return res.json({
      ok: true,
      items: workFiles.map((f) => ({
        file: f,
        url: `/images/${f}`,
        id: f.replace(/\.[^.]+$/, ""),
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      ok: false,
      error: "Failed to read images folder."
    });
  }
});

// ================= CONTACT FORM API =================

app.post("/api/contact", async (req, res) => {
  try {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
      return res.status(500).json({
        ok: false,
        error: "DISCORD_WEBHOOK_URL not set"
      });
    }

    const { discordUsername, discordId, service, budget, message } = req.body || {};

    if (!discordUsername || !discordId || !message) {
      return res.status(400).json({
        ok: false,
        error: "Discord Username, Discord ID, and message are required"
      });
    }

    const safe = (v, max = 1024) => String(v ?? "").trim().slice(0, max);

    const payload = {
      username: "Nuggets Customs • Contact",
      embeds: [
        {
          title: "New Contact Form Submission",
          color: 0x111111,
          fields: [
            { name: "Discord Username", value: safe(discordUsername, 256), inline: true },
            { name: "Discord ID", value: safe(discordId, 256), inline: true },
            { name: "Service", value: safe(service, 256) || "—", inline: true },
            { name: "Budget", value: safe(budget, 256) || "—", inline: true },
            { name: "Message", value: safe(message, 1500), inline: false }
          ],
          footer: { text: "Nuggets Customs Website" },
          timestamp: new Date().toISOString()
        }
      ]
    };

    const discordRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!discordRes.ok) {
      const text = await discordRes.text().catch(() => "");
      return res.status(502).json({
        ok: false,
        error: "Discord webhook failed",
        details: text.slice(0, 300)
      });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      ok: false,
      error: "Server error"
    });
  }
});

// ================= AUTH HELPERS =================

function requireAdminSession(req, res, next) {
  if (!req.session?.isAdmin) {
    return res.redirect("/portal");
  }
  next();
}

// ---- Cookie helpers (UNCHANGED) ----
function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  header.split(";").map(v => v.trim()).filter(Boolean).forEach(pair => {
    const idx = pair.indexOf("=");
    const k = idx >= 0 ? pair.slice(0, idx) : pair;
    const val = idx >= 0 ? pair.slice(idx + 1) : "";
    out[decodeURIComponent(k)] = decodeURIComponent(val);
  });
  return out;
}

function setCookie(res, name, value, { maxAgeSeconds = 60 * 60 * 24 } = {}) {
  res.setHeader(
    "Set-Cookie",
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`
  );
}

function clearCookie(res, name) {
  res.setHeader(
    "Set-Cookie",
    `${encodeURIComponent(name)}=; Path=/; Max-Age=0; SameSite=Lax`
  );
}

function hasClientAccess(req) {
  const role = (parseCookies(req).role || "");
  return role === "client" || role === "admin";
}

function isAdmin(req) {
  return req.session?.isAdmin === true;
}

// ================= LOGIN / LOGOUT =================

app.post("/api/login", (req, res) => {
  const { password } = req.body || {};

  if (password === "nuggetstudios67") {
    setCookie(res, "role", "client");
    return res.json({ ok: true, go: "/client-board" });
  }

  if (password === "passwordpass123") {
    req.session.isAdmin = true;
    setCookie(res, "role", "admin");
    return res.json({ ok: true, go: "/admin-board" });
  }

  return res.status(401).json({ ok: false, error: "Wrong password" });
});

app.get("/api/logout", (req, res) => {
  req.session.destroy(() => {});
  clearCookie(res, "role");
  return res.redirect("/portal");
});

// ================= ORDERS API =================

const ORDERS_PATH = path.join(__dirname, "orders.json");

function readOrders() {
  try {
    const raw = fs.readFileSync(ORDERS_PATH, "utf8");
    const json = JSON.parse(raw);
    return Array.isArray(json.items) ? json.items : [];
  } catch {
    return [];
  }
}

function writeOrders(items) {
  fs.writeFileSync(ORDERS_PATH, JSON.stringify({ items }, null, 2), "utf8");
}

app.get("/api/orders", (req, res) => {
  if (!hasClientAccess(req)) {
    return res.status(401).json({ ok: false, error: "Not authorized" });
  }
  return res.json({ ok: true, items: readOrders() });
});

app.post("/api/orders", requireAdminSession, (req, res) => {
  const { client, title, status } = req.body || {};
  if (!client || !title) {
    return res.status(400).json({ ok: false, error: "client and title required" });
  }

  const items = readOrders();
  const id = "order-" + Date.now();
  const now = new Date().toISOString();

  items.unshift({
    id,
    client: String(client).trim(),
    title: String(title).trim(),
    status: String(status || "Queued").trim(),
    updatedAt: now
  });

  writeOrders(items);
  return res.json({ ok: true, id });
});

app.patch("/api/orders/:id", requireAdminSession, (req, res) => {
  const { id } = req.params;
  const { status, title } = req.body || {};

  const items = readOrders();
  const idx = items.findIndex(o => o.id === id);
  if (idx === -1) return res.status(404).json({ ok: false, error: "Not found" });

  if (typeof status === "string") items[idx].status = status;
  if (typeof title === "string") items[idx].title = title;
  items[idx].updatedAt = new Date().toISOString();

  writeOrders(items);
  return res.json({ ok: true });
});

// ================= START SERVER =================

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("Server running on port", port);
});

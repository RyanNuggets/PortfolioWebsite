import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import crypto from "crypto";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ================= CORE =================

app.use(express.json());

// ================= SIMPLE SESSION SYSTEM =================

const adminSessions = new Map();

function createSession() {
  return crypto.randomBytes(32).toString("hex");
}

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

function setCookie(
  res,
  name,
  value,
  { maxAgeSeconds = 60 * 60 * 6, httpOnly = true } = {}
) {
  res.setHeader(
    "Set-Cookie",
    `${name}=${value}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax; ${httpOnly ? "HttpOnly;" : ""}`
  );
}

function clearCookie(res, name) {
  res.setHeader(
    "Set-Cookie",
    `${name}=; Path=/; Max-Age=0; SameSite=Lax`
  );
}

function requireAdmin(req, res, next) {
  const sid = parseCookies(req).admin_session;
  if (!sid || !adminSessions.has(sid)) {
    return res.redirect("/portal");
  }
  next();
}

// ================= BLOCK STATIC ACCESS TO PROTECTED PAGES =================
// 🔒 THIS CLOSES THE BYPASS FOR /admin-board AND /client-board
app.use((req, res, next) => {
  const blocked = new Set([
    "/admin-board",
    "/admin-board.html",
    "/client-board",
    "/client-board.html"
  ]);

  if (blocked.has(req.path)) {
    return res.redirect("/portal");
  }

  next();
});

// ================= STATIC FILES =================

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

// ================= PORTAL / BOARDS =================

app.get("/portal", (req, res) =>
  res.sendFile(path.join(__dirname, "portal.html"))
);

// CLIENT BOARD (COOKIE-BASED)
app.get("/client-board", (req, res) => {
  const role = parseCookies(req).role || "";
  if (role !== "client" && role !== "admin") {
    return res.redirect("/portal");
  }
  res.sendFile(path.join(__dirname, "client-board.html"));
});

// ADMIN BOARD (SESSION-BASED)
app.get("/admin-board", requireAdmin, (req, res) =>
  res.sendFile(path.join(__dirname, "admin-board.html"))
);

// ================= PAST WORK API =================

app.get("/api/past-work", (req, res) => {
  try {
    const imagesDir = path.join(__dirname, "images");
    const files = fs.readdirSync(imagesDir);

    const workFiles = files
      .filter(f => /^work-.+\.(png|jpg|jpeg|webp|gif)$/i.test(f))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    res.json({
      ok: true,
      items: workFiles.map(f => ({
        file: f,
        url: `/images/${f}`,
        id: f.replace(/\.[^.]+$/, "")
      }))
    });
  } catch {
    res.status(500).json({ ok: false });
  }
});

// ================= CONTACT API =================

app.post("/api/contact", async (req, res) => {
  try {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return res.status(500).json({ ok: false });

    const { discordUsername, discordId, service, budget, message } = req.body || {};
    if (!discordUsername || !discordId || !message) {
      return res.status(400).json({ ok: false });
    }

    const payload = {
      username: "Nuggets Customs • Contact",
      embeds: [{
        title: "New Contact Form Submission",
        color: 0x111111,
        fields: [
          { name: "Discord Username", value: discordUsername, inline: true },
          { name: "Discord ID", value: discordId, inline: true },
          { name: "Service", value: service || "—", inline: true },
          { name: "Budget", value: budget || "—", inline: true },
          { name: "Message", value: message }
        ],
        timestamp: new Date().toISOString()
      }]
    };

    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false });
  }
});

// ================= LOGIN / LOGOUT =================

app.post("/api/login", (req, res) => {
  const { password } = req.body || {};

  if (password === "nuggetstudios67") {
    setCookie(res, "role", "client", { httpOnly: false });
    return res.json({ ok: true, go: "/client-board" });
  }

  if (password === "passwordpass123") {
    const sid = createSession();
    adminSessions.set(sid, { created: Date.now() });
    setCookie(res, "admin_session", sid);
    setCookie(res, "role", "admin", { httpOnly: false });
    return res.json({ ok: true, go: "/admin-board" });
  }

  res.status(401).json({ ok: false });
});

app.get("/api/logout", (req, res) => {
  const cookies = parseCookies(req);
  if (cookies.admin_session) {
    adminSessions.delete(cookies.admin_session);
  }
  clearCookie(res, "admin_session");
  clearCookie(res, "role");
  res.redirect("/portal");
});

// ================= ORDERS =================

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
  fs.writeFileSync(ORDERS_PATH, JSON.stringify({ items }, null, 2));
}

app.get("/api/orders", (req, res) => {
  const role = parseCookies(req).role || "";
  if (role !== "client" && role !== "admin") {
    return res.status(401).json({ ok: false });
  }
  res.json({ ok: true, items: readOrders() });
});

app.post("/api/orders", requireAdmin, (req, res) => {
  const { client, title, status } = req.body || {};
  if (!client || !title) return res.status(400).json({ ok: false });

  const items = readOrders();
  items.unshift({
    id: "order-" + Date.now(),
    client,
    title,
    status: status || "Queued",
    updatedAt: new Date().toISOString()
  });

  writeOrders(items);
  res.json({ ok: true });
});

app.patch("/api/orders/:id", requireAdmin, (req, res) => {
  const items = readOrders();
  const order = items.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ ok: false });

  if (req.body.status) order.status = req.body.status;
  if (req.body.title) order.title = req.body.title;
  order.updatedAt = new Date().toISOString();

  writeOrders(items);
  res.json({ ok: true });
});

// ================= START =================

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("Server running on port", port);
});

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse JSON bodies (for contact form)
app.use(express.json());

// Serve static files (css, images, js, html)
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

// ✅ Past work detail URL (still serves same HTML; client JS focuses the matching item)
app.get("/past-work/:workId", (req, res) =>
  res.sendFile(path.join(__dirname, "past-work.html"))
);

app.get("/contact", (req, res) =>
  res.sendFile(path.join(__dirname, "contact.html"))
);

// ================= PORTAL / BOARD PAGES (ADDED) =================

// Portal (password entry)
app.get("/portal", (req, res) =>
  res.sendFile(path.join(__dirname, "portal.html"))
);

// Client board (must be logged in as client OR admin)
app.get("/client-board", (req, res) => {
  const cookies = parseCookies(req);
  const role = cookies.role || "";
  if (role !== "client" && role !== "admin") return res.redirect("/portal");
  return res.sendFile(path.join(__dirname, "client-board.html"));
});

// Admin board (must be logged in as admin)
app.get("/admin-board", (req, res) => {
  const cookies = parseCookies(req);
  const role = cookies.role || "";
  if (role !== "admin") return res.redirect("/portal");
  return res.sendFile(path.join(__dirname, "admin-board.html"));
});

// ================= PAST WORK API (ADDED) =================

// Lists files in /images that start with "work-" so past-work.html can auto-render.
// Example filenames: work-1.png, work-abc.jpg, work-banner.webp
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

    // Basic validation
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

// ================= PORTAL / ORDERS API (ADDED) =================

// ---- Cookie helpers (no extra packages needed) ----
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
  const role = (parseCookies(req).role || "");
  return role === "admin";
}

// ---- Login / logout ----
app.post("/api/login", (req, res) => {
  const { password } = req.body || {};

  if (password === "NuggetStudiosCLIENT") {
    setCookie(res, "role", "client");
    return res.json({ ok: true, go: "/client-board" });
  }

  if (password === "passwordpass123") {
    setCookie(res, "role", "admin");
    return res.json({ ok: true, go: "/admin-board" });
  }

  return res.status(401).json({ ok: false, error: "Wrong password" });
});

app.get("/api/logout", (req, res) => {
  clearCookie(res, "role");
  return res.redirect("/portal");
});

// ---- Orders storage (orders.json) ----
// Uses persistent directory if provided (Railway Volume), else project root
const DATA_DIR = process.env.DATA_DIR || process.cwd();
const ORDERS_PATH = path.join(DATA_DIR, "orders.json");

console.log("ORDERS_PATH =", ORDERS_PATH);

function ensureOrdersFile() {
  try {
    if (!fs.existsSync(ORDERS_PATH)) {
      fs.mkdirSync(path.dirname(ORDERS_PATH), { recursive: true });
      fs.writeFileSync(
        ORDERS_PATH,
        JSON.stringify({ items: [] }, null, 2),
        "utf8"
      );
    }
  } catch (e) {
    console.error("❌ Failed to ensure orders file:", e);
  }
}
ensureOrdersFile();

function readOrders() {
  try {
    const raw = fs.readFileSync(ORDERS_PATH, "utf8");
    const json = JSON.parse(raw);
    return Array.isArray(json.items) ? json.items : [];
  } catch (e) {
    console.error("❌ readOrders error:", e);
    return [];
  }
}

function writeOrders(items) {
  try {
    fs.mkdirSync(path.dirname(ORDERS_PATH), { recursive: true });
    fs.writeFileSync(
      ORDERS_PATH,
      JSON.stringify({ items }, null, 2),
      "utf8"
    );
  } catch (e) {
    console.error("❌ writeOrders error:", e);
    throw e;
  }
}

// (Optional) quick debug to see where it's writing
app.get("/api/debug/orders-path", (req, res) => {
  res.json({ ok: true, ORDERS_PATH });
});

// client + admin: READ
app.get("/api/orders", (req, res) => {
  if (!hasClientAccess(req)) {
    return res.status(401).json({ ok: false, error: "Not authorized" });
  }
  return res.json({ ok: true, items: readOrders() });
});

// admin: CREATE
app.post("/api/orders", (req, res) => {
  if (!isAdmin(req)) {
    return res.status(401).json({ ok: false, error: "Admin only" });
  }

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

// admin: UPDATE (status/title/etc)
app.patch("/api/orders/:id", (req, res) => {
  if (!isAdmin(req)) {
    return res.status(401).json({ ok: false, error: "Admin only" });
  }

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

// ✅ admin: DELETE (true delete, removes from orders.json)
app.delete("/api/orders/:id", (req, res) => {
  if (!isAdmin(req)) {
    return res.status(401).json({ ok: false, error: "Admin only" });
  }

  const { id } = req.params;
  const items = readOrders();
  const next = items.filter(o => o.id !== id);

  if (next.length === items.length) {
    return res.status(404).json({ ok: false, error: "Not found" });
  }

  writeOrders(next);
  return res.json({ ok: true });
});

// ================= START SERVER =================

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("Server running on port", port);
});

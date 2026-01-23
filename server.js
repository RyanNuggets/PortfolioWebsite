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

// ================= PAST WORK API (ADDED) =================

// Lists files in /images that start with "work-" so past-work.html can auto-render.
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

// ================= PORTAL + BOARDS (ADDED) =================

app.get("/portal", (req, res) =>
  res.sendFile(path.join(__dirname, "portal.html"))
);

app.get("/client-board", (req, res) =>
  res.sendFile(path.join(__dirname, "client-board.html"))
);

app.get("/admin-board", (req, res) =>
  res.sendFile(path.join(__dirname, "admin-board.html"))
);

// ================= ORDERS API (ADDED) =================

const ORDERS_PATH = path.join(__dirname, "orders.json");

function readOrdersFile() {
  try {
    if (!fs.existsSync(ORDERS_PATH)) {
      fs.writeFileSync(ORDERS_PATH, JSON.stringify({ items: [] }, null, 2));
    }
    const raw = fs.readFileSync(ORDERS_PATH, "utf8");
    const data = JSON.parse(raw || "{}");
    if (!data.items || !Array.isArray(data.items)) data.items = [];
    return data;
  } catch {
    return { items: [] };
  }
}

function writeOrdersFile(data) {
  fs.writeFileSync(ORDERS_PATH, JSON.stringify(data, null, 2));
}

function makeId() {
  return "ord_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

app.get("/api/orders", (req, res) => {
  const data = readOrdersFile();
  return res.json({ ok: true, items: data.items || [] });
});

app.post("/api/orders", (req, res) => {
  const data = readOrdersFile();
  const { title, client, status, notes, updatedAt } = req.body || {};

  if (!title || !client) {
    return res.status(400).json({ ok: false, error: "title + client required" });
  }

  const item = {
    id: makeId(),
    title: String(title).trim(),
    client: String(client).trim(),
    status: String(status || "Queued").trim(),
    notes: String(notes || "").trim(),
    updatedAt: String(updatedAt || "").trim()
  };

  data.items.unshift(item);
  writeOrdersFile(data);

  return res.json({ ok: true, item });
});

app.patch("/api/orders/:id", (req, res) => {
  const data = readOrdersFile();
  const id = req.params.id;

  const idx = (data.items || []).findIndex(o => o.id === id);
  if (idx === -1) return res.status(404).json({ ok: false, error: "Not found" });

  const { status, notes, title, client, updatedAt } = req.body || {};

  if (typeof status === "string") data.items[idx].status = status;
  if (typeof notes === "string") data.items[idx].notes = notes;
  if (typeof title === "string") data.items[idx].title = title;
  if (typeof client === "string") data.items[idx].client = client;
  if (typeof updatedAt === "string") data.items[idx].updatedAt = updatedAt;

  writeOrdersFile(data);
  return res.json({ ok: true, item: data.items[idx] });
});

// ================= START SERVER =================

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("Server running on port", port);
});

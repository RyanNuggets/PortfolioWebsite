import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ REQUIRED for contact form JSON body
app.use(express.json({ limit: "200kb" }));
app.use(express.urlencoded({ extended: true }));

// Serve static files (css, images, js, and html files)
app.use(express.static(__dirname, { extensions: ["html"] }));

// ===== API: list images that start with "work-" from /images =====
app.get("/api/past-work", (req, res) => {
  try {
    const imagesDir = path.join(__dirname, "images");
    const files = fs.readdirSync(imagesDir);

    const workFiles = files
      .filter((f) => /^work-.+\.(png|jpg|jpeg|webp|gif)$/i.test(f))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    res.json({
      ok: true,
      items: workFiles.map((f) => ({
        file: f,
        url: `/images/${f}`,
        id: f.replace(/\.[^.]+$/, ""),
      })),
    });
  } catch (err) {
    console.error("past-work scan error:", err);
    res.status(500).json({ ok: false, error: "Failed to read images folder." });
  }
});

// ===== API: contact form -> Discord webhook =====
app.post("/api/contact", async (req, res) => {
  try {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
      console.error("Missing DISCORD_WEBHOOK_URL in Railway Variables");
      return res.status(500).json({ ok: false, error: "Server not configured." });
    }

    const { discordUsername = "", discordId = "", requestType = "", details = "" } = req.body || {};

    if (!discordUsername.trim() || !details.trim()) {
      return res.status(400).json({ ok: false, error: "Missing required fields." });
    }

    const safe = (s, max) => String(s || "").slice(0, max);

    const payload = {
      embeds: [
        {
          title: "New Commission Request",
          color: 0x111111,
          fields: [
            { name: "Discord Username", value: safe(discordUsername, 256) || "—", inline: true },
            { name: "Discord ID", value: safe(discordId, 64) || "—", inline: true },
            { name: "Request Type", value: safe(requestType, 256) || "—", inline: false },
            { name: "Details", value: safe(details, 1800) || "—", inline: false },
          ],
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.error("Discord webhook failed:", resp.status, text);
      return res.status(500).json({ ok: false, error: "Webhook failed." });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("Contact API error:", err);
    return res.status(500).json({ ok: false, error: "Server error." });
  }
});

// Pretty URLs -> serve the correct HTML files
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/about", (req, res) => res.sendFile(path.join(__dirname, "about.html")));
app.get("/clients", (req, res) => res.sendFile(path.join(__dirname, "clients.html")));
app.get("/past-work", (req, res) => res.sendFile(path.join(__dirname, "past-work.html")));
app.get("/past-work/:workId", (req, res) => res.sendFile(path.join(__dirname, "past-work.html")));
app.get("/contact", (req, res) => res.sendFile(path.join(__dirname, "contact.html")));

// (Optional) simple 404 page instead of serving homepage for unknown routes
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "index.html"));
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Running on", port));

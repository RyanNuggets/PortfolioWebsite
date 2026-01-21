import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Parse JSON + form bodies
app.use(express.json({ limit: "300kb" }));
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(__dirname, { extensions: ["html"] }));

// ✅ quick health check
app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "server alive" });
});

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
      console.error("❌ Missing DISCORD_WEBHOOK_URL in Railway Variables");
      return res.status(500).json({
        ok: false,
        error: "Server missing DISCORD_WEBHOOK_URL (Railway Variables)."
      });
    }

    // ✅ Accept multiple name variants (so it still works if your frontend differs)
    const body = req.body || {};

    const discordUsername =
      body.discordUsername ?? body.discord_user ?? body.username ?? body.name ?? "";

    const discordId =
      body.discordId ?? body.discord_id ?? body.userid ?? body.userId ?? "";

    const requestType =
      body.requestType ?? body.type ?? body.service ?? body.category ?? "";

    const details =
      body.details ?? body.message ?? body.description ?? body.notes ?? "";

    // Log what we received (Railway logs)
    console.log("✅ /api/contact received:", {
      discordUsername,
      discordId,
      requestType,
      detailsLength: String(details || "").length,
    });

    if (!String(discordUsername).trim() || !String(details).trim()) {
      return res.status(400).json({
        ok: false,
        error: "Missing required fields (discordUsername + details)."
      });
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
      console.error("❌ Discord webhook failed:", resp.status, text);

      return res.status(500).json({
        ok: false,
        error: `Discord webhook failed (${resp.status}).`,
        discordResponse: text.slice(0, 600),
      });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("❌ Contact API error:", err);
    return res.status(500).json({ ok: false, error: "Server error sending webhook." });
  }
});

// Pretty URLs
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/about", (req, res) => res.sendFile(path.join(__dirname, "about.html")));
app.get("/clients", (req, res) => res.sendFile(path.join(__dirname, "clients.html")));
app.get("/contact", (req, res) => res.sendFile(path.join(__dirname, "contact.html")));
app.get("/past-work", (req, res) => res.sendFile(path.join(__dirname, "past-work.html")));
app.get("/past-work/:workId", (req, res) => res.sendFile(path.join(__dirname, "past-work.html")));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Running on", port));

import express from "express";
import path from "path";
import { fileURLToPath } from "url";

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

app.get("/contact", (req, res) =>
  res.sendFile(path.join(__dirname, "contact.html"))
);

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

// ================= START SERVER =================

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("Server running on port", port);
});

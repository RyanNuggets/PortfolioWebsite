import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

    // Return URLs for the frontend to use directly
    res.json({
      ok: true,
      items: workFiles.map((f) => ({
        file: f,
        url: `/images/${f}`,
        id: f.replace(/\.[^.]+$/, ""), // filename without extension
      })),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Failed to read images folder." });
  }
});

// Pretty URLs -> serve the correct HTML files
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/about", (req, res) => res.sendFile(path.join(__dirname, "about.html")));
app.get("/clients", (req, res) => res.sendFile(path.join(__dirname, "clients.html")));
app.get("/contact", (req, res) => res.sendFile(path.join(__dirname, "contact.html")));

// Past work page (list view)
app.get("/past-work", (req, res) =>
  res.sendFile(path.join(__dirname, "past-work.html"))
);

// Past work detail URL (still serves same HTML; it will auto-focus the matching item)
app.get("/past-work/:workId", (req, res) =>
  res.sendFile(path.join(__dirname, "past-work.html"))
);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Running on", port));

import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files (css, images, js, and html files)
app.use(express.static(__dirname, { extensions: ["html"] }));

// Pretty URLs -> serve the correct HTML files
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/about", (req, res) => res.sendFile(path.join(__dirname, "about.html")));
app.get("/clients", (req, res) => res.sendFile(path.join(__dirname, "clients.html")));
app.get("/past-work", (req, res) => res.sendFile(path.join(__dirname, "past-work.html")));
app.get("/contact", (req, res) => res.sendFile(path.join(__dirname, "contact.html")));

// IMPORTANT: remove/avoid any catch-all that always returns index.html
// app.get("*", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Running on", port));

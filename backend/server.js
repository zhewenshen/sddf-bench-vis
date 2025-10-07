import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

const upload = multer({ storage: multer.memoryStorage() });

// Create data directory if it doesn't exist
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

app.use(cors());
app.use(express.json({ limit: "100mb" }));

app.get("/api/hello", (req, res) => {
  res.json({ message: "Hello World from Backend!" });
});

app.post("/api/upload", upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const fileContent = req.file.buffer.toString("utf-8");
    const jsonData = JSON.parse(fileContent);

    res.json({ success: true, data: jsonData });
  } catch (error) {
    res
      .status(400)
      .json({ error: "Invalid JSON file", details: error.message });
  }
});

// Save session (all runs + custom plots)
app.post("/api/session/save", (req, res) => {
  try {
    const { name, runs, customPlots } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Session name is required" });
    }

    const sessionData = {
      name,
      runs,
      customPlots,
      savedAt: new Date().toISOString(),
    };

    const filename = `${name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_${Date.now()}.json`;
    const filepath = path.join(DATA_DIR, filename);

    fs.writeFileSync(filepath, JSON.stringify(sessionData, null, 2));

    res.json({ success: true, filename });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to save session", details: error.message });
  }
});

// List all saved sessions
app.get("/api/session/list", (req, res) => {
  try {
    const files = fs.readdirSync(DATA_DIR);
    const sessions = files
      .filter((file) => file.endsWith(".json"))
      .map((file) => {
        const filepath = path.join(DATA_DIR, file);
        const content = JSON.parse(fs.readFileSync(filepath, "utf-8"));
        return {
          filename: file,
          name: content.name,
          savedAt: content.savedAt,
          runCount: content.runs?.length || 0,
          plotCount: content.customPlots?.length || 0,
        };
      })
      .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

    res.json(sessions);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to list sessions", details: error.message });
  }
});

// Load a session
app.get("/api/session/load/:filename", (req, res) => {
  try {
    const { filename } = req.params;
    const filepath = path.join(DATA_DIR, filename);

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: "Session not found" });
    }

    const sessionData = JSON.parse(fs.readFileSync(filepath, "utf-8"));
    res.json(sessionData);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to load session", details: error.message });
  }
});

// Delete a session
app.delete("/api/session/delete/:filename", (req, res) => {
  try {
    const { filename } = req.params;
    const filepath = path.join(DATA_DIR, filename);

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: "Session not found" });
    }

    fs.unlinkSync(filepath);
    res.json({ success: true });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to delete session", details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});

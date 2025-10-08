import express from "express";
import cors from "cors";
import multer from "multer";
import { DualStorage } from "./storage/DualStorage.js";

const app = express();
const PORT = 3001;

const upload = multer({ storage: multer.memoryStorage() });

// Storage configuration
const ENABLE_FILE_STORAGE = process.env.ENABLE_FILE_STORAGE !== "false"; // default true
const ENABLE_MONGODB_STORAGE = process.env.ENABLE_MONGODB_STORAGE === "true"; // default false

console.log("[SERVER] Storage Configuration:");
console.log(`  - File Storage: ${ENABLE_FILE_STORAGE ? "ENABLED" : "DISABLED"}`);
console.log(`  - MongoDB Storage: ${ENABLE_MONGODB_STORAGE ? "ENABLED" : "DISABLED"}`);

const storage = new DualStorage({
  enableFile: ENABLE_FILE_STORAGE,
  enableMongo: ENABLE_MONGODB_STORAGE,
  mongoUri: process.env.MONGODB_URI,
});

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

// Save or update session
app.post("/api/sessions", async (req, res) => {
  try {
    const { id, name, runs, customPlots, createdAt, updatedAt } = req.body;

    if (!id || !name) {
      console.log("[BACKEND] Save failed: missing id or name");
      return res.status(400).json({ error: "Session id and name are required" });
    }

    const sessionData = {
      id,
      name,
      runs,
      customPlots,
      createdAt: createdAt || new Date().toISOString(),
      updatedAt: updatedAt || new Date().toISOString(),
    };

    console.log(`[BACKEND] Saving session: ${id} (${name}) - ${runs?.length || 0} runs, ${customPlots?.length || 0} plots`);

    const result = await storage.saveSession(sessionData);
    res.json(result);
  } catch (error) {
    console.error("[BACKEND] Save error:", error);
    res
      .status(500)
      .json({ error: "Failed to save session", details: error.message });
  }
});

// List all sessions
app.get("/api/sessions", async (req, res) => {
  try {
    const sessions = await storage.getAllSessions();
    res.json(sessions);
  } catch (error) {
    console.error("[BACKEND] List sessions error:", error);
    res
      .status(500)
      .json({ error: "Failed to list sessions", details: error.message });
  }
});

// Load a specific session
app.get("/api/sessions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const sessionData = await storage.getSession(id);

    if (!sessionData) {
      return res.status(404).json({ error: "Session not found" });
    }

    res.json(sessionData);
  } catch (error) {
    console.error("[BACKEND] Load session error:", error);
    res
      .status(500)
      .json({ error: "Failed to load session", details: error.message });
  }
});

// Delete a session
app.delete("/api/sessions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await storage.deleteSession(id);

    if (!result.success) {
      console.log(`[BACKEND] Delete failed: ${result.error}`);
      return res.status(404).json({ error: result.error });
    }

    res.json(result);
  } catch (error) {
    console.error("[BACKEND] Delete error:", error);
    res
      .status(500)
      .json({ error: "Failed to delete session", details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});

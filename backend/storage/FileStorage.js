import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class FileStorage {
  constructor() {
    this.dataDir = path.join(__dirname, "..", "data");
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    console.log("[FILE STORAGE] Initialized with directory:", this.dataDir);
  }

  async saveSession(sessionData) {
    try {
      const filename = `${sessionData.id}.json`;
      const filepath = path.join(this.dataDir, filename);

      fs.writeFileSync(filepath, JSON.stringify(sessionData, null, 2));
      console.log(`[FILE STORAGE] Saved session: ${sessionData.id} (${sessionData.name})`);

      return { success: true, session: sessionData };
    } catch (error) {
      console.error("[FILE STORAGE] Save error:", error);
      throw error;
    }
  }

  async getAllSessions() {
    try {
      const files = fs.readdirSync(this.dataDir);
      const sessions = {};

      files
        .filter((file) => file.endsWith(".json"))
        .forEach((file) => {
          const filepath = path.join(this.dataDir, file);
          try {
            const content = JSON.parse(fs.readFileSync(filepath, "utf-8"));
            sessions[content.id] = content;
          } catch (err) {
            console.error(`[FILE STORAGE] Failed to read file ${file}:`, err);
          }
        });

      console.log(`[FILE STORAGE] Listed ${Object.keys(sessions).length} sessions`);
      return sessions;
    } catch (error) {
      console.error("[FILE STORAGE] List error:", error);
      throw error;
    }
  }

  async getSession(id) {
    try {
      const filename = `${id}.json`;
      const filepath = path.join(this.dataDir, filename);

      if (!fs.existsSync(filepath)) {
        return null;
      }

      const sessionData = JSON.parse(fs.readFileSync(filepath, "utf-8"));
      console.log(`[FILE STORAGE] Loaded session: ${id}`);
      return sessionData;
    } catch (error) {
      console.error("[FILE STORAGE] Load error:", error);
      throw error;
    }
  }

  async deleteSession(id) {
    try {
      const filename = `${id}.json`;
      const filepath = path.join(this.dataDir, filename);

      if (!fs.existsSync(filepath)) {
        return { success: false, error: "Session not found" };
      }

      fs.unlinkSync(filepath);
      console.log(`[FILE STORAGE] Deleted session: ${id}`);
      return { success: true };
    } catch (error) {
      console.error("[FILE STORAGE] Delete error:", error);
      throw error;
    }
  }
}

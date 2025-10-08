import { MongoClient } from "mongodb";

export class MongoStorage {
  constructor(uri) {
    this.uri = uri || process.env.MONGODB_URI || "mongodb://admin:adminpassword@localhost:27017/benchmark_db?authSource=admin";
    this.client = null;
    this.db = null;
    this.collection = null;
    console.log("[MONGO STORAGE] Initializing with URI:", this.uri.replace(/\/\/.*@/, "//***:***@"));
  }

  async connect() {
    if (this.client) {
      return; // Already connected
    }

    try {
      this.client = new MongoClient(this.uri);
      await this.client.connect();
      this.db = this.client.db("benchmark_db");
      this.collection = this.db.collection("sessions");

      // Create index on id field for faster lookups
      await this.collection.createIndex({ id: 1 }, { unique: true });

      console.log("[MONGO STORAGE] Connected successfully");
    } catch (error) {
      console.error("[MONGO STORAGE] Connection error:", error);
      throw error;
    }
  }

  async saveSession(sessionData) {
    try {
      await this.connect();

      const result = await this.collection.updateOne(
        { id: sessionData.id },
        { $set: sessionData },
        { upsert: true }
      );

      console.log(`[MONGO STORAGE] Saved session: ${sessionData.id} (${sessionData.name})`);
      return { success: true, session: sessionData };
    } catch (error) {
      console.error("[MONGO STORAGE] Save error:", error);
      throw error;
    }
  }

  async getAllSessions() {
    try {
      await this.connect();

      const sessionArray = await this.collection.find({}).toArray();
      const sessions = {};

      sessionArray.forEach((session) => {
        const { _id, ...sessionWithoutId } = session; // Remove MongoDB's _id
        sessions[session.id] = sessionWithoutId;
      });

      console.log(`[MONGO STORAGE] Listed ${Object.keys(sessions).length} sessions`);
      return sessions;
    } catch (error) {
      console.error("[MONGO STORAGE] List error:", error);
      throw error;
    }
  }

  async getSession(id) {
    try {
      await this.connect();

      const session = await this.collection.findOne({ id });

      if (!session) {
        return null;
      }

      const { _id, ...sessionWithoutId } = session;
      console.log(`[MONGO STORAGE] Loaded session: ${id}`);
      return sessionWithoutId;
    } catch (error) {
      console.error("[MONGO STORAGE] Load error:", error);
      throw error;
    }
  }

  async deleteSession(id) {
    try {
      await this.connect();

      const result = await this.collection.deleteOne({ id });

      if (result.deletedCount === 0) {
        return { success: false, error: "Session not found" };
      }

      console.log(`[MONGO STORAGE] Deleted session: ${id}`);
      return { success: true };
    } catch (error) {
      console.error("[MONGO STORAGE] Delete error:", error);
      throw error;
    }
  }

  async close() {
    if (this.client) {
      await this.client.close();
      console.log("[MONGO STORAGE] Connection closed");
    }
  }
}

import { FileStorage } from "./FileStorage.js";
import { MongoStorage } from "./MongoStorage.js";

export class DualStorage {
  constructor(config = {}) {
    this.enableFile = config.enableFile !== false; // default true
    this.enableMongo = config.enableMongo === true; // default false
    this.mongoUri = config.mongoUri;

    this.storages = [];

    if (this.enableFile) {
      this.fileStorage = new FileStorage();
      this.storages.push({ name: "FILE", storage: this.fileStorage });
      console.log("[DUAL STORAGE] File storage ENABLED");
    } else {
      console.log("[DUAL STORAGE] File storage DISABLED");
    }

    if (this.enableMongo) {
      this.mongoStorage = new MongoStorage(this.mongoUri);
      this.storages.push({ name: "MONGO", storage: this.mongoStorage });
      console.log("[DUAL STORAGE] MongoDB storage ENABLED");
    } else {
      console.log("[DUAL STORAGE] MongoDB storage DISABLED");
    }

    if (this.storages.length === 0) {
      throw new Error("At least one storage type must be enabled!");
    }

    console.log(`[DUAL STORAGE] Active storages: ${this.storages.map(s => s.name).join(", ")}`);
  }

  async saveSession(sessionData) {
    const results = await Promise.allSettled(
      this.storages.map(({ name, storage }) =>
        storage.saveSession(sessionData).then(() => ({ name, success: true }))
      )
    );

    const failures = results.filter(r => r.status === "rejected");
    if (failures.length > 0) {
      console.error("[DUAL STORAGE] Some saves failed:", failures);
    }

    const successes = results.filter(r => r.status === "fulfilled").map(r => r.value.name);
    console.log(`[DUAL STORAGE] Saved to: ${successes.join(", ")}`);

    // Return success if at least one succeeded
    return { success: successes.length > 0, session: sessionData };
  }

  async getAllSessions() {
    // Use first available storage (file takes priority if both enabled)
    const { name, storage } = this.storages[0];
    console.log(`[DUAL STORAGE] Listing from: ${name}`);
    return await storage.getAllSessions();
  }

  async getSession(id) {
    // Use first available storage
    const { name, storage } = this.storages[0];
    console.log(`[DUAL STORAGE] Loading from: ${name}`);
    return await storage.getSession(id);
  }

  async deleteSession(id) {
    const results = await Promise.allSettled(
      this.storages.map(({ name, storage }) =>
        storage.deleteSession(id).then(() => ({ name, success: true }))
      )
    );

    const failures = results.filter(r => r.status === "rejected");
    if (failures.length > 0) {
      console.error("[DUAL STORAGE] Some deletes failed:", failures);
    }

    const successes = results.filter(r => r.status === "fulfilled").map(r => r.value.name);
    console.log(`[DUAL STORAGE] Deleted from: ${successes.join(", ")}`);

    // Return success if at least one succeeded
    return { success: successes.length > 0 };
  }
}

import db from "./database.ts";
import { Context } from "hono";

export async function logInfo(message: string, source = "System", c?: Context, ...args: unknown[]) {
  console.log(`[INFO] ${message}`, ...args);
  const userId = await c?.get('session')?.get('userId') || null;

  try {
    db.query(
      "INSERT INTO logs (level, message, source, user_id) VALUES (?, ?, ?, ?)",
      ["info", String(message), source, userId]
    );
  } catch (err) {
    console.error("Failed to write log to database:", err);
  }
}

export async function logError(message: string, source = "System", c?: Context, error?: unknown) {
  console.error(`[ERROR] ${message}`, error || "");
  const userId = await c?.get('session')?.get('userId') || null;
  
  try {
    db.query(
      "INSERT INTO logs (level, message, source, user_id) VALUES (?, ?, ?, ?)",
      ["error", String(message), source, userId]
    );
  } catch (err) {
    console.error("Failed to write error log to database:", err);
  }
}

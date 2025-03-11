import { logError } from "../../utils/logger.ts";
import db from "../../utils/database.ts";


// API Controller
export const getAllLogs = async (c) => {
  try {
    const logs = db.queryEntries(`
      SELECT l.timestamp, l.level, l.message, l.source, 
             c.login as user_login
      FROM logs l
      LEFT JOIN clients c ON l.user_id = c.id
      ORDER BY l.timestamp DESC
      LIMIT 100
    `).map((log) => {
      log.timestamp = new Date(log.timestamp).toISOString();
      return log;
    });
    return c.json(logs);
  } catch (err) {
    logError("Fehler beim Abrufen der Logs", "Logs", c, err);
    return c.text("Internal Server Error", 500);
  }
};
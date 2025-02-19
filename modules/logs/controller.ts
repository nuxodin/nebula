import { logError } from "../../utils/logger.ts";
import { renderTemplate } from "../../utils/template.ts";
import db from "../../utils/database.ts";

// View Controller
export const getLogsView = async (c) => {
  try {
    const content = await Deno.readTextFile("./modules/logs/views/content.html");
    const scripts = await Deno.readTextFile("./modules/logs/views/scripts.html");
    return c.html(await renderTemplate("Logs", content, "", scripts));
  } catch (err) {
    logError("Fehler beim Laden der Logs-Übersicht", "Logs", c, err);
    return c.text("Internal Server Error", 500);
  }
};

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
    `);
    return c.json(logs);
  } catch (err) {
    logError("Fehler beim Abrufen der Logs", "Logs", c, err);
    return c.text("Internal Server Error", 500);
  }
};
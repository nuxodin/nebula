import { Context } from "hono";
import { logError } from "../../utils/logger.ts";
import { renderTemplate } from "../../utils/template.ts";
import db from "../../utils/database.ts";

// View Controllers
export const getDatabaseView = async (c: Context) => {
  try {
    const content = await Deno.readTextFile("./modules/databases/views/content.html");
    const scripts = await Deno.readTextFile("./modules/databases/views/scripts.html");
    return c.html(await renderTemplate("Datenbanken", content, "", scripts));
  } catch (err) {
    logError("Fehler beim Laden der Datenbank-Übersicht", "Databases", c, err);
    return c.text("Internal Server Error", 500);
  }
};

export const getDatabaseDetailView = async (c: Context) => {
  try {
    const { id } = c.req.param();
    const database = db.queryEntries(`
      SELECT d.*, dom.name as domain_name,
             s.host, s.port, s.type as server_type
      FROM databases d
      LEFT JOIN domains dom ON d.dom_id = dom.id
      LEFT JOIN database_servers s ON d.server_id = s.id
      WHERE d.id = ?
    `, [id])[0];

    if (!database) {
      return c.text("Datenbank nicht gefunden", 404);
    }

    const content = await Deno.readTextFile("./modules/databases/views/detail/content.html");
    const scripts = await Deno.readTextFile("./modules/databases/views/detail/scripts.html");
    return c.html(await renderTemplate(`Datenbank ${database.name}`, content, "", scripts));
  } catch (err) {
    logError("Fehler beim Laden der Datenbank-Details", "Databases", c, err);
    return c.text("Internal Server Error", 500);
  }
};


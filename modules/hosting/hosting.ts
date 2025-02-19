import db from "../../utils/database.ts";
import { logInfo, logError } from "../../utils/logger.ts";

// Hosting-Einstellung erstellen
export const createHosting = async (c) => {
  try {
    const { dom_id, htype, ip_address } = await c.req.json();
    db.query("INSERT INTO hosting (dom_id, htype, ip_address) VALUES (?, ?, ?)", [dom_id, htype, ip_address]);
    logInfo(`Hosting for domain ${dom_id} created`);
    return c.json({ message: "Hosting created" });
  } catch (err) {
    logError("Error creating hosting:", err);
    return c.text("Internal Server Error", 500);
  }
};

// Alle Hosting-Einstellungen abrufen
export const getAllHosting = (c) => {
  try {
    const hosting = [...db.query("SELECT * FROM hosting")];
    logInfo("Fetched all hosting settings");
    return c.json(hosting);
  } catch (err) {
    logError("Error fetching hosting settings:", err);
    return c.text("Internal Server Error", 500);
  }
};

// Hosting-Einstellung nach ID abrufen
export const getHostingById = (c) => {
  try {
    const { id } = c.req.param();
    const hosting = db.query("SELECT * FROM hosting WHERE id = ?", [id]);
    if (hosting.length === 0) {
      return c.text("Hosting not found", 404);
    }
    logInfo(`Fetched hosting with id ${id}`);
    return c.json(hosting[0]);
  } catch (err) {
    logError("Error fetching hosting:", err);
    return c.text("Internal Server Error", 500);
  }
};

// Hosting-Einstellung aktualisieren
export const updateHosting = async (c) => {
  try {
    const { id } = c.req.param();
    const { dom_id, htype, ip_address } = await c.req.json();
    db.query("UPDATE hosting SET dom_id = ?, htype = ?, ip_address = ? WHERE id = ?", [dom_id, htype, ip_address, id]);
    logInfo(`Hosting ${id} updated`);
    return c.json({ message: "Hosting updated" });
  } catch (err) {
    logError("Error updating hosting:", err);
    return c.text("Internal Server Error", 500);
  }
};

// Hosting-Einstellung löschen
export const deleteHosting = (c) => {
  try {
    const { id } = c.req.param();
    db.query("DELETE FROM hosting WHERE id = ?", [id]);
    logInfo(`Hosting ${id} deleted`);
    return c.json({ message: "Hosting deleted" });
  } catch (err) {
    logError("Error deleting hosting:", err);
    return c.text("Internal Server Error", 500);
  }
};
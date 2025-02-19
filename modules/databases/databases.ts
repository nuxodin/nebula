import db from "../../utils/database.ts";
import { logInfo, logError } from "../../utils/logger.ts";

// Datenbank erstellen
export const createDatabase = async (c) => {
  try {
    const { dom_id, name, type } = await c.req.json();
    db.query("INSERT INTO databases (dom_id, name, type) VALUES (?, ?, ?)", [dom_id, name, type]);
    logInfo(`Database ${name} created for domain ${dom_id}`);
    return c.json({ message: "Database created" });
  } catch (err) {
    logError("Error creating database:", err);
    return c.text("Internal Server Error", 500);
  }
};

// Alle Datenbanken abrufen
export const getAllDatabases = (c) => {
  try {
    const { domain_id } = c.req.query();
    let databases;
    
    if (domain_id) {
      databases = db.queryEntries("SELECT * FROM databases WHERE dom_id = ?", [domain_id]);
    } else {
      databases = db.queryEntries("SELECT * FROM databases");
    }
    
    logInfo("Fetched databases");
    return c.json(databases);
  } catch (err) {
    logError("Error fetching databases:", err);
    return c.text("Internal Server Error", 500);
  }
};

// Datenbank nach ID abrufen
export const getDatabaseById = (c) => {
  try {
    const { id } = c.req.param();
    const database = db.query("SELECT * FROM databases WHERE id = ?", [id]);
    if (database.length === 0) {
      return c.text("Database not found", 404);
    }
    logInfo(`Fetched database with id ${id}`);
    return c.json(database[0]);
  } catch (err) {
    logError("Error fetching database:", err);
    return c.text("Internal Server Error", 500);
  }
};

// Datenbank aktualisieren
export const updateDatabase = async (c) => {
  try {
    const { id } = c.req.param();
    const { dom_id, name, type } = await c.req.json();
    db.query("UPDATE databases SET dom_id = ?, name = ?, type = ? WHERE id = ?", [dom_id, name, type, id]);
    logInfo(`Database ${id} updated`);
    return c.json({ message: "Database updated" });
  } catch (err) {
    logError("Error updating database:", err);
    return c.text("Internal Server Error", 500);
  }
};

// Datenbank löschen
export const deleteDatabase = (c) => {
  try {
    const { id } = c.req.param();
    db.query("DELETE FROM databases WHERE id = ?", [id]);
    logInfo(`Database ${id} deleted`);
    return c.json({ message: "Database deleted" });
  } catch (err) {
    logError("Error deleting database:", err);
    return c.text("Internal Server Error", 500);
  }
};
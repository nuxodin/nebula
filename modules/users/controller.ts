import { logInfo, logError } from "../../utils/logger.ts";
import { renderTemplate } from "../../utils/template.ts";
import db from "../../utils/database.ts";


// View Controller
export const getUserView = async (c) => {
  try {
    const content = await Deno.readTextFile("./modules/users/views/content.html");
    const scripts = await Deno.readTextFile("./modules/users/views/scripts.html");
    return c.html(await renderTemplate("Benutzer", content, "", scripts));
  } catch (err) {
    logError("Fehler beim Laden der Benutzer-Übersicht", "Users", c, err);
    return c.text("Internal Server Error", 500);
  }
};

// API Controllers
/*
export const getAllUsers = async (c) => {
  console.log('USED????????????????');

  try {
    const users = db.queryEntries(`
      SELECT c.*,
             COUNT(d.id) as domain_count
      FROM clients c
      LEFT JOIN domains d ON c.id = d.owner_id
      GROUP BY c.id
    `);
    return c.json(users);
  } catch (err) {
    logError("Fehler beim Laden der Benutzer", "Users", c, err);
    return c.json({ error: "Fehler beim Laden der Benutzer" }, 500);
  }
};

export const registerUser = async (c) => {
  console.log('USED????????????????');
  try {
    const { login, email, password } = await c.req.json();
    
    const existing = db.queryEntries(
      "SELECT * FROM clients WHERE login = ? OR email = ?",
      [login, email]
    );
    
    if (existing.length > 0) {
      return c.json({ error: "Benutzername oder E-Mail existiert bereits" }, 400);
    }
    
    const result = db.queryEntries(
      "INSERT INTO clients (login, email, password) VALUES (?, ?, ?) RETURNING id",
      [login, email, password]
    );
    
    logInfo(`Benutzer ${login} wurde erstellt`, "Users", c);
    return c.json({ id: result[0].id, login, email });
  } catch (err) {
    logError("Fehler beim Erstellen des Benutzers", "Users", c, err);
    return c.json({ error: "Internal Server Error" }, 500);
  }
};

export const deleteUser = async (c) => {
  console.log('USED????????????????');
  try {
    const { id } = c.req.param();
    const user = db.queryEntries("SELECT login FROM clients WHERE id = ?", [id])[0];
    
    if (!user) {
      return c.json({ error: "Benutzer nicht gefunden" }, 404);
    }
    
    db.query("DELETE FROM clients WHERE id = ?", [id]);
    logInfo(`Benutzer ${user.login} wurde gelöscht`, "Users", c);
    
    return c.json({ message: "Benutzer wurde gelöscht" });
  } catch (err) {
    logError("Fehler beim Löschen des Benutzers", "Users", c, err);
    return c.json({ error: "Internal Server Error" }, 500);
  }
};

export const getUserById = async (c) => {
  console.log('USED????????????????');
  try {
    const { id } = c.req.param();
    const user = db.queryEntries("SELECT * FROM clients WHERE id = ?", [id])[0];
    
    if (!user) {
      return c.json({ error: "Benutzer nicht gefunden" }, 404);
    }
    
    return c.json(user);
  } catch (err) {
    logError("Fehler beim Laden des Benutzers", "Users", c, err);
    return c.json({ error: "Internal Server Error" }, 500);
  }
};

*/
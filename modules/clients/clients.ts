import db from "../../utils/database.ts";
import { logInfo, logError } from "../../utils/logger.ts";

export const getAllClients = (c) => {
  console.log('this is used');
  try {
    const clients = db.queryEntries(`
      SELECT c.*,
             COUNT(d.id) as domain_count
      FROM clients c
      LEFT JOIN domains d ON c.id = d.owner_id
      GROUP BY c.id
    `);
    return c.json(clients);
  } catch (err) {
    logError("Fehler beim Abrufen der Benutzer", "Users", c, err);
    return c.text("Internal Server Error", 500);
  }
};

export const createClient = async (c) => {
  try {
    const { login, email, password } = await c.req.json();
    
    // Prüfen ob Benutzer oder Email bereits existiert
    const existing = db.queryEntries(
      "SELECT * FROM clients WHERE login = ? OR email = ?",
      [login, email]
    );
    
    if (existing.length > 0) {
      return c.json({ message: "Benutzername oder E-Mail existiert bereits" }, 400);
    }
    
    // Benutzer erstellen
    const result = db.queryEntries(
      "INSERT INTO clients (login, email, password) VALUES (?, ?, ?) RETURNING id",
      [login, email, password]
    );
    
    const clientId = result[0].id;
    logInfo(`Benutzer ${login} wurde erstellt`, "Users", c);
    
    const newClient = db.queryEntries("SELECT * FROM clients WHERE id = ?", [clientId])[0];
    return c.json(newClient);
  } catch (err) {
    logError("Fehler beim Erstellen des Benutzers", "Users", c, err);
    return c.text("Internal Server Error", 500);
  }
};

export const deleteClient = async (c) => {
  try {
    const { id } = c.req.param();
    const client = db.queryEntries("SELECT login FROM clients WHERE id = ?", [id])[0];
    
    // Prüfen ob Benutzer Domains besitzt
    const domains = db.queryEntries("SELECT id FROM domains WHERE owner_id = ?", [id]);
    
    // Wenn ja, lösche alle zugehörigen Daten
    for (const domain of domains) {
      db.query("DELETE FROM dns_records WHERE domain_id = ?", [domain.id]);
      db.query("DELETE FROM hosting WHERE dom_id = ?", [domain.id]);
      db.query("DELETE FROM databases WHERE dom_id = ?", [domain.id]);
      db.query("DELETE FROM mail WHERE dom_id = ?", [domain.id]);
      db.query("DELETE FROM domains WHERE id = ?", [domain.id]);
    }
    
    // Dann lösche den Benutzer
    db.query("DELETE FROM clients WHERE id = ?", [id]);
    
    logInfo(`Benutzer ${client?.login} wurde gelöscht`, "Users", c);
    return c.json({ message: "Client deleted" });
  } catch (err) {
    logError("Fehler beim Löschen des Benutzers", "Users", c, err);
    return c.text("Internal Server Error", 500);
  }
};

export const getClientById = (c) => {
  try {
    const { id } = c.req.param();
    
    const client = db.queryEntries(`
      SELECT c.*,
             COUNT(d.id) as domain_count,
             GROUP_CONCAT(d.name) as domains
      FROM clients c
      LEFT JOIN domains d ON c.id = d.owner_id
      WHERE c.id = ?
      GROUP BY c.id
    `, [id])[0];

    if (!client) {
      return c.text("Client not found", 404);
    }

    // Formatiere die Domains-Liste
    if (client.domains) {
      client.domains = client.domains.split(',');
    } else {
      client.domains = [];
    }

    return c.json(client);
  } catch (err) {
    logError("Fehler beim Abrufen der Benutzer-Details", "Users", c, err);
    return c.text("Internal Server Error", 500);
  }
};

// GET /api/clients/me - Get current user's profile
export const getCurrentUser = async (c) => {
  try {
    const session = c.get('session');
    const userId = await session.get('userId');
    
    const user = db.queryEntries(`
      SELECT id, login, email
      FROM clients 
      WHERE id = ?
    `, [userId])[0];

    if (!user) {
      return c.json({ error: "Benutzer nicht gefunden" }, 404);
    }

    return c.json(user);
  } catch (err) {
    logError("Fehler beim Abrufen der Benutzerdaten", "Users", c, err);
    return c.text("Internal Server Error", 500);
  }
};
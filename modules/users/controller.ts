import { Context } from "hono";
import { logInfo, logError } from "../../utils/logger.ts";
import { renderTemplate } from "../../utils/template.ts";
import db from "../../utils/database.ts";
import { hash } from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { CDPSession } from 'https://deno.land/x/puppeteer@16.2.0/mod.ts';

// View Controllers
export const getUserView = async (c: Context) => {
  try {
    const content = await Deno.readTextFile("./modules/users/views/content.html");
    const scripts = await Deno.readTextFile("./modules/users/views/scripts.html");
    return c.html(await renderTemplate("Benutzer", content, "", scripts));
  } catch (err) {
    logError("Fehler beim Laden der Benutzer-Übersicht", "Users", c, err);
    return c.text("Internal Server Error", 500);
  }
};

export const getUserDetailView = async (c: Context) => {
  const { id } = c.req.param();
  const user = db.queryEntries(`
    SELECT c.*,
            COUNT(d.id) as domain_count,
            GROUP_CONCAT(d.name) as domains
    FROM clients c
    LEFT JOIN domains d ON c.id = d.owner_id
    WHERE c.id = ?
    GROUP BY c.id
  `, [id])[0];

  if (!user) return c.text("detail view: enutzer nicht gefunden", 404);

  const content = await Deno.readTextFile("./modules/users/views/detail/content.html");
  const scripts = await Deno.readTextFile("./modules/users/views/detail/scripts.html");
  return c.html(await renderTemplate(`Benutzer ${user.login}`, content, "", scripts));
};

// API Controllers
export const api = {
  get: function(_c: Context) {
    return db.queryEntries("SELECT id, login, email FROM clients");
  },
  post: async function(c: Context) {
    const data = await c.req.json();
    
    // Prüfen ob Benutzer oder Email bereits existiert
    const existing = db.queryEntries(
      "SELECT * FROM clients WHERE login = ? OR email = ?",
      [data.login, data.email]
    );
    
    if (existing.length > 0) {
      return { error: "Benutzername oder E-Mail existiert bereits" };
    }
    
    // Hash password before storing
    const hashedPassword = await hash(data.password);
    
    // Benutzer erstellen
    const result = db.queryEntries(
      "INSERT INTO clients (login, email, password) VALUES (?, ?, ?) RETURNING id",
      [data.login, data.email, hashedPassword]
    );
    
    logInfo(`Benutzer ${data.login} wurde erstellt`, "Users", c);
    return { id: result[0].id, login: data.login, email: data.email };
  },
  'me': {
    get: async function(c: Context) {
      const session = c.get('session');
      const userId = await session.get('userId');
      const user = db.queryEntries(`
        SELECT id, login, email
        FROM clients 
        WHERE id = ?
      `, [userId])[0];

      if (!user) throw new Error("me: Benutzer nicht gefunden");

      return user;
    }
  },
  ':id': {
    get: function(c: Context) {
      const { id } = c.req.param();
      const user = db.queryEntries(`
        SELECT c.*,
               COUNT(d.id) as domain_count,
               GROUP_CONCAT(d.name) as domains
        FROM clients c
        LEFT JOIN domains d ON d.owner_id = c.id
        WHERE c.id = ?
        GROUP BY c.id
      `, [id])[0];

      if (!user) return { error: "byid: Benutzer nicht gefunden" };

      return user;
    },
    delete: function(c: Context) {
      const { id } = c.req.param();
      
      const user = db.queryEntries("SELECT * FROM clients WHERE id = ?", [id])[0];
      if (!user) return { error: "delete: Benutzer nicht gefunden" };
      
      const domains = db.queryEntries<{count: number}>("SELECT COUNT(*) as count FROM domains WHERE owner_id = ?", [id])[0];
      if (domains.count > 0) return { error: "Benutzer hat noch Domains und kann nicht gelöscht werden" };
      
      db.query("DELETE FROM clients WHERE id = ?", [id]);
      logInfo(`Benutzer ${user.login} wurde gelöscht`, "Users", c);
      return { message: "Benutzer gelöscht" };
    },
    'password': {
      post: async function(c: Context) {
        const { id } = c.req.param();
        const { password } = await c.req.json();
        
        const user = db.queryEntries("SELECT login FROM clients WHERE id = ?", [id])[0];
        if (!user) return { error: "set password: Benutzer nicht gefunden" };
        
        const hashedPassword = await hash(password);
        db.query("UPDATE clients SET password = ? WHERE id = ?", [hashedPassword, id]);
        logInfo(`Passwort für Benutzer ${user.login} wurde geändert`, "Users", c);
        return { success: true };
      }
    }
  },
};
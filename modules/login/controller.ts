import { logInfo, logError } from "../../utils/logger.ts";
import db from "../../utils/database.ts";
import { renderTemplate } from "../../utils/template.ts";

// GET /login - Render login page
export const getLogin = async (c) => {
  try {
    const loginHtml = await Deno.readTextFile("./modules/login/views/login.html");
    return c.html(loginHtml);
  } catch (err) {
    logError("Fehler beim Laden der Login-Seite", "Auth", c, err);
    return c.text("Internal Server Error", 500);
  }
};

// POST /login - Process login credentials
export const postLogin = async (c) => {
  try {
    const formData = await c.req.formData();
    const login = formData.get("login");
    const password = formData.get("password");

    if (!login || !password) {
      return c.html(await Deno.readTextFile("./modules/login/views/login.html") + '<p class="error-message">Login und Passwort sind erforderlich</p>');
    }

    // Prüfe Credentials in der clients Tabelle
    const users = db.queryEntries("SELECT * FROM clients WHERE login = ? AND password = ?", [login, password]);
    
    if (users.length === 0) {
      logError(`Fehlgeschlagener Login-Versuch für Benutzer: ${login}`, "Auth", c);
      return c.html(await Deno.readTextFile("./modules/login/views/login.html") + '<p class="error-message">Ungültige Zugangsdaten</p>');
    }

    const user = users[0];
    logInfo(`Benutzer ${login} hat sich erfolgreich angemeldet`, "Auth", c);

    // Setze Session-Variablen
    const session = c.get('session');
    await session.set('isLoggedIn', true);
    await session.set('userId', user.id);
    await session.set('userLogin', user.login);

    return c.redirect('/');
  } catch (err) {
    logError("Fehler beim Login-Vorgang", "Auth", c, err);
    return c.text("Internal Server Error", 500);
  }
};

// GET /logout - Handle logout
export const getLogout = async (c) => {
  try {
    const session = c.get('session');
    const userLogin = await session.get('userLogin');
    logInfo(`Benutzer ${userLogin} hat sich abgemeldet`, "Auth", c);
    
    // Session löschen
    await session.deleteAll();
    
    return c.redirect('/login');
  } catch (err) {
    logError("Fehler beim Logout-Vorgang", "Auth", c, err);
    return c.text("Internal Server Error", 500);
  }
};

// GET /password - Render password change page
export const getPasswordChange = async (c) => {
  try {
    const content = await Deno.readTextFile("./modules/login/views/content.html");
    return c.html(await renderTemplate("Passwort ändern", content));
  } catch (err) {
    logError("Fehler beim Laden der Passwort-Ändern-Seite", "Auth", c, err);
    return c.text("Internal Server Error", 500);
  }
};

// GET /profile - Render profile page
export const getProfile = async (c) => {
  try {
    const content = await Deno.readTextFile("./modules/login/views/profile.html");
    const scripts = await Deno.readTextFile("./modules/login/views/scripts.html");
    return c.html(await renderTemplate("Mein Profil", content, "", scripts));
  } catch (err) {
    logError("Fehler beim Laden der Profil-Seite", "Auth", c, err);
    return c.text("Internal Server Error", 500);
  }
};

// POST /profile/password - Process password change
export const postPasswordChange = async (c) => {
  try {
    const formData = await c.req.formData();
    const currentPassword = formData.get("currentPassword");
    const newPassword = formData.get("newPassword");
    const confirmPassword = formData.get("confirmPassword");

    const session = c.get('session');
    const userId = await session.get('userId');

    const content = await Deno.readTextFile("./modules/login/views/profile.html");
    
    if (!currentPassword || !newPassword || !confirmPassword) {
      return c.html(await renderTemplate("Mein Profil", content + 
        '<div class="error-message" style="color: #dc2626; text-align: center; margin-top: 1rem;">Alle Felder sind erforderlich</div>'));
    }

    if (newPassword !== confirmPassword) {
      return c.html(await renderTemplate("Mein Profil", content + 
        '<div class="error-message" style="color: #dc2626; text-align: center; margin-top: 1rem;">Die neuen Passwörter stimmen nicht überein</div>'));
    }

    // Überprüfe aktuelles Passwort
    const users = db.queryEntries("SELECT * FROM clients WHERE id = ? AND password = ?", [userId, currentPassword]);
    
    if (users.length === 0) {
      return c.html(await renderTemplate("Mein Profil", content + 
        '<div class="error-message" style="color: #dc2626; text-align: center; margin-top: 1rem;">Aktuelles Passwort ist nicht korrekt</div>'));
    }

    // Passwort aktualisieren
    db.query("UPDATE clients SET password = ? WHERE id = ?", [newPassword, userId]);
    logInfo(`Benutzer hat sein Passwort geändert`, "Auth", c);

    return c.redirect('/profile?passwordChanged=true');
  } catch (err) {
    logError("Fehler bei der Passwortänderung", "Auth", c, err);
    return c.text("Internal Server Error", 500);
  }
};

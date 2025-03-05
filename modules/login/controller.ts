import { logInfo, logError } from "../../utils/logger.ts";
import db from "../../utils/database.ts";
import { renderTemplate } from "../../utils/template.ts";
import { Context } from "hono";
import { compare } from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

// GET /login - Render login page
export const getLogin = async (c: Context) => {
  try {
    const returnPath = String(c.get('returnPath') || '/');
    
    let content = await Deno.readTextFile("./modules/login/views/content.html");
    content = content.replace('value="RETURN_URL_PLACEHOLDER"', `value="${returnPath}"`);

    return c.html(await renderTemplate("Login", content, "", ""));
  } catch (err) {
    logError("Fehler beim Laden der Login-Seite", "Auth", c, err);
    return c.text("Internal Server Error", 500);
  }
};

// POST /login - Process login credentials
export async function postLogin(c: Context) {
  try {
    const formData = await c.req.parseBody();
    const login = String(formData.login || '');
    const password = String(formData.password || '');
    const returnUrl = String(formData.returnUrl || '/');

    if (!login || !password) {
      let content = await Deno.readTextFile("./modules/login/views/login.html");
      const scripts = await Deno.readTextFile("./modules/login/views/scripts.html");
      
      content = content.replace('value="RETURN_URL_PLACEHOLDER"', `value="${returnUrl}"`);
      const scriptWithError = scripts + `
        <script>
          window.loginError = "Login und Passwort sind erforderlich";
        </script>
      `;
      
      return c.html(await renderTemplate("Login", content, "", scriptWithError));
    }

    // Get user by login only first
    const user = db.queryEntries<{id: number; login: string; password: string}>(
      "SELECT id, login, password FROM clients WHERE login = ?",
      [login]
    )[0];

    // Verify password using bcrypt
    const isValidPassword = user ? await compare(password, user.password) : false;

    if (!user || !isValidPassword) {
      const content = await Deno.readTextFile("./modules/login/views/content.html");
      const scriptWithError = `
        <script>
          window.loginError = "Ungültige Anmeldedaten";
        </script>
      `;
      
      return c.html(await renderTemplate("Login", content, "", scriptWithError));
    }

    const session = c.get('session');
    await session.set('userId', user.id);
    await session.set('userLogin', user.login);
    
    return c.redirect(returnUrl);
  } catch (err) {
    logError("Fehler beim Login-Vorgang", "Login", c, err);
    return c.text("Internal Server Error", 500);
  }
}

// GET /logout - Handle logout
export const getLogout = async (c: Context) => {
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

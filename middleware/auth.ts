import { logError } from "../utils/logger.ts";
import db from "../utils/database.ts";
import { Context, Next } from "hono";

export const authMiddleware = async (c: Context, next: Next) => {
  try {
    const session = c.get('session');
    const isLoggedIn = await session.get('isLoggedIn');
    const currentPath = new URL(c.req.url).pathname;

    // Login-Seite ist immer zugänglich
    if (currentPath === '/login') {
      return next();
    }

    // API-Requests erhalten 401, andere werden zum Login umgeleitet
    if (!isLoggedIn) {
      if (c.req.header('Accept')?.includes('application/json')) {
        return c.json({ error: 'Nicht authentifiziert' }, 401);
      }
      return c.redirect('/login');
    }

    // Session-Daten in den Request-Kontext kopieren
    c.set('userId', await session.get('userId'));
    c.set('userLogin', await session.get('userLogin'));

    return next();
  } catch (err) {
    console.error("Authentifizierungsfehler:", err);
    if (c.req.header('Accept')?.includes('application/json')) {
      return c.json({ error: 'Nicht authentifiziert' }, 401);
    }
    return c.redirect('/login');
  }
};

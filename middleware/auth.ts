import { logError } from "../utils/logger.ts";
import db from "../utils/database.ts";
import { Context, Next } from "hono";
import { getLogin } from "../modules/login/controller.ts";

export async function authMiddleware(c: Context, next: () => Promise<Response>) {
  const session = c.get('session');
  const isLoggedIn = await session.get('userId');

  if (!isLoggedIn) {
    // Speichere nur den Pfad im Context
    c.set('returnPath', c.req.path);
    return getLogin(c);
  }

  return next();
}

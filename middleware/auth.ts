import { Context, Next } from "hono";
import { createMiddleware } from "hono/helper.ts";
//import { getLogin } from "../modules/login/controller.ts";
import { getLoginView } from "../modules/login/controller.ts";

// use createMiddleware
export const authMiddleware = createMiddleware(async (c: Context, next: Next) => {

  const session = c.get('session');
  const isLoggedIn = await session.get('userId');

  if (!isLoggedIn) {
    // Speichere nur den Pfad im Context
    c.set('returnPath', c.req.path);
    return getLoginView(c);
    //return getLogin(c);
  }

  return next();
});


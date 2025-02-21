import { Context, Next } from "hono";
import { logInfo, logError } from "../utils/logger.ts";
import { createMiddleware } from "hono/helper.ts";

const store = new Map<string, Record<string, unknown>>();

function generateSessionId(): string {
  return crypto.randomUUID();
}

export const sessionMiddleware = createMiddleware(async (c: Context, next: Next) => {
  // Get session ID from cookie or create new one
  let sessionId = c.req.cookie()?.sessionId; // todo: c.req.cookie() is deprecated:  Use Cookie Middleware instead of c.req.cookie(). The c.req.cookie() will be removed in v4.
  if (!sessionId) {
    sessionId = generateSessionId();
    c.cookie('sessionId', sessionId, {
      httpOnly: true,
      path: '/',
      sameSite: 'Lax',
      maxAge: 900 // 15 minutes
    });
  }

  // Get or create session data
  if (!store.has(sessionId)) {
    store.set(sessionId, {});
  }
  const session = store.get(sessionId)!;

  // Add session methods to context
  const sessionInterface = {
    get: async (key: string) => session[key],
    set: async (key: string, value: unknown) => {
      session[key] = value;
      store.set(sessionId, session);
    },
    delete: async (key: string) => {
      delete session[key];
      store.set(sessionId, session);
    },
    deleteAll: async () => {
      store.delete(sessionId);
      c.cookie('sessionId', '', { maxAge: 0 });
    }
  };

  c.set('session', sessionInterface);

  // Kopiere die Session in die Request-Umgebung für Sub-Requests
  c.env.session = sessionInterface;

  await next();
});

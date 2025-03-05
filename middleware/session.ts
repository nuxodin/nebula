import { Context, Next } from "hono";
import { createMiddleware } from "hono/helper.ts";
import db from "../utils/database.ts";

// Create sessions table if not exists
db.query(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    data TEXT
  )
`);

export const sessionMiddleware = createMiddleware(async (c: Context, next: Next) => {
  // Get session ID from cookie or create new one
  let sessionId = c.req.cookie()?.sessionId;
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    c.cookie('sessionId', sessionId, {
      httpOnly: true,
      secure: true,
      path: '/',
      sameSite: 'Lax',
      maxAge: 30 * 24 * 60 * 60 // 30 days
    });
  }

  // Add session methods to context
  const sessionInterface = {
    get: async (key: string) => {
      const session = db.queryEntries(`SELECT data FROM sessions WHERE id = ?`, [sessionId])[0];
      return session ? JSON.parse(session.data)[key] : undefined;
    },
    set: async (key: string, value: unknown) => {
      const session = db.queryEntries(`SELECT data FROM sessions WHERE id = ?`, [sessionId])[0];
      const data = session ? JSON.parse(session.data) : {};
      data[key] = value;
      db.query(`INSERT OR REPLACE INTO sessions (id, data) VALUES (?, ?)`, 
        [sessionId, JSON.stringify(data)]
      );
    },
    deleteAll: async () => {
      db.query(`DELETE FROM sessions WHERE id = ?`, [sessionId]);
      c.cookie('sessionId', '', { maxAge: 0 });
    }
  };

  c.set('session', sessionInterface);
  c.env.session = sessionInterface;

  await next();
});
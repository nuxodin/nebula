import { logError } from "../../utils/logger.ts";
import db from "../../utils/database.ts";
import { Context } from "hono";

export const getDashboardStats = (c: Context) => {
  try {
    // Aktive Domains zählen und letzte Domains abrufen
    const domains = db.queryEntries(`
      SELECT d.id, d.name, d.status
      FROM domains d
      ORDER BY d.created_at DESC
      LIMIT 3
    `);
    
    const domainStats = db.queryEntries(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'aktiv' THEN 1 ELSE 0 END) as active
      FROM domains
    `)[0];

    // Benutzer-Statistiken
    const userStats = db.queryEntries(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) as active
      FROM clients
    `)[0];

    // Aktive Benutzer mit ihrer Rolle abrufen
    const users = db.queryEntries(`
      SELECT c.login as name,
        CASE 
          WHEN EXISTS (SELECT 1 FROM domains d WHERE d.owner_id = c.id)
          THEN 'Domain-Besitzer'
          ELSE 'Benutzer'
        END as role
      FROM clients c
      LIMIT 3
    `);

    // Letzte Aktivitäten aus dem Log
    const activities = db.queryEntries(`
      SELECT 
        time(timestamp) as time,
        message as event
      FROM logs
      ORDER BY timestamp DESC
      LIMIT 3
    `);

    const stats = {
      domains: {
        total: domainStats.total,
        active: domainStats.active,
        list: domains
      },
      users: {
        total: userStats.total,
        active: userStats.active,
        list: users
      },
      activities: activities
    };

    return c.json(stats);
  } catch (err: unknown) {
    logError("Error in getDashboardStats:", "Dashboard", c, String(err));
    return c.text("Internal Server Error", 500);
  }
};
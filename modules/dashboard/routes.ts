import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth.ts";
import { renderTemplate } from "../../utils/template.ts";
import db from "../../utils/database.ts";

// API Routes
const apiRoutes = new Hono();
apiRoutes.use(authMiddleware);

apiRoutes.get("/stats", async (c) => {
  try {
    const stats = {
      domains: {
        total: 0,
        active: 0,
        list: []
      },
      users: {
        total: 0,
        active: 0,
        list: []
      },
      activities: []
    };

    // Domain-Statistiken
    const domains = db.queryEntries(`
      SELECT d.*, c.login as owner_name
      FROM domains d
      LEFT JOIN clients c ON d.owner_id = c.id
      ORDER BY d.created_at DESC
      LIMIT 3
    `);
    
    const domainStats = db.queryEntries(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN status = 'aktiv' THEN 1 ELSE 0 END) as active
      FROM domains
    `)[0];

    stats.domains.total = domainStats.total;
    stats.domains.active = domainStats.active;
    stats.domains.list = domains;

    // Benutzer-Statistiken
    const users = db.queryEntries(`
      SELECT login as name,
             'Benutzer' as role
      FROM clients
      LIMIT 3
    `);

    const userStats = db.queryEntries(`
      SELECT COUNT(*) as total
      FROM clients
    `)[0];

    stats.users.total = userStats.total;
    stats.users.active = userStats.total; // Alle Benutzer sind aktiv
    stats.users.list = users;

    // Letzte Aktivitäten
    stats.activities = db.queryEntries(`
      SELECT timestamp as time, message as event
      FROM logs
      ORDER BY timestamp DESC
      LIMIT 3
    `);

    return c.json(stats);
  } catch (err) {
    return c.json({ error: "Fehler beim Laden der Dashboard-Daten" }, 500);
  }
});

// View Routes
const viewRoutes = new Hono();
viewRoutes.use(authMiddleware);

viewRoutes.get("/", async (c) => {
  try {
    const content = await Deno.readTextFile("./modules/dashboard/views/content.html");
    const scripts = await Deno.readTextFile("./modules/dashboard/views/scripts.html");
    return c.html(await renderTemplate("Dashboard", content, "", scripts));
  } catch (err) {
    return c.text("Internal Server Error", 500);
  }
});

export { apiRoutes, viewRoutes };
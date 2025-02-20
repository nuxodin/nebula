import { Hono } from "hono";
import { serveStatic } from "https://deno.land/x/hono@v3.11.7/middleware.ts";
import { sessionMiddleware } from "./middleware/session.ts";
import { authMiddleware } from "./middleware/auth.ts";
import { apiRoutes as userApiRoutes, viewRoutes as userViewRoutes } from "./modules/users/routes.ts";
import { apiRoutes as logsApiRoutes, viewRoutes as logsViewRoutes } from "./modules/logs/routes.ts";
import { apiRoutes as dashboardApiRoutes, viewRoutes as dashboardViewRoutes } from "./modules/dashboard/routes.ts";
import { apiRoutes as domainsApiRoutes, viewRoutes as domainsViewRoutes } from "./modules/domains/routes.ts";
import clientRoutes from "./modules/clients/routes.ts";
import databaseRoutes from "./modules/databases/routes.ts";
import mailRoutes from "./modules/mail/routes.ts";
import filesRoutes, { createFileRoutes } from "./modules/files/routes.ts";
import { getLogin, postLogin, getLogout, getProfile, postPasswordChange } from "./modules/login/controller.ts";
import { logError } from "./utils/logger.ts";
import db from "./utils/database.ts";

//import "./install.ts";

// Initialisierung der Datenbank und Beispieldaten
async function initializeDatabase() {
  try {
    const tables = db.queryEntries<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name='clients'");
    
    if (tables.length === 0) {
      await import("./insert_example_data.ts");
      console.log("Datenbank wurde mit Beispieldaten initialisiert");
    } else {
      const clientCount = db.queryEntries<{ count: number }>("SELECT COUNT(*) as count FROM clients")[0];
      if (clientCount.count === 0) {
        await import("./insert_example_data.ts");
        console.log("Beispieldaten wurden in die bestehende Datenbank eingefügt");
      } else {
        console.log("Datenbank bereits initialisiert mit", clientCount.count, "Benutzern");
      }
    }
  } catch (error) {
    console.error("Fehler bei der Initialisierung der Datenbank:", error);
  }
}

await initializeDatabase();

const port = Number(Deno.env.get('PORT')) || 3000;
const app = new Hono();

// Middleware
app.use('*', sessionMiddleware);
app.use('/public/*', serveStatic({ root: './' }));

// Ungeschützte Routen
app.get("/login", getLogin);
app.post("/login", postLogin);
app.get("/logout", getLogout);

// Auth Middleware für geschützte Routen
app.use('*', authMiddleware);

// View Routes
app.route("/", dashboardViewRoutes);
app.route("/users", userViewRoutes);
app.route("/logs", logsViewRoutes);
app.route("/domains", domainsViewRoutes);
app.route("/files", filesRoutes); // Add global file explorer route

// Profile Routes
app.get("/profile", getProfile);
app.post("/profile/password", postPasswordChange);

// API Routes direkt an der Hauptapp
app.route("/api/dashboard", dashboardApiRoutes);
app.route("/api/users", userApiRoutes);
app.route("/api/logs", logsApiRoutes);
app.route("/api/domains", domainsApiRoutes);
app.route("/api/clients", clientRoutes);
app.route("/api/databases", databaseRoutes);
app.route("/api/mail", mailRoutes);
app.route("/api/files", createFileRoutes({ rootPath: "/" }));

// Error Handling
app.notFound((c) => c.text("Not Found", 404));
app.onError((err, c) => {
  logError("Server error:", err);
  return c.text("Internal Server Error", 500);
});

// Server starten
Deno.serve({ port }, app.fetch);
console.log(`Nebula läuft auf http://localhost:${port}`);


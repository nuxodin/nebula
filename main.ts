import { install } from "./install/install.ts"; // first
import './install/install-stacks.ts';
import { Hono } from "hono";
import { serveStatic } from "https://deno.land/x/hono@v3.11.7/middleware.ts";
import { sessionMiddleware } from "./middleware/session.ts";
import { authMiddleware } from "./middleware/auth.ts";
import { /*apiRoutes as userApiRoutes, */ viewRoutes as userViewRoutes } from "./modules/users/routes.ts";
import { apiRoutes as logsApiRoutes, viewRoutes as logsViewRoutes } from "./modules/logs/routes.ts";
import { apiRoutes as dashboardApiRoutes, viewRoutes as dashboardViewRoutes } from "./modules/dashboard/routes.ts";
import { apiRoutes as domainsApiRoutes, viewRoutes as domainsViewRoutes } from "./modules/domains/routes.ts";
import { apiRoutes as mailApiRoutes, viewRoutes as mailViewRoutes } from "./modules/mail/routes.ts";
import { apiRoutes as prozessApiRoutes, viewRoutes as prozessViewRoutes } from "./modules/prozess/routes.ts";
import { apiRoutes as terminalApiRoutes, viewRoutes as terminalViewRoutes } from "./modules/terminal/routes.ts";
import { apiRoutes as packagesApiRoutes, viewRoutes as packagesViewRoutes } from "./modules/packages/routes.ts";
import { apiRoutes as servicesApiRoutes, viewRoutes as servicesViewRoutes } from "./modules/services/routes.ts";
import clientRoutes from "./modules/clients/routes.ts";
import databaseRoutes from "./modules/databases/routes.ts";
import filesRoutes, { createFileRoutes } from "./modules/files/routes.ts";
import { getLogin, postLogin, getLogout, getProfile, postPasswordChange } from "./modules/login/controller.ts";
import { logError } from "./utils/logger.ts";

await install();

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

// API Routes zuerst definieren für höhere Priorität
app.route("/api/dashboard", dashboardApiRoutes);
//app.route("/api/users", userApiRoutes);
app.route("/api/logs", logsApiRoutes);
app.route("/api/domains", domainsApiRoutes);
app.route("/api/clients", clientRoutes);
app.route("/api/databases", databaseRoutes);
app.route("/api/mail", mailApiRoutes);
app.route("/api/prozess", prozessApiRoutes);
app.route("/api/terminal", terminalApiRoutes);
app.route("/api/files", createFileRoutes({ rootPath: "/" }));
app.route("/api/packages", packagesApiRoutes);
app.route("/api/services", servicesApiRoutes);

// Dann erst die View Routes
app.route("/", dashboardViewRoutes);
app.route("/users", userViewRoutes);
app.route("/logs", logsViewRoutes);
app.route("/domains", domainsViewRoutes);
app.route("/mail", mailViewRoutes);
app.route("/prozess", prozessViewRoutes);
app.route("/terminal", terminalViewRoutes);
app.route("/files", filesRoutes); // Add global file explorer route
app.route("/packages", packagesViewRoutes);
app.route("/services", servicesViewRoutes);

// Profile Routes
app.get("/profile", getProfile);
app.post("/profile/password", postPasswordChange);

// Error Handling
app.notFound((c) => c.text("Not Found", 404));
app.onError((err, c) => {
  logError("Server error: " + err.message, "Server", c, err);
  return c.text("Internal Server Error", 500);
});

// Server starten
Deno.serve({ port }, app.fetch);
console.log(`Nebula läuft auf http://localhost:${port}`);


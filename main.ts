import { install } from "./install/install.ts"; // first
import './install/install-stacks.ts';
import { Hono, Context } from "hono";
import { serveStatic } from "https://deno.land/x/hono@v3.11.7/middleware.ts";
import { sessionMiddleware } from "./middleware/session.ts";
import { authMiddleware } from "./middleware/auth.ts";
import { getLogin, postLogin, getLogout } from "./modules/login/controller.ts";
import { logError } from "./utils/logger.ts";
import { exists } from "jsr:@std/fs/exists";

const modules = new Map();
Deno.readDirSync('./modules').filter((module) => module.isDirectory).forEach((module) => {
  modules.set(module.name, {
    path: `./modules/${module.name}`,    
  });
});

await install();
for (const [, module] of modules) {
  if (! await exists(module.path+'/install.ts')) continue;
  await import(module.path+'/install.ts').then((moduleInstall) => {
    moduleInstall.install?.();
  }).catch(console.error);
}

const port = Number(Deno.env.get('PORT')) || 4242;
const app = new Hono();

// Middleware
app.use('*', sessionMiddleware);
app.use('/public/*', serveStatic({ root: './' }));

// Ungeschützte Routen

await import('./modules/login2/routes.ts').then(({ pubApis, pubViews }) => {
  app.route(`/api/login2`, pubApis);
  app.route(`/login2`, pubViews);
}).catch(console.log);


app.get("/login", getLogin);
app.post("/login", postLogin);
app.get("/logout", getLogout);



// Auth Middleware für geschützte Routen
app.use('*', authMiddleware);

// redirect to dashboard
app.get(`/`, (c: Context) => c.redirect('/dashboard'));


for (const [name, module] of modules) {
  if (! await exists(module.path+'/routes.ts')) continue;
  await import(module.path+'/routes.ts').then(({ apiRoutes, viewRoutes }) => {
    apiRoutes && app.route(`/api/${name}`, apiRoutes);
    viewRoutes && app.route(`/${name}`, viewRoutes);
  }).catch(console.log);
}


// Error Handling
app.notFound((c) => c.text("Not Found", 404));
app.onError((err, c) => {
  logError("Server error: " + err.message, "Server", c, err);
  return c.text("Internal Server Error", 500);
});



// apis
app.get('/api', (c) => {
  const routes: string[] = [];
  if (Array.isArray(app.routes)) {
    app.routes.forEach((route) => {
      if (route.method === 'ALL') return;
      routes.push(`${route.path}  [${route.method.toUpperCase()}]`);
    });
  }
  // only routes that starts width /api
  const apiRoutes = routes.filter((route) => route.startsWith('/api')).sort();
  return c.json(apiRoutes);
});

// Server starten
Deno.serve({ port }, app.fetch);
console.log(`Nebula läuft auf http://localhost:${port}`);


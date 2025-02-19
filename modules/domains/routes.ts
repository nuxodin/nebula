import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth.ts";
import { getAllDomains, createDomain, deleteDomain, getDomainById } from "./controller.ts";
import { createFileRoutes } from "../files/routes.ts";
import { config } from "../../utils/config.ts";
import { renderTemplate } from "../../utils/template.ts";
import db from "../../utils/database.ts";

// Helper function for file route handling
const handleFileRoutes = (domain: { name: string }, originalPath: string, requestUrl: URL, c: any) => {
  const domainRoot = `${config.vhosts_root}/${domain.name}`;
  const fileRoutes = createFileRoutes({
    rootPath: domainRoot,
    title: `Files - ${domain.name}`
  });

  const url = new URL(requestUrl);
  url.pathname = originalPath;
  
  // Session-Cookie aus dem ursprünglichen Request übernehmen
  const headers = new Headers(c.req.raw.headers);
  const sessionCookie = c.req.cookie()?.sessionId;
  if (sessionCookie) {
    headers.set('Cookie', `sessionId=${sessionCookie}`);
  }
  
  const request = new Request(url, {
    ...c.req.raw,
    headers
  });
  
  const env = { ...c.env, session: c.get('session') };
  return fileRoutes.fetch(request, env);
};

// API Routes
const apiRoutes = new Hono();
apiRoutes.use(authMiddleware);

apiRoutes.get("/", getAllDomains);
apiRoutes.post("/", createDomain);
apiRoutes.delete("/:id", deleteDomain);
apiRoutes.get("/:id", getDomainById);

// Files API route handler
apiRoutes.all("/:id/files/*", async (c) => {
  const { id } = c.req.param();
  const domain = db.queryEntries("SELECT name FROM domains WHERE id = ?", [id])[0];
  
  if (!domain) {
    return c.json({ error: "Domain not found" }, 404);
  }

  const path = new URL(c.req.url).pathname.replace(`/api/domains/${id}/files`, "/api/files");
  return handleFileRoutes(domain, path, c.req.url, c);
});

// View Routes
const viewRoutes = new Hono();
viewRoutes.use(authMiddleware);

viewRoutes.get("/", async (c) => {
  const content = await Deno.readTextFile("./modules/domains/views/content.html");
  const scripts = await Deno.readTextFile("./modules/domains/views/scripts.html");
  return c.html(await renderTemplate("Domains", content, "", scripts));
});

viewRoutes.get("/:id", async (c) => {
  const content = await Deno.readTextFile("./modules/domains/views/detail.html");
  const scripts = await Deno.readTextFile("./modules/domains/views/detail-scripts.html");
  return c.html(await renderTemplate("Domain Details", content, "", scripts));
});

// Files route handler
viewRoutes.all("/:id/files/*", async (c) => {
  const { id } = c.req.param();
  const domain = db.queryEntries("SELECT name FROM domains WHERE id = ?", [id])[0];
  
  if (!domain) {
    return c.text("Domain not found", 404);
  }

  const path = new URL(c.req.url).pathname.replace(`/domains/${id}/files`, "") || "/";
  return handleFileRoutes(domain, path, c.req.url, c);
});

// Main files route
viewRoutes.get("/:id/files", async (c) => {
  const { id } = c.req.param();
  const domain = db.queryEntries("SELECT name FROM domains WHERE id = ?", [id])[0];
  
  if (!domain) {
    return c.text("Domain not found", 404);
  }

  return handleFileRoutes(domain, "/", c.req.url, c);
});

export { apiRoutes, viewRoutes };

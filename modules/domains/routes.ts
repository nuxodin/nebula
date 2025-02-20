import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth.ts";
import { getAllDomains, createDomain, deleteDomain, getDomainById } from "./controller.ts";
import { createFileRoutes } from "../files/routes.ts";
import { config } from "../../utils/config.ts";
import { renderTemplate } from "../../utils/template.ts";
import db from "../../utils/database.ts";

// Domain Files Handler erstellen
function createDomainFilesHandler(domain: { name: string }) {
  const domainRoot = `${config.vhosts_root}/${domain.name}`;
  return createFileRoutes({
    rootPath: domainRoot,
    title: `Files - ${domain.name}`
  });
}

// API Routes
const apiRoutes = new Hono();
apiRoutes.use(authMiddleware);

// Standard Domain-API-Routen
apiRoutes.get("/", getAllDomains);
apiRoutes.post("/", createDomain);
apiRoutes.delete("/:id", deleteDomain);
apiRoutes.get("/:id", getDomainById);

// Domain-Files API-Route
apiRoutes.all("/:id/files/*", async (c) => {
  const { id } = c.req.param();
  const domain = db.queryEntries("SELECT name FROM domains WHERE id = ?", [id])[0];
  
  if (!domain) {
    return c.json({ error: "Domain not found" }, 404);
  }

  const fileHandler = createDomainFilesHandler(domain);
  const path = c.req.path.replace(`/api/domains/${id}/files`, "/api/files");
  
  // Request mit angepasstem Pfad weiterleiten
  const url = new URL(c.req.url);
  url.pathname = path;
  
  return fileHandler.fetch(
    new Request(url, c.req.raw),
    { ...c.env, session: c.get('session') }
  );
});

// View Routes
const viewRoutes = new Hono();
viewRoutes.use(authMiddleware);

// Standard Domain-View-Routen
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

// Domain-Files View-Route - Diese Route muss VOR den anderen Files-Routen stehen
viewRoutes.get("/:id/files", async (c) => {
  const { id } = c.req.param();
  const domain = db.queryEntries("SELECT name FROM domains WHERE id = ?", [id])[0];
  
  if (!domain) {
    return c.text("Domain not found", 404);
  }

  const content = await Deno.readTextFile("./modules/files/views/files.html");
  const scripts = await Deno.readTextFile("./modules/files/views/files-scripts.html");
  
  // Füge die Konfiguration für den File Explorer hinzu
  const configScript = `<script>
    window.fileExplorerConfig = {
      rootPath: "${config.vhosts_root}/${domain.name}",
      title: "Files - ${domain.name}"
    };
  </script>`;

  return c.html(await renderTemplate(`Files - ${domain.name}`, content, "", configScript + scripts));
});

// Domain-Files View-Routen
viewRoutes.get("/:id/files/*", async (c) => {
  const { id } = c.req.param();
  const domain = db.queryEntries("SELECT name FROM domains WHERE id = ?", [id])[0];
  
  if (!domain) {
    return c.text("Domain not found", 404);
  }

  const content = await Deno.readTextFile("./modules/files/views/files.html");
  const scripts = await Deno.readTextFile("./modules/files/views/files-scripts.html");
  
  // Füge die Konfiguration für den File Explorer hinzu
  const configScript = `<script>
    window.fileExplorerConfig = {
      rootPath: "${config.vhosts_root}/${domain.name}",
      title: "Files - ${domain.name}"
    };
  </script>`;

  return c.html(await renderTemplate(`Files - ${domain.name}`, content, "", configScript + scripts));
});

// API und andere File-Operationen
viewRoutes.all("/:id/files/*", async (c) => {
  const { id } = c.req.param();
  const domain = db.queryEntries("SELECT name FROM domains WHERE id = ?", [id])[0];
  
  if (!domain) {
    return c.text("Domain not found", 404);
  }

  const fileHandler = createDomainFilesHandler(domain);
  const pathSegments = c.req.path.split('/files/');
  const relativePath = pathSegments[1] ? `/${pathSegments[1]}` : '/';
  
  // Request mit angepasstem Pfad weiterleiten
  const url = new URL(c.req.url);
  url.pathname = `/api/files${relativePath}`;
  
  return fileHandler.fetch(
    new Request(url, c.req.raw),
    { ...c.env, session: c.get('session') }
  );
});

export { apiRoutes, viewRoutes };

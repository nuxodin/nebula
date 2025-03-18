import { Hono } from "hono";
import { renderTemplate } from "../../utils/template.ts";
import { objToRoutes } from "../../utils/routes.ts";
import db from "../../utils/database.ts";
import { api } from './api.ts';
import { getFilesView } from '../files/controller.ts';


  

// API Routes  
const apiRoutes = new Hono();

apiRoutes.use('/:id/*', async (c, next) => {
  const { id } = c.req.param();
  const {name, owner_id} = db.queryEntries("SELECT name, owner_id FROM domains WHERE id = ?", [id])[0] ?? {};
  if (!name) return c.json({ error: "Domain not found" }, 404);
  c.set('domain', name);
  await next();
});

objToRoutes(apiRoutes, api);


// View Routes
const viewRoutes = new Hono();
viewRoutes.get("/", async (c) => {
  const content = await Deno.readTextFile("./modules/domains/views/content.html");
  const scripts = await Deno.readTextFile("./modules/domains/views/scripts.html");
  return c.html(await renderTemplate("Domains", content, "", scripts));
});

viewRoutes.get("/:id", async (c) => {
  const content = await Deno.readTextFile("./modules/domains/views/detail/content.html");
  const scripts = await Deno.readTextFile("./modules/domains/views/detail/scripts.html");
  return c.html(await renderTemplate(`Domain`, content, "", scripts));
});

viewRoutes.get("/:id/files", getFilesView);

export { apiRoutes, viewRoutes };

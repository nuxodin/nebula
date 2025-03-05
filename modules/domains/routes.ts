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
  const {name, owner_id} = db.queryEntries("SELECT name, owner_id FROM domains WHERE id = ?", [id])[0];
  if (!name) return c.json({ error: "Domain not found" }, 404);

  // const session = c.get('session');
  // const userId  = await session.get('userId');
  // const isAdmin = await session.get('isAdmin');
  // todo: check if user has access to domain
  // if (isAdmin || userId !== owner_id) return c.json({ error: "Access denied" }, 403);
  
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
  const { id } = c.req.param();
  const domain = db.queryEntries(`
      SELECT d.*, c.login as owner_name
      FROM domains d
      LEFT JOIN clients c ON d.owner_id = c.id
      WHERE d.id = ?
    `, [id])[0];
  if (!domain) return c.text("Domain not found", 404);
  const content = await Deno.readTextFile("./modules/domains/views/detail/content.html");
  const scripts = await Deno.readTextFile("./modules/domains/views/detail/scripts.html");
  return c.html(await renderTemplate(`Domain ${domain.name}`, content, "", scripts));
});

viewRoutes.get("/:id/files", getFilesView);

export { apiRoutes, viewRoutes };

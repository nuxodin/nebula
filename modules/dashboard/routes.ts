import { Hono } from "hono";
import { renderTemplate } from "../../utils/template.ts";
import { getDashboardStats } from "./controller.ts";
import { objToRoutes } from "../../utils/routes.ts";

// API Routes
const apiRoutes = new Hono();  

const api = {
  stats: getDashboardStats,
};

objToRoutes(apiRoutes, api);


// View Routes
const viewRoutes = new Hono();

viewRoutes.get("/", async (c) => {
  const content = await Deno.readTextFile("./modules/dashboard/views/content.html");
  const scripts = await Deno.readTextFile("./modules/dashboard/views/scripts.html");
  return c.html(await renderTemplate("Dashboard", content, "", scripts));
});

export { apiRoutes, viewRoutes };
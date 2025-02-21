import { Hono } from "hono";
import { renderTemplate } from "../../utils/template.ts";
import { getDashboardStats } from "./controller.ts";

// API Routes
const apiRoutes = new Hono();
apiRoutes.get("/stats", getDashboardStats);

// View Routes
const viewRoutes = new Hono();

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
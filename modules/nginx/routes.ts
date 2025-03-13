import { Hono, Context } from "hono";
import { renderTemplate } from "../../utils/template.ts";
import { objToRoutes } from "../../utils/routes.ts";
import { api } from "./controller.ts";

// API Routes
const apiRoutes = new Hono();
objToRoutes(apiRoutes, api);

// View Routes
const viewRoutes = new Hono();
viewRoutes.get("/", async (c: Context) => {
    const content = await Deno.readTextFile("./modules/nginx/views/content.html");
    const scripts = await Deno.readTextFile("./modules/nginx/views/scripts.html");
    return c.html(await renderTemplate("Nginx-Verwaltung", content, "", scripts));
});

export { apiRoutes, viewRoutes };

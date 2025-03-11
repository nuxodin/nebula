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
    const content = await Deno.readTextFile("./modules/apache/views/content.html");
    const scripts = await Deno.readTextFile("./modules/apache/views/scripts.html");
    return c.html(await renderTemplate("Apache-Verwaltung", content, "", scripts));
});

export { apiRoutes, viewRoutes };
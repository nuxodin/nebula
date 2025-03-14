import { Hono, Context } from "hono";
import { objToRoutes } from "../../utils/routes.ts";
import { renderTemplate } from "../../utils/template.ts";
import { api } from "./controller.ts";

// API Routes
const apiRoutes = new Hono();
objToRoutes(apiRoutes, api);

// View Routes
const viewRoutes = new Hono();
viewRoutes.get("/", async (c: Context) => {
    const content = await Deno.readTextFile("./modules/log-browser2/views/content.html");
    const scripts = await Deno.readTextFile("./modules/log-browser2/views/scripts.html");
    return c.html(await renderTemplate("Log Browser 2.0", content, "", scripts));
});

export { apiRoutes, viewRoutes };
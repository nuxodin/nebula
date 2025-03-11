import { Hono, Context } from "hono";
import { objToRoutes } from "../../utils/routes.ts";
import { api } from "./controller.ts";
import { renderTemplate } from "../../utils/template.ts";


// API Routes
const apiRoutes = new Hono();
objToRoutes(apiRoutes, api);

// View Routes
const viewRoutes = new Hono();
viewRoutes.get("/", async (c: Context) => {
    const content = await Deno.readTextFile("./modules/packages/views/content.html");
    const scripts = await Deno.readTextFile("./modules/packages/views/scripts.html");
    return c.html(await renderTemplate("System Packages", content, "", scripts));
});

export { apiRoutes, viewRoutes };
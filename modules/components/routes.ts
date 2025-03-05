import { Hono } from "hono";
import { objToRoutes } from "../../utils/routes.ts";
import { api } from "./api.ts";
import { Context } from "hono";
import { renderTemplate } from "../../utils/template.ts";


// API Routes
const apiRoutes = new Hono();
objToRoutes(apiRoutes, api);

// View Routes
const viewRoutes = new Hono();
viewRoutes.get("/", async (c: Context) => {
    const content = await Deno.readTextFile("./modules/components/views/content.html");
    const scripts = await Deno.readTextFile("./modules/components/views/scripts.html");
    return c.html(await renderTemplate("System Komponenten", content, "", scripts));
});

export { apiRoutes, viewRoutes };
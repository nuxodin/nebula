import { Hono } from "hono";
import { objToRoutes } from "../../utils/routes.ts";
import { renderTemplate } from "../../utils/template.ts";
import { api } from "./controller.ts";

// API Routes
const apiRoutes = new Hono();
objToRoutes(apiRoutes, api);

// View Routes
const viewRoutes = new Hono();
viewRoutes.get("/", async (c) => {
    const content = await Deno.readTextFile("./modules/lets-encrypt/views/content.html");
    const scripts = await Deno.readTextFile("./modules/lets-encrypt/views/scripts.html");
    return c.html(await renderTemplate("Let's Encrypt", content, "", scripts));
});

export { apiRoutes, viewRoutes };
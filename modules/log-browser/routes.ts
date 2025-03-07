import { Hono } from "hono";
import { objToRoutes } from "../../utils/routes.ts";
import { renderTemplate } from "../../utils/template.ts";
import { api } from "./controller.ts";

// API Routes
const apiRoutes = new Hono();
objToRoutes(apiRoutes, api);

// View Routes

// View Controller
const getLogBrowserView = async (c: Context) => {
    const content = await Deno.readTextFile("./modules/log-browser/views/content.html");
    const scripts = await Deno.readTextFile("./modules/log-browser/views/scripts.html");
    return c.html(await renderTemplate("Log Browser", content, "", scripts));
};

const viewRoutes = new Hono();
viewRoutes.get("/", getLogBrowserView);

export { apiRoutes, viewRoutes };
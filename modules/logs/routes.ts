import { Hono } from "hono";
import { getAllLogs } from "./controller.ts";
import { renderTemplate } from "../../utils/template.ts";

// API Routes
const apiRoutes = new Hono();
apiRoutes.get("/", getAllLogs);

// View Routes
const viewRoutes = new Hono();
viewRoutes.get("/", async (c) => {
    const content = await Deno.readTextFile("./modules/logs/views/content.html");
    const scripts = await Deno.readTextFile("./modules/logs/views/scripts.html");
    return c.html(await renderTemplate("Logs", content, "", scripts));
});

export { apiRoutes, viewRoutes };

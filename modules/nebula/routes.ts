import { Hono } from "hono";
import { renderTemplate } from "../../utils/template.ts";
import { getSystemInfo, restart } from "./controller.ts";
import { objToRoutes } from "../../utils/routes.ts";
import { runtimes } from "../../utils/runtime.ts";

const apiRoutes = new Hono();

const api = {
    info: getSystemInfo,
    restart: {
        post: restart,
    },
    kill: {
        post: () => {
            setTimeout(() => {
                Deno.exit(0);
            }, 100);
            return { success: true, message: 'Shutting down...' };
        }        
    },
    runtimes: {
        get: () => {
            return Object.keys(runtimes);
        }
    },
};

objToRoutes(apiRoutes, api);

const viewRoutes = new Hono();

viewRoutes.get("/", async (c) => {
    const content = await Deno.readTextFile("./modules/nebula/views/content.html");
    const scripts = await Deno.readTextFile("./modules/nebula/views/scripts.html");
    return c.html(await renderTemplate("Nebula Info", content, "", scripts));
});

export { apiRoutes, viewRoutes };

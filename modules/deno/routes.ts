import { Hono, Context } from "hono";
import { objToRoutes } from "../../utils/routes.ts";
import { renderTemplate } from "../../utils/template.ts";
import { api } from "./controller.ts";

const apiRoutes = new Hono();
objToRoutes(apiRoutes, api);


// View Controller
const viewRoutes = new Hono();
export const getDenoView = async (c: Context) => {
    const content = await Deno.readTextFile("./modules/deno/views/content.html");
    const scripts = await Deno.readTextFile("./modules/deno/views/scripts.html");
    return c.html(await renderTemplate("Deno Konfiguration", content, "", scripts));
};
viewRoutes.get("/", getDenoView);

export { apiRoutes, viewRoutes };
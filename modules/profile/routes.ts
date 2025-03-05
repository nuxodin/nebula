import { Hono } from "hono";
import { renderTemplate } from "../../utils/template.ts";
import { objToRoutes } from "../../utils/routes.ts";
import db from "../../utils/database.ts";
import { api } from './api.ts';


  

// API Routes  
const apiRoutes = new Hono();


objToRoutes(apiRoutes, api);


// View Routes
const viewRoutes = new Hono();
viewRoutes.get("/", async (c) => {
    const content = await Deno.readTextFile("./modules/profile/views/content.html");
    const scripts = await Deno.readTextFile("./modules/profile/views/scripts.html");
    return c.html(await renderTemplate("Mein Profil", content, "", scripts));
});


export { apiRoutes, viewRoutes };




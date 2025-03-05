import { Hono } from "hono";
import { renderTemplate } from "../../utils/template.ts";
import { objToRoutes } from "../../utils/routes.ts";
import { api, getUserView, getUserDetailView } from "./controller.ts";

// API Routes
const apiRoutes = new Hono();
objToRoutes(apiRoutes, api);

// View Routes
const viewRoutes = new Hono();
viewRoutes.get("/", getUserView);
viewRoutes.get("/:id", getUserDetailView);

export { apiRoutes, viewRoutes };

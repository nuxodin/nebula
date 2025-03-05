import { Hono } from "hono";
import { objToRoutes } from "../../utils/routes.ts";
import { api, getDatabaseServersView, getDbServerDetailView } from "./controller.ts";

// API Routes
const apiRoutes = new Hono();
objToRoutes(apiRoutes, api);

// View Routes
const viewRoutes = new Hono();
viewRoutes.get("/", getDatabaseServersView);
viewRoutes.get("/:id", getDbServerDetailView);

export { apiRoutes, viewRoutes };
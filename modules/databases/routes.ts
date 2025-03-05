import { Hono } from "hono";
import { objToRoutes } from "../../utils/routes.ts";
import { getDatabaseView, getDatabaseDetailView } from "./controller.ts";
import { api } from "./api.ts";

// API Routes
const apiRoutes = new Hono();
objToRoutes(apiRoutes, api);

// View Routes
const viewRoutes = new Hono();
viewRoutes.get("/", getDatabaseView);
viewRoutes.get("/:id", getDatabaseDetailView);

export { apiRoutes, viewRoutes };
import { Hono } from "hono";
import { api, getMailView, getMailDetailView } from "./controller.ts";
import { objToRoutes } from "../../utils/routes.ts";

// API Routes
const apiRoutes = new Hono();
objToRoutes(apiRoutes, api);

// View Routes
const viewRoutes = new Hono();
viewRoutes.get("/", getMailView);
viewRoutes.get("/:id", getMailDetailView);

export { apiRoutes, viewRoutes };
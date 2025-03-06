import { Hono } from "hono";
import { objToRoutes } from "../../utils/routes.ts";
import { api, getLogBrowserView } from "./controller.ts";

// API Routes
const apiRoutes = new Hono();
objToRoutes(apiRoutes, api);

// View Routes
const viewRoutes = new Hono();
viewRoutes.get("/", getLogBrowserView);

export { apiRoutes, viewRoutes };
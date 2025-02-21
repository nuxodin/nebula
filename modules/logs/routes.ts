import { Hono } from "hono";
import { getAllLogs, getLogsView } from "./controller.ts";

// API Routes
const apiRoutes = new Hono();
apiRoutes.get("/", getAllLogs);

// View Routes
const viewRoutes = new Hono();
viewRoutes.get("/", getLogsView);

export { apiRoutes, viewRoutes };

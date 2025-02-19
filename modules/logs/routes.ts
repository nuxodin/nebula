import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth.ts";
import { getAllLogs, getLogsView } from "./controller.ts";

// API Routes
const apiRoutes = new Hono();
apiRoutes.use(authMiddleware);

apiRoutes.get("/", getAllLogs);

// View Routes
const viewRoutes = new Hono();
viewRoutes.use(authMiddleware);

viewRoutes.get("/", getLogsView);

export { apiRoutes, viewRoutes };

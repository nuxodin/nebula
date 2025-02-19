import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth.ts";
import { getSettings, updateSettings } from "./controller.ts";

const settingsRoutes = new Hono();

settingsRoutes.use(authMiddleware);
settingsRoutes.get("/", getSettings);
settingsRoutes.post("/", updateSettings);

export default settingsRoutes;
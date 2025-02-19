import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth.ts";
import { createHosting, getAllHosting, getHostingById, updateHosting, deleteHosting } from "./hosting.ts";

const hostingRoutes = new Hono();

hostingRoutes.use(authMiddleware);

hostingRoutes.post("/", createHosting);
hostingRoutes.get("/", getAllHosting);
hostingRoutes.get("/:id", getHostingById);
hostingRoutes.put("/:id", updateHosting);
hostingRoutes.delete("/:id", deleteHosting);

export default hostingRoutes;
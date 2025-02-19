import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth.ts";
import { createDatabase, getAllDatabases, getDatabaseById, updateDatabase, deleteDatabase } from "./databases.ts";

const databaseRoutes = new Hono();

databaseRoutes.use(authMiddleware);

databaseRoutes.post("/", createDatabase);
databaseRoutes.get("/", getAllDatabases);
databaseRoutes.get("/:id", getDatabaseById);
databaseRoutes.put("/:id", updateDatabase);
databaseRoutes.delete("/:id", deleteDatabase);

export default databaseRoutes;
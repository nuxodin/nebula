import { Hono } from "hono";
import { getAllUsers, registerUser, deleteUser, getUserById, getUserView } from "./controller.ts";

// API Routes
const apiRoutes = new Hono();
apiRoutes.get("/", getAllUsers);
apiRoutes.post("/", registerUser);
apiRoutes.delete("/:id", deleteUser);
apiRoutes.get("/:id", getUserById);

// View Routes
const viewRoutes = new Hono();
viewRoutes.get("/", getUserView);
viewRoutes.get("/:id", getUserById);

export { apiRoutes, viewRoutes };

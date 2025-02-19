import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth.ts";
import { getAllUsers, registerUser, deleteUser, getUserById, getUserView } from "./controller.ts";

// API Routes
const apiRoutes = new Hono();
apiRoutes.use(authMiddleware);

apiRoutes.get("/", getAllUsers);
apiRoutes.post("/", registerUser);
apiRoutes.delete("/:id", deleteUser);
apiRoutes.get("/:id", getUserById);

// View Routes
const viewRoutes = new Hono();
viewRoutes.use(authMiddleware);

viewRoutes.get("/", getUserView);
viewRoutes.get("/:id", getUserById);

export { apiRoutes, viewRoutes };

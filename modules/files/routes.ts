import { Hono } from "hono";
import { objToRoutes } from "../../utils/routes.ts";
import { getFilesView, api } from "./controller.ts";


const apiRoutes = new Hono();
objToRoutes(apiRoutes, api);

// View Routes
const viewRoutes = new Hono();
viewRoutes.get("/", async (c) => {
  return getFilesView(c, { rootPath: "/" });
});

export { apiRoutes, viewRoutes };
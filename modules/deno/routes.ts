import { Hono } from "hono";
import { objToRoutes } from "../../utils/routes.ts";
import { api, getDenoView } from "./controller.ts";

const apiRoutes = new Hono();
objToRoutes(apiRoutes, api);

const viewRoutes = new Hono();
viewRoutes.get("/", getDenoView);

export { apiRoutes, viewRoutes };
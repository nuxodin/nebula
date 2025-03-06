import { Hono } from "hono";
import { objToRoutes } from "../../utils/routes.ts";
import { api, getLoginView } from "./controller.ts";

// API Routes
const pubApis = new Hono();
objToRoutes(pubApis, api);

// View Routes
const pubViews = new Hono();
pubViews.get("/", getLoginView);

export { 
    pubApis,
    pubViews
};

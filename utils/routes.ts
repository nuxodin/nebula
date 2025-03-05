import { Hono } from "hono";
import { logError } from "./logger.ts";


// API routes
export function fnToApi(fn: Function) {
  return async (c: any) => {
    try {
      const data = await fn(c);
      return c.json(data);
    } catch (error) {
      logError(c.req.url, "", c, error);
      return c.json({ error: error.message }, 500);
    }
  };
}
export function objToRoutes(routes: Hono, obj, parentPath = "/") {
  for (const key in obj) {
    const fn = obj[key];
    const currentPath = parentPath === "/" ? `/${key}` : `${parentPath}/${key}`;
    if (typeof fn === 'object') {
      objToRoutes(routes, fn, currentPath);
      continue;
    }
    else if (key === 'get') routes.get(parentPath, fnToApi(fn));
    else if (key === 'post') routes.post(parentPath, fnToApi(fn));
    else if (key === 'delete') routes.delete(parentPath, fnToApi(fn));
    else if (key === 'put') routes.put(parentPath, fnToApi(fn));
    else routes.get(currentPath, fnToApi(fn));
  }
}
import { Hono } from "hono";
import { createDatabase, deleteDatabase, getDatabaseStats, changePassword } from "./databases.ts";

const databaseRoutes = new Hono();

databaseRoutes.post("/", async (c) => {  
  const body = await c.req.json();
  const result = await createDatabase(body);
  return c.json(result);
});

databaseRoutes.get("/:id/stats", async (c) => {
  const id = Number(c.req.param("id"));
  const stats = await getDatabaseStats(id);
  return c.json(stats);
});

databaseRoutes.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const result = await deleteDatabase(id);
  return c.json(result);
});

databaseRoutes.post("/:id/password", async (c) => {
  const id = Number(c.req.param("id"));
  const { password } = await c.req.json();
  const result = await changePassword(id, password);
  return c.json(result);
});

export default databaseRoutes;
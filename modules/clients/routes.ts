import { Hono } from "hono";
import { getAllClients, createClient, deleteClient, getClientById, getCurrentUser } from "./clients.ts";

const clientRoutes = new Hono();

clientRoutes.get("/me", getCurrentUser);
clientRoutes.get("/", getAllClients);
clientRoutes.post("/", createClient);
clientRoutes.delete("/:id", deleteClient);
clientRoutes.get("/:id", getClientById);

export default clientRoutes;
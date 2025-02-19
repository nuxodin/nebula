import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth.ts";
import { createMailAccount, getAllMailAccounts, getMailAccountById, updateMailAccount, deleteMailAccount } from "./mail.ts";

const mailRoutes = new Hono();

mailRoutes.use(authMiddleware);

mailRoutes.post("/", createMailAccount);
mailRoutes.get("/", getAllMailAccounts);
mailRoutes.get("/:id", getMailAccountById);
mailRoutes.put("/:id", updateMailAccount);
mailRoutes.delete("/:id", deleteMailAccount);

export default mailRoutes;
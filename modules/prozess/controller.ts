import { getProcessList, killProcess } from "./processes.ts";
import { Context } from "hono";

export const api = {
    get: async () => {
        return await getProcessList();
    },
    ":id": {
        delete: async (c: Context) => {
            const { id } = c.req.param();
            return await killProcess(Number(id));
        }
    }
};
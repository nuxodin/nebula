import { getProcessList, ProcessInfo } from "./processes.ts";

export const api = {
    "list": async () => {
        return await getProcessList();
    }
};
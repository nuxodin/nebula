import { isCommandAvailable } from "../../utils/command.ts";

let pm_cache = '';
export async function packetManager(){
    if (!pm_cache) {
        pm_cache = await isCommandAvailable("apt") ? "apt" : await isCommandAvailable("yum") ? "yum" : await isCommandAvailable("dnf") ? "dnf" : "apt";
        console.log("packetManager: " + pm_cache);
    }
    return pm_cache;
}

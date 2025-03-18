import { run, installPackages, startService, stopService, restartService, reloadService, status } from "../../utils/command.ts";
import { logInfo } from "../../utils/logger.ts";
import { LogParser } from '../../utils/LogParser.js';


// API Controller
export const api = {
    install: {
        post: async () => {
            await installPackages(["nginx"]);
            return true;
        }
    },
    config: {
        post: async () => {
            // vhosts-Verzeichnis erstellen
            await run("mkdir", ["-p", "/etc/nginx/nebula-vhosts"], { sudo: true });
            
            // Konfiguration in nginx.conf überprüfen und anpassen
            const configPath = "/etc/nginx/nginx.conf";
            const includeDirective = "include /etc/nginx/nebula-vhosts/*.conf;";
            const confContent = await Deno.readTextFile(configPath);
            if (!confContent.includes(includeDirective)) {
                await run("sh", ["-c", `echo '${includeDirective}' >> ${configPath}`], { sudo: true });
                logInfo("Nginx vhosts Include-Direktive hinzugefügt", "Nginx");
            }
            return true;
        }
    },
    start: {
        post: async () => {
            await startService("nginx");
            return true;
        }
    },
    stop: {
        post: async () => {
            await stopService("nginx");
            return true;
        }
    },
    restart: {
        post: async () => {
            await restartService("nginx");
            return true;
        }
    },
    reload: {
        post: async () => {
            await reloadService("nginx");
            return true;
        }
    },
    troubleshooting: async () => {

        const errorsParser = new LogParser("/var/log/nginx/error.log")
        const errorsLogs = await errorsParser.getEntries({order: "desc", limit: 7});
        const accessParser = new LogParser("/var/log/nginx/access.log");
        const accessLogs = await accessParser.getEntries({order: "desc", limit: 7});

        const enabled = await run("systemctl", ["is-enabled", "nginx"], { sudo: true }).then(res => res.code === 0);
        const errorLog = errorsLogs;
        const accessLog = accessLogs;
        const configCheck = await run("nginx", ["-t"], { sudo: true });

        return {
            status: await status("nginx"),
            enabled,
            errorLog,
            accessLog,
            configCheck
        };
    },
    fullstatus: async () => {
        const result = await run("nginx", ["-V"], { sudo: true });
        if (result.code !== 0) {
            throw new Error(result.stderr);
        }
        return result.stdout;
    },
};


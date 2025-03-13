import { run, stopService, restartService, reloadService, status } from "../../utils/command.ts";
import { logInfo } from "../../utils/logger.ts";
import { LogParser } from '../../utils/LogParser.ts';


// API Controller
export const api = {
    modules: async () => {
        const result = await run("apache2ctl", ["-M"], { sudo: true, throw: true });
        
        // Alle geladenen (aktivierten) Module extrahieren
        const enabledModules = new Set(result.stdout.split('\n').map(line => {
            return line.trim().split(' ')[0].trim().replace('_module', '');
        }));    

        // Verfügbare Module aus dem mods-available-Verzeichnis durchgehen
        const availableModulesDir = "/etc/apache2/mods-available/";
        const availableModuleFiles = await run("ls", [availableModulesDir]);
        if (availableModuleFiles.code !== 0) throw new Error(availableModuleFiles.stderr);
        const files = availableModuleFiles.stdout.split('\n');
        const availableModules = new Set(files.map(file => {
            return file.replace(".load", "").replace(".conf", "").trim();
        }));
        
        const modules = [];

        for (const module of availableModules) {
            if (module === "") continue;
            const enabled = enabledModules.has(module);
            modules.push({
                name: module,
                enabled,
                available: true
            });
        }
        
        return modules;
    },
    'module/:name': {
        enable: {
            post: async (c) => {
                const { name } = c.req.param();
                await run("a2enmod", [name], { sudo: true });
                reloadService("apache2");
                logInfo(`Apache-Modul ${name} aktiviert`, "Apache");
                return { success: true };
            }
        },
        disable: {
            post: async (c) => {
                const { name } = c.req.param();
                await run("a2dismod", [name], { sudo: true });
                reloadService("apache2");
                //await run("systemctl", ["reload", "apache2"], { sudo: true });
                logInfo(`Apache-Modul ${name} deaktiviert`, "Apache");
                return { success: true };
            }
        }
    },

    status: async () => {
        return await status("apache2");
    },
    config: {
        post: async () => {
            // Benötigte Module aktivieren
            const requiredModules = ["proxy", "proxy_http", "proxy_fcgi", "rewrite", "headers"];
            for (const mod of requiredModules) {
                await run("a2enmod", [mod], { sudo: true });
            }

            // vhosts-Verzeichnis erstellen
            await run("mkdir", ["-p", "/etc/apache2/nebula-vhosts"], { sudo: true });
            
            // Konfiguration in apache2.conf überprüfen und anpassen
            const configPath = "/etc/apache2/apache2.conf";
            const includeDirective = "\n\nIncludeOptional /etc/apache2/nebula-vhosts/*.conf";
            const confContent = await Deno.readTextFile(configPath);
            if (!confContent.includes(includeDirective)) {
                await run("sh", ["-c", `echo '${includeDirective}' >> ${configPath}`], { sudo: true });
                logInfo("Apache vhosts Include-Direktive hinzugefügt", "Apache");
            }
            return true;
        }
    },
    start: {
        post: async () => {
            // await startService("apache2");
            // return true;
            const result = await run("apache2ctl", ["start"], { sudo: true });
            if (result.code !== 0) throw new Error(result.stderr);
        }
    },
    stop: {
        post: async () => {
            await stopService("apache2");
            return true;
        }
    },
    restart: {
        post: async () => {
            await restartService("apache2");
            return true;
        }
    },
    gacefulRestart: {
        post: async () => {
            await run("apachectl", ["graceful"], { sudo: true });
            return true;
        }
    },
    
    reload: {
        post: async () => {
            await reloadService("apache2");
            return true;
        }
    },

    troubleshooting: async () => {
        const status = await api.status();
        const enabled = await run("systemctl", ["is-enabled", "apache2"], { sudo: true }).then(res => res.code === 0);
        const errorsParser = new LogParser("/var/log/apache2/error.log");
        const errorsLogs = await errorsParser.getEntries({order: "desc", limit: 7});
        const accessParser = new LogParser("/var/log/apache2/access.log");
        const accessLogs = await accessParser.getEntries({order: "desc", limit: 7});
        const errorLog = errorsLogs;
        const accessLog = accessLogs;
        const configCheck = await run("apachectl", ["configtest"], { sudo: true });
        return {
            status,
            enabled,
            errorLog,
            accessLog,
            configCheck
        };
    },

    fullstatus: async () => {
        const result = await run("apachectl", ["fullstatus"], { sudo: true });
        if (result.code !== 0) {
            throw new Error(result.stderr);
        }
        return result.stdout;
    },

};
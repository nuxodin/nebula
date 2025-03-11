import { run, startService, stopService, reloadService, status } from "../../utils/command.ts";
import { logInfo } from "../../utils/logger.ts";
import { xinstall } from "./install.ts";


interface ApacheModule {
    name: string;
    enabled: boolean;
    available: boolean;
}

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
console.log(module);
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

    start: {
        post: async () => {
            await xinstall();
            await startService("apache2");
        }
    },

    stop: {
        post: async () => {
            await stopService("apache2");
        }
    }
};
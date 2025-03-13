import { run } from "../../utils/command.ts";
import { logInfo } from "../../utils/logger.ts";
import { startService, enableService, reloadService, installPackages } from "../../utils/command.ts";

export async function xinstall(): Promise<boolean> {
    await installPackages(["nginx"]);

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

    await startService("nginx");
    await enableService("nginx"); // Enable the service
    await reloadService("nginx");
    
    logInfo("Nginx wurde erfolgreich installiert und konfiguriert", "Nginx");
}

import { run } from "../../utils/command.ts";
import { logInfo } from "../../utils/logger.ts";
import { startService, enableService, reloadService, installPackages } from "../../utils/command.ts";

export async function xinstall(): Promise<boolean> {
    await installPackages(["apache2"]);

    // Benötigte Module aktivieren
    const requiredModules = ["proxy", "proxy_http", "proxy_fcgi", "rewrite", "headers"];
    for (const mod of requiredModules) {
        await run("a2enmod", [mod], { sudo: true });
    }

    // vhosts-Verzeichnis erstellen
    await run("mkdir", ["-p", "/etc/apache2/nebula-vhosts"], { sudo: true });
    
    // Konfiguration in apache2.conf überprüfen und anpassen
    const configPath = "/etc/apache2/apache2.conf";
    const includeDirective = "IncludeOptional /etc/apache2/nebula-vhosts/*.conf";
    const confContent = await Deno.readTextFile(configPath);
    if (!confContent.includes(includeDirective)) {
        await run("sh", ["-c", `echo '${includeDirective}' >> ${configPath}`], { sudo: true });
        logInfo("Apache vhosts Include-Direktive hinzugefügt", "Apache");
    }

    await startService("apache2");
    //await enableService("apache2");
    await reloadService("apache2");
    
    logInfo("Apache wurde erfolgreich installiert und konfiguriert", "Apache");
}
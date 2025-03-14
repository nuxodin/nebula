import { ensureDir } from "https://deno.land/std/fs/mod.ts";
import { config } from '../../utils/config.ts';

// Konfiguration für Verzeichnisse
const nginxRoot = '/etc/nginx';
const vhostsRoot = '/var/www/vhosts';
const configRoot = '/etc/nginx/nebula.conf.d';  // Angepasster Pfad für Nebula

// Sicherstellen, dass Verzeichnisse existieren
export const install = async () => { // todo: ich glbaue das braucht es
    await ensureDir(`${nginxRoot}/conf.d`);
    await ensureDir(`${configRoot}/vhosts`);
    const nebulaNginxConf = 
        '# Automatisch generierte Nebula-Nginx-Konfiguration\n'+
        'include ' + configRoot + '/*.conf;';
    await Deno.writeTextFile(`${nginxRoot}/conf.d/zz010_nebula_nginx.conf`, nebulaNginxConf);
};

// // Domain-Konfiguration erstellen (Automatisch generiert, keine benutzerbearbeitbare Konfiguration)
// const createDomainNginxConfig = (domain: string) => {
//     const domainConfigFolder = `${vhostsRoot}/system/${domain}/conf/`;
//     const domainNginxConfigFile = `${domainConfigFolder}last_nginx.conf`;  // Diese Konfiguration wird automatisch erstellt

//     // Erstelle Domain-Konfiguration
//     const nginxConfig = `
//     server {
//         listen 80;
//         server_name ${domain} www.${domain} ${domain}.preview.${config.hostname};

//         root /var/www/vhosts/${domain}/httpdocs;

//         location / {
//             try_files $uri $uri/ =404;
//         }
//     }
//     `;

//     // Sicherstellen, dass Verzeichnis existiert und Konfiguration schreiben
//     ensureDir(domainConfigFolder);
//     Deno.writeTextFile(domainNginxConfigFile, nginxConfig);

//     // Symlinks für die Domain-Konfiguration erstellen (nicht benutzerbearbeitbar)
//     const siteAvailablePath = `${nginxRoot}/sites-available/${domain}.conf`;
//     Deno.symlinkSync(domainNginxConfigFile, siteAvailablePath);

//     const siteEnabledPath = `${nginxRoot}/sites-enabled/${domain}.conf`;
//     Deno.symlinkSync(siteAvailablePath, siteEnabledPath);

//     console.log(`Automatisch generierte Nginx-Konfiguration für ${domain} erstellt und aktiviert.`);
// };


// import { run } from "../../utils/command.ts";
// import { logInfo } from "../../utils/logger.ts";
// import { startService, enableService, reloadService, installPackages } from "../../utils/command.ts";

// export async function xinstall(): Promise<boolean> {
//     await installPackages(["nginx"]);

//     // vhosts-Verzeichnis erstellen
//     await run("mkdir", ["-p", "/etc/nginx/nebula-vhosts"], { sudo: true });
    
//     // Konfiguration in nginx.conf überprüfen und anpassen
//     const configPath = "/etc/nginx/nginx.conf";
//     const includeDirective = "include /etc/nginx/nebula-vhosts/*.conf;";
//     const confContent = await Deno.readTextFile(configPath);
//     if (!confContent.includes(includeDirective)) {
//         await run("sh", ["-c", `echo '${includeDirective}' >> ${configPath}`], { sudo: true });
//         logInfo("Nginx vhosts Include-Direktive hinzugefügt", "Nginx");
//     }

//     await startService("nginx");
//     await enableService("nginx"); // Enable the service
//     await reloadService("nginx");
    
//     logInfo("Nginx wurde erfolgreich installiert und konfiguriert", "Nginx");
// }

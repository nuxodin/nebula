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

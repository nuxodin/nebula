import { join } from "https://deno.land/std/path/mod.ts";
import { ensureDir } from "https://deno.land/std/fs/mod.ts";
import { config } from "../../utils/config.ts";
import { logInfo, logError } from "../../utils/logger.ts";
import db from "../../utils/database.ts";

// Server-Pfade Konfiguration
const nginxRoot = '/etc/nginx';
const vhostsRoot = config.vhosts_root || '/var/www/vhosts';
const sitesAvailablePath = join(nginxRoot, 'sites-available');
const sitesEnabledPath = join(nginxRoot, 'sites-enabled');

interface WebServerConfig {
  nginx: string;
  apache: string;
}

/**
 * Generiert Webserver-Konfigurationen basierend auf der ausgewählten Runtime
 */
export async function generateWebserverConfig(domainId: number): Promise<WebServerConfig | null> {
  try {
    // Domain-Informationen aus der Datenbank abrufen
    const domain = db.queryEntries(`SELECT * FROM domains WHERE id = ?`, [domainId])[0];

    if (!domain) {
      logError(`Domain mit ID ${domainId} nicht gefunden`, "WebserverConfig");
      return null;
    }

    // Pfade für die Domain
    const domainPath = join(vhostsRoot, domain.name);
    const httpdocsPath = join(domainPath, "httpdocs");
    const confPath = join(domainPath, "conf");
    const logsPath = join(domainPath, "logs");

    // Verzeichnisse erstellen
    await Promise.all([
      ensureDir(confPath),
      ensureDir(logsPath)
    ]);

    // Konfigurationen generieren
    const configs = getConfigForRuntime(domain.name, domain.runtime, domain.id, httpdocsPath);

    // Konfigurationsdateien speichern
    await Promise.all([
      Deno.writeTextFile(join(confPath, "nginx.conf"), configs.nginx),
      Deno.writeTextFile(join(confPath, "apache.conf"), configs.apache)
    ]);

    // Symlinks für Nginx erstellen (nur unter Linux/Mac)
    if (Deno.build.os !== "windows") {
      await createNginxSymlinks(domain.name, confPath);
    }

    logInfo(`Webserver-Konfigurationen für ${domain.name} generiert`, "WebserverConfig");
    return configs;
  } catch (error) {
    logError(`Fehler bei der Generierung der Webserver-Konfigurationen: ${error.message}`, "WebserverConfig");
    return null;
  }
}

/**
 * Erstellt Nginx Symlinks für eine Domain
 */
async function createNginxSymlinks(domainName: string, confPath: string): Promise<void> {
  try {
    const nginxAvailablePath = join(sitesAvailablePath, `${domainName}.conf`);
    const nginxEnabledPath = join(sitesEnabledPath, `${domainName}.conf`);

    // Bestehende Symlinks entfernen (falls vorhanden)
    for (const path of [nginxAvailablePath, nginxEnabledPath]) {
      try {
        await Deno.remove(path);
      } catch {
        // Ignorieren wenn die Datei nicht existiert
      }
    }

    // Neue Symlinks erstellen
    await Deno.symlink(join(confPath, "nginx.conf"), nginxAvailablePath);
    await Deno.symlink(nginxAvailablePath, nginxEnabledPath);
    
    logInfo(`Symlinks für ${domainName} erstellt`, "WebserverConfig");
  } catch (error) {
    logError(`Fehler beim Erstellen der Symlinks: ${error.message}`, "WebserverConfig");
  }
}

/**
 * Generiert Webserver-Konfigurationen basierend auf der Runtime
 */
function getConfigForRuntime(
  domainName: string, 
  runtime: string,
  domainId: number,
  documentRoot: string
): WebServerConfig {
  // Gemeinsame Konfigurationswerte
  const serverNames = `${domainName} www.${domainName} ${domainName}.preview.${config.hostname}`;
  const logsPath = join(vhostsRoot, domainName, "logs");
  const accessLog = join(logsPath, "access.log");
  const errorLog = join(logsPath, "error.log");
  
  // Security Headers
  const nginxSecurityHeaders = 
    '    add_header X-Frame-Options "SAMEORIGIN";\n' +
    '    add_header X-XSS-Protection "1; mode=block";\n' +
    '    add_header X-Content-Type-Options "nosniff";';
  
  const apacheSecurityHeaders = 
    '    Header always set X-Frame-Options "SAMEORIGIN"\n' +
    '    Header always set X-XSS-Protection "1; mode=block"\n' +
    '    Header always set X-Content-Type-Options "nosniff"';
    
  if (runtime === 'deno') {
    // Deno-spezifische Konfiguration
    const denoPort = 3000 + domainId;
    return {
      nginx: 
        'server {\n' +
        '    listen 80;\n' +
        '    server_name ' + serverNames + ';\n' +
        '    \n' +
        '    access_log ' + accessLog + ';\n' +
        '    error_log ' + errorLog + ';\n' +
        '\n' +
        '    location / {\n' +
        '        proxy_pass http://127.0.0.1:' + denoPort + ';\n' +
        '        proxy_http_version 1.1;\n' +
        '        proxy_set_header Upgrade $http_upgrade;\n' +
        '        proxy_set_header Connection "upgrade";\n' +
        '        proxy_set_header Host $host;\n' +
        '        proxy_set_header X-Real-IP $remote_addr;\n' +
        '        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n' +
        '        proxy_set_header X-Forwarded-Proto $scheme;\n' +
        '        proxy_cache_bypass $http_upgrade;\n' +
        '    }\n' +
        '    ' + nginxSecurityHeaders + '\n' +
        '}',
      apache: 
        '<VirtualHost *:80>\n' +
        '    ServerName ' + domainName + '\n' +
        '    ServerAlias www.' + domainName + ' ' + domainName + '.preview.' + config.hostname + '\n' +
        '    DocumentRoot "' + documentRoot + '"\n' +
        '    \n' +
        '    CustomLog "' + accessLog + '" combined\n' +
        '    ErrorLog "' + errorLog + '"\n' +
        '    \n' +
        '    ProxyPass / http://127.0.0.1:' + denoPort + '/\n' +
        '    ProxyPassReverse / http://127.0.0.1:' + denoPort + '/\n' +
        '    \n' +
        '    <Directory "' + documentRoot + '">\n' +
        '        Options Indexes FollowSymLinks\n' +
        '        AllowOverride All\n' +
        '        Require all granted\n' +
        '    </Directory>\n' +
        '    ' + apacheSecurityHeaders + '\n' +
        '</VirtualHost>'
    };
  } else {
    // Static-Konfiguration (default)
    return {
      nginx: 
        'server {\n' +
        '    listen 80;\n' +
        '    server_name ' + serverNames + ';\n' +
        '    \n' +
        '    root ' + documentRoot + ';\n' +
        '    \n' +
        '    access_log ' + accessLog + ';\n' +
        '    error_log ' + errorLog + ';\n' +
        '    \n' +
        '    location / {\n' +
        '        try_files $uri $uri/ =404;\n' +
        '    }\n' +
        '    ' + nginxSecurityHeaders + '\n' +
        '}',
      apache: 
        '<VirtualHost *:80>\n' +
        '    ServerName ' + domainName + '\n' +
        '    ServerAlias www.' + domainName + ' ' + domainName + '.preview.' + config.hostname + '\n' +
        '    DocumentRoot "' + documentRoot + '"\n' +
        '    \n' +
        '    CustomLog "' + accessLog + '" combined\n' +
        '    ErrorLog "' + errorLog + '"\n' +
        '    \n' +
        '    <Directory "' + documentRoot + '">\n' +
        '        Options Indexes FollowSymLinks\n' +
        '        AllowOverride All\n' +
        '        Require all granted\n' +
        '    </Directory>\n' +
        '    ' + apacheSecurityHeaders + '\n' +
        '</VirtualHost>'
    };
  }
}

/**
 * Ändert die Runtime einer Domain und aktualisiert die Webserver-Konfiguration
 */
export async function setRuntime(domainId: number, runtime: string): Promise<boolean> {
  try {
    if (!['static', 'deno'].includes(runtime)) {
      throw new Error(`Ungültige Runtime: ${runtime}`);
    }
    
    db.query(`UPDATE domains SET runtime = ? WHERE id = ?`, [runtime, domainId]);
    const result = await generateWebserverConfig(domainId);
    
    return result !== null;
  } catch (error) {
    logError(`Fehler beim Setzen der Runtime: ${error.message}`, "WebserverConfig");
    return false;
  }
}
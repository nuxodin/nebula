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
export async function generateWebserverConfig(domain): Promise<WebServerConfig | null> {
  try {
    // Domain-Informationen aus der Datenbank abrufen

    // Pfade für die Domain
    const domainPath = join(vhostsRoot, domain.name);
    const httpdocsPath = join(domainPath, "httpdocs");
    const confPath = join(domainPath, "conf");
    const logsPath = join(domainPath, "logs");

    // Verzeichnisse erstellen
    await Promise.all([
      ensureDir(vhostsRoot),
      ensureDir(httpdocsPath),
      ensureDir(confPath),
      ensureDir(logsPath)
    ]);

    // Konfigurationen generieren
    const configs = getConfigForRuntime(domain.name, domain.runtime, domain.id, httpdocsPath);

    // Konfigurationsdateien speichern
    await Promise.all([
      Deno.writeTextFile(join(confPath, "nginx.conf"), configs.nginx),
      //Deno.writeTextFile(join(confPath, "apache.conf"), configs.apache),
      Deno.writeTextFile(join('/etc/apache2/nebula-vhosts/', domain.name + '.conf'), configs.apache)
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
    const nginxConfPath = join(confPath, "nginx.conf");

    // Ensure parent directories exist
    await ensureDir(sitesAvailablePath);
    await ensureDir(sitesEnabledPath);

    // Check if source file exists
    try {
      await Deno.stat(nginxConfPath);
    } catch (error) {
      throw new Error(`nginx.conf nicht gefunden in ${nginxConfPath}`);
    }

    // Bestehende Symlinks entfernen (falls vorhanden)
    for (const path of [nginxAvailablePath, nginxEnabledPath]) {
      try {
        await Deno.remove(path);
      } catch {
        // Ignorieren wenn die Datei nicht existiert
      }
    }

    // Neue Symlinks erstellen
    await Deno.symlink(nginxConfPath, nginxAvailablePath);
    await Deno.symlink(nginxAvailablePath, nginxEnabledPath);
    
    logInfo(`Symlinks für ${domainName} erstellt`, "WebserverConfig");
  } catch (error) {
    logError(`Fehler beim Erstellen der Symlinks: ${error.message}`, "WebserverConfig");
    throw error; // Propagate error to caller
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
  } else if (runtime === 'php') {
    // PHP-FPM spezifische Konfiguration
    //const phpVersion = runtime.version;
    const phpVersion = 8.2;
    const phpFpmSocket = `/run/php/php${phpVersion}-fpm.sock`;

    return {
      nginx: 
        'server {\n' +
        '    listen 80;\n' +
        '    server_name ' + serverNames + ';\n' +
        '    \n' +
        '    root ' + documentRoot + ';\n' +
        '    index index.php index.html;\n' +
        '    \n' +
        '    access_log ' + accessLog + ';\n' +
        '    error_log ' + errorLog + ';\n' +
        '    \n' +
        '    location / {\n' +
        '        try_files $uri $uri/ /index.php?$query_string;\n' +
        '    }\n' +
        '    \n' +
        '    location ~ \\.php$ {\n' +
        '        include fastcgi_params;\n' +
        '        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;\n' +
        '        fastcgi_pass unix:' + phpFpmSocket + ';\n' +
        '        fastcgi_index index.php;\n' +
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
        '        DirectoryIndex index.php index.html\n' +
        '    </Directory>\n' +
        '    \n' +
        '    <FilesMatch "\\.php$">\n' +
        '        SetHandler "proxy:unix:' + phpFpmSocket + '|fcgi://localhost/"\n' +
        '    </FilesMatch>\n' +
        '    \n' +
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
        '</VirtualHost>',
    };
  }
}

/**
 * Ändert die Runtime einer Domain und aktualisiert die Webserver-Konfiguration
 */
export async function setRuntime(domainId: number, runtime: string): Promise<boolean> {
  try {
    
    // todo: check if runtime exists        
    
    db.query(`UPDATE domains SET runtime = ? WHERE id = ?`, [runtime, domainId]);
    const result = await generateWebserverConfig(domainId);
    
    return result !== null;
  } catch (error) {
    logError(`Fehler beim Setzen der Runtime: ${error.message}`, "WebserverConfig");
    return false;
  }
}
import { runCommand, writeFile, reloadService } from "../../utils/command.ts";
import { ensureDir, copy } from "https://deno.land/std/fs/mod.ts";
import db from "../../utils/database.ts";
import { config } from "../../utils/config.ts";
import { logInfo, logError } from "../../utils/logger.ts";
import { createBindZone } from "../dns/bind.ts";

interface DomainOptions {
  name: string;
  owner_id: number;
  php_version?: string;
  document_root?: string;
  ssl_enabled?: boolean;
  webspace_limit?: number;
  traffic_limit?: number;
}

export async function createDomain(options: DomainOptions) {
  const {
    name,
    owner_id,
    php_version = config.default_php_version,
    document_root = config.default_document_root,
    webspace_limit = config.default_webspace_limit,
    traffic_limit = config.default_traffic_limit
  } = options;

  try {
    // Domain in Datenbank erstellen
    const result = db.queryEntries(
      `INSERT INTO domains 
       (name, owner_id, status, php_version, document_root, webspace_limit, traffic_limit) 
       VALUES (?, ?, ?, ?, ?, ?, ?) 
       RETURNING id`,
      [name, owner_id, "aktiv", php_version, document_root, webspace_limit, traffic_limit]
    );
    
    const domainId = result[0].id;
    
    // Plesk-ähnliche Verzeichnisstruktur erstellen
    const domainPath = `${config.vhosts_root}/${name}`;
    const paths = [
      `${domainPath}/${document_root}`,
      `${domainPath}/logs`,
      `${domainPath}/conf`,
      `${domainPath}/private`,
      `${domainPath}/statistics`,
      `${domainPath}/backup`
    ];

    for (const path of paths) {
      await ensureDir(path);
    }

    // Copy and customize default index.html template
    // todo: copy all files from template directory (${config.data_dir}/templates/default)
    const templatePath = `${config.data_dir}/templates/default/index.html`; // todo: data_dir defined?
    let indexContent = await Deno.readTextFile(templatePath);
    indexContent = indexContent.replaceAll("{{domain}}", name);
    await Deno.writeTextFile(`${domainPath}/${document_root}/index.html`, indexContent);

    // Apache vHost Konfiguration
    const apacheConfig = `
<VirtualHost *:80>
    ServerName ${name}
    ServerAlias www.${name}
    DocumentRoot "${domainPath}/${document_root}"
    
    CustomLog "${domainPath}/logs/access.log" combined
    ErrorLog "${domainPath}/logs/error.log"
    
    <Directory "${domainPath}/${document_root}">
        Options Indexes FollowSymLinks MultiViews
        AllowOverride All
        Require all granted
    </Directory>

    # PHP-FPM Konfiguration
    <FilesMatch "\\.php$">
        SetHandler "proxy:unix:/run/php/php${php_version}-fpm.sock|fcgi://localhost"
    </FilesMatch>

    # Custom PHP Einstellungen
    php_admin_value[open_basedir] = "${domainPath}/:${domainPath}/tmp:/tmp"
    php_admin_value[upload_tmp_dir] = ${domainPath}/tmp
    php_admin_value[session.save_path] = ${domainPath}/tmp
    
    # Ressourcen Limits
    php_admin_value[memory_limit] = 128M
    php_admin_value[post_max_size] = 32M
    php_admin_value[upload_max_filesize] = 32M
</VirtualHost>`;

    await Deno.writeTextFile(`${domainPath}/conf/vhost.conf`, apacheConfig);

    // Standard-Hosting-Eintrag erstellen
    db.query(
      `INSERT INTO hosting 
       (dom_id, htype, ip_address, ftp_username, ftp_password, php_memory_limit) 
       VALUES (?, ?, ?, ?, ?, ?)`,

      [domainId, config.default_webserver, config.default_ip, `ftp_${name}`, crypto.randomUUID(), 128]
    );
    
    // Standard DNS-Einträge erstellen
    const dnsEntries = [
      { type: "A", name: "@", value: config.default_ip, ttl: 3600 },
      { type: "CNAME", name: "www", value: "@", ttl: 3600 },
      { type: "MX", name: "@", value: `mail.${name}`, ttl: 3600, priority: 10 },
      { type: "TXT", name: "@", value: "v=spf1 mx ~all", ttl: 3600 }
    ];

    for (const dns of dnsEntries) {
      db.query(
        `INSERT INTO dns_records 
         (domain_id, record_type, name, value, ttl, priority) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [domainId, dns.type, dns.name, dns.value, dns.ttl, dns.priority || null]
      );
    }

    // DNS Zone erstellen
    await createBindZone(name, dnsEntries, config.default_ip);

    // Apache und DNS neu laden
    await reloadService("apache2");
    await reloadService("bind9");

    logInfo(`Domain ${name} wurde erfolgreich erstellt`, "Domains");
    return { success: true, domainId };

  } catch (error) {
    logError(`Fehler beim Erstellen der Domain ${name}: ${error.message}`, "Domains");
    throw error;
  }
}

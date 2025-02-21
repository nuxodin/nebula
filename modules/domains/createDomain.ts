import { reloadService } from "../../utils/command.ts";
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
    webspace_limit = config.default_webspace_limit,
    traffic_limit = config.default_traffic_limit
  } = options;

  // checks
  if (!name.match(/^[a-z0-9.-]+$/)) { throw new Error("Ungültiger Domain-Name"); }
  const domainExists = db.queryEntries(`SELECT * FROM domains WHERE name = ?`, [name]);
  if (domainExists.length > 0) { throw new Error("Domain existiert bereits"); }  

  // Domain in Datenbank erstellen
  const result = db.queryEntries(
    `INSERT INTO domains 
      (name, owner_id, status, php_version, webspace_limit, traffic_limit) 
      VALUES (?, ?, ?, ?, ?, ?) 
      RETURNING id`,
    [name, owner_id, "aktiv", php_version, webspace_limit, traffic_limit]
  );
  const domainId = result[0].id;

  const dnsEntries = [
    { type: "A",     name: "@",   value: config.default_ip, ttl: 3600 },
    { type: "CNAME", name: "www", value: "@",               ttl: 3600 },
    { type: "MX",    name: "@",   value: `mail.${name}`,    ttl: 3600, priority: 10 },
    { type: "TXT",   name: "@",   value: "v=spf1 mx ~all",  ttl: 3600 }
  ];

  for (const dns of dnsEntries) {
    db.query(
      `INSERT INTO dns_records 
        (domain_id, record_type, name, value, ttl, priority) 
        VALUES (?, ?, ?, ?, ?, ?)`,
      [domainId, dns.type, dns.name, dns.value, dns.ttl, dns.priority || null]
    );
  }

  await createDomainDirectory(domainId);
  //await createDomainTemplate(domainId);
  await createApacheConf(domainId);
  await createBindZone(name, dnsEntries, config.default_ip);

  await reloadService("apache2");
  await reloadService("bind9");

  logInfo(`Domain ${name} wurde erfolgreich erstellt`, "Domains");
  return { success: true, domainId };
}



async function createDomainDirectory(domain_id: number) {
  const domain = db.queryEntries(`SELECT * FROM domains WHERE id = ?`,[domain_id])[0];
  if (!domain) throw new Error("Domain not found");
  const domainPath = `${config.vhosts_root}/${domain.name}`;
  const paths = [
    `${domainPath}/httpdocs`,
    `${domainPath}/logs`,
    `${domainPath}/conf`,
    `${domainPath}/private`,
    `${domainPath}/statistics`,
    `${domainPath}/backup`
  ];
  for (const path of paths) await ensureDir(path);
}

async function createDomainTemplate(domain_id: number) {
  const domain = db.queryEntries(`SELECT * FROM domains WHERE id = ?`,[domain_id])[0];
  if (!domain) throw new Error("Domain not found");
  const domainPath = `${config.vhosts_root}/${domain.name}`;
  const templatePath = `${config.data_dir}/templates/default`;
  await copy(templatePath, domainPath);
}
  
async function createApacheConf(domain_id: number) {
  const domain = db.queryEntries(
    `SELECT * FROM domains WHERE id = ?`,
    [domain_id]
  )[0];
  if (!domain) throw new Error("Domain not found");
  const domainPath = `${config.vhosts_root}/${domain.name}`;
  const php_version = domain.php_version || config.default_php_version;
  const apacheConfig = `
  <VirtualHost *:80>
      ServerName ${domain.name}
      ServerAlias www.${domain.name}
      DocumentRoot "${domainPath}/httpdocs"
      
      CustomLog "${domainPath}/logs/access.log" combined
      ErrorLog "${domainPath}/logs/error.log"
      
      <Directory "${domainPath}/httpdocs">
          Options Indexes FollowSymLinks MultiViews
          AllowOverride All
          Require all granted
      </Directory>
  
      # PHP-FPM Konfiguration
      <FilesMatch "\\.php$">
          SetHandler "proxy:unix:/run/php/php${php_version}-fpm.sock|fcgi://localhost"
      </FilesMatch>
  
      # Custom PHP Einstellungen
      php_admin_value[open_basedir] = "${domainPath}/:httpdocs/tmp:/tmp"
      php_admin_value[upload_tmp_dir] = ${domainPath}/tmp
      php_admin_value[session.save_path] = ${domainPath}/tmp
      
      # Ressourcen Limits
      php_admin_value[memory_limit] = 128M
      php_admin_value[post_max_size] = 32M
      php_admin_value[upload_max_filesize] = 32M
  </VirtualHost>`;
  await Deno.writeTextFile(`${domainPath}/conf/vhost.conf`, apacheConfig);
}


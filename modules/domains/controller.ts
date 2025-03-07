import db from "../../utils/database.ts";
import { ensureDir, copy } from "https://deno.land/std/fs/mod.ts";
import { config } from "../../utils/config.ts";
import { logInfo, logError } from "../../utils/logger.ts";
import { join } from "https://deno.land/std/path/mod.ts";
import { run } from "../../utils/command.ts";
import { generateWebserverConfig } from "./generateWebserverConfig.ts";

interface DomainOptions {
  name: string;
  owner_id: number;
  runtime?: string;
  runtime_version?: string;
  ssl_enabled?: boolean;
  webspace_limit?: number;
  traffic_limit?: number;
}

export async function createDomain(options: DomainOptions) {
  try {
    // Prüfe ob Domain bereits existiert
    const exists = db.queryEntries('SELECT id FROM domains WHERE name = ?', [options.name])[0];
    if (exists) throw new Error("Domain existiert bereits");

    // Erstelle Domain in der Datenbank

    const { id: domain_id } = db.queryEntries(`
      INSERT INTO domains (
        name, owner_id, runtime, runtime_version
      ) VALUES (?, ?, ?, ?)
      RETURNING id
    `, [
      options.name,
      options.owner_id,
      options.runtime || config.default_runtime,
      options.runtime_version || config.default_runtime_version
    ])[0];

    await createDirectory(domain_id);
    await createTemplate(domain_id);

    if (options.runtime === 'deno') {
      import('../deno/runtime.ts').then(({ denoRuntime }) => {
        denoRuntime.initDomain(domain_id);
      });
    }

    // erstelle ein system benutzer für die domain
    if (Deno.build.os !== "windows") {
      const domainPath = join(config.vhosts_root, options.name);
      const linuxUser = `ne-do-${domain_id}`;
      await run('adduser', ['--system', '--group', '--home', domainPath, linuxUser], { sudo: true });
      await run('chown', ['-R', `${linuxUser}:${linuxUser}`, domainPath], { sudo: true });
    }

    await createDefaultDnsRecords(domain_id);
    
    // Webserver-Konfiguration generieren (ersetzt createApacheConf und createNginxConf)
    await generateWebserverConfig(domain_id);

    // mail-server konfiguration


    logInfo(`Domain ${options.name} wurde erstellt`, "Domains");
    return { success: true, id: domain_id };
  } catch (error) {
    logError(`Fehler beim Erstellen der Domain: ${error.message}`, "Domains");
    throw error;
  }
}

async function createDirectory(domain_id: number) {
  const domain = db.queryEntries(`SELECT * FROM domains WHERE id = ?`,[domain_id])[0];
  if (!domain) throw new Error("Domain not found");  

  // Verwende den OS-spezifischen Pfad aus der Konfiguration
  const domainPath = join(config.vhosts_root, domain.name);
  
  const paths = [
    join(domainPath, "httpdocs"),
    join(domainPath, "logs"),
    join(domainPath, "conf"),
    join(domainPath, "tmp")
  ];
  
  // Verzeichnisse erstellen
  for (const path of paths) {
    await ensureDir(path);
    logInfo(`Verzeichnis erstellt: ${path}`, "Domains");
  }
}

// todo: add full folder contents not only index.html
async function createTemplate(domain_id: number) {
  const domain = db.queryEntries(`SELECT * FROM domains WHERE id = ?`,[domain_id])[0];
  if (!domain) throw new Error("Domain not found");

  const domainPath = join(config.vhosts_root, domain.name, "httpdocs", "index.html");
  const templatePath = join(Deno.cwd(), "data", "templates", "default", "index.html");
  
  try {
    await copy(templatePath, domainPath);
    logInfo(`Template kopiert nach ${domainPath}/httpdocs`, "Domains");
  } catch (error) {
    logError(`Fehler beim Kopieren des Templates: ${error.message}`, "Domains");
  }
}

async function createDefaultDnsRecords(domain_id: number) {
  const domain = db.queryEntries('SELECT * FROM domains WHERE id = ?', [domain_id])[0];
  if (!domain) throw new Error("Domain not found");

  // Standardmäßige DNS Records
  const records = [{
      domain_id,
      record_type: 'NS',
      name: '@',
      value: config.dns_primary_ns,
    },{
      domain_id,
      record_type: 'NS',
      name: '@',
      value: config.dns_secondary_ns,
    },{
      domain_id,
      record_type: 'A',
      name: '@',
      value: config.default_ip === 'auto' ? '127.0.0.1' : config.default_ip,
    },{
      domain_id,
      record_type: 'CNAME',
      name: 'www',
      value: '@',
    },{
      domain_id,
      record_type: 'MX',
      name: '@',
      value: '@'      
    },{
      domain_id,
      record_type: 'TXT',
      name: '@',
      value: 'v=spf1 a mx -all'
    }
  ];

  // Records in die Datenbank einfügen
  for (const record of records) {
    db.query(`
      INSERT INTO dns_records (domain_id, record_type, name, value)
      VALUES (?, ?, ?, ?)
    `, [record.domain_id, record.record_type, record.name, record.value]);
  }

  // Generiere die Bind Zone-Datei
  //await writeZoneFile(domain_id);
  logInfo(`DNS-Records erstellt für ${domain.name}`, "Domains");
}


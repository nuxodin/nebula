import db from "../../utils/database.ts";
import { ensureDir, copy } from "https://deno.land/std/fs/mod.ts";
import { config } from "../../utils/config.ts";
import { logInfo, logError } from "../../utils/logger.ts";
import { join } from "https://deno.land/std/path/mod.ts";
import { run } from "../../utils/command.ts";
import { generateWebserverConfig } from "./generateWebserverConfig.ts";
import { getRuntime } from "../../utils/runtime.ts";

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
    const domain = {
      name: options.name,
      owner_id: options.owner_id,
      runtime: options.runtime || config.default_runtime,
      runtime_version: options.runtime_version || 'latest',
    };
    const { id: domain_id } = db.queryEntries(`
      INSERT INTO domains (
        name, owner_id, runtime, runtime_version
      ) VALUES (?, ?, ?, ?)
      RETURNING id
    `, [ domain.name, domain.owner_id, domain.runtime, domain.runtime_version ])[0];
    domain.id = domain_id;

    await createDirectory(domain);
    await createTemplate(domain);

    const runtime = getRuntime(domain.runtime)
    runtime.initDomain(domain);

    // import(`../${options.runtime}/runtime.ts`).then(({ runtime }) => {
    //   runtime.initDomain(domain);
    // });

    // erstelle ein system benutzer für die domain
    if (Deno.build.os !== "windows") {
      const domainPath = join(config.vhosts_root, options.name);
      const linuxUser = `ne-do-${domain.id}`;
      await run('adduser', ['--system', '--group', '--home', domainPath, linuxUser], { sudo: true });
      await run('chown', ['-R', `${linuxUser}:${linuxUser}`, domainPath], { sudo: true });
    }

    await createDefaultDnsRecords(domain);
    await generateWebserverConfig(domain);
    // todo: mail-server konfiguration

    logInfo(`Domain ${options.name} wurde erstellt`, "Domains");
    return { success: true, id: domain_id };
  } catch (error) {
    logError(`Fehler beim Erstellen der Domain: ${error.message}`, "Domains");
    throw error;
  }
}

async function createDirectory(domain) {
  const domainPath = join(config.vhosts_root, domain.name);
  const folders = ["httpdocs","logs","conf","tmp"];
  for (const folder of folders) {
    await ensureDir(join(domainPath, folder));
  }
}

// todo: add full folder contents not only index.html
async function createTemplate(domain) {
  const domainPath = join(config.vhosts_root, domain.name, "httpdocs", "index.html");
  const templatePath = join(Deno.cwd(), "data", "templates", "default", "index.html");
  try {
    await copy(templatePath, domainPath);
    logInfo(`Template kopiert nach ${domainPath}/httpdocs`, "Domains");
  } catch (error) {
    logError(`Fehler beim Kopieren des Templates: ${error.message}`, "Domains");
  }
}

async function createDefaultDnsRecords(domain) {
  const records = [{ // Standardmäßige DNS Records
      type: 'NS',
      name: '@',
      value: config.dns_primary_ns,
    },{
      type: 'NS',
      name: '@',
      value: config.dns_secondary_ns,
    },{
      type: 'A',
      name: '@',
      value: config.default_ip === 'auto' ? '127.0.0.1' : config.default_ip,
    },{
      type: 'CNAME',
      name: 'www',
      value: '@',
    },{
      type: 'MX',
      name: '@',
      value: '@'      
    },{
      type: 'TXT',
      name: '@',
      value: 'v=spf1 a mx -all'
    }
  ];

  // Records in die Datenbank einfügen
  for (const record of records) {
    db.query(`
      INSERT INTO dns_records (domain_id, type, name, value)
      VALUES (?, ?, ?, ?)
    `, [domain.id, record.type, record.name, record.value]);
  }

  // Generiere die Bind Zone-Datei
  //await writeZoneFile(domain_id);
  logInfo(`DNS-Records erstellt für ${domain.name}`, "Domains");
}


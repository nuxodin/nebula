import db from "../../utils/database.ts";
import { logError, logInfo } from "../../utils/logger.ts";
import { config } from "../../utils/config.ts";
import { run } from "../../utils/command.ts";

interface DnsRecord {
  id?: number;
  domain_id?: number;
  type: string;
  name: string;
  value: string;
  ttl?: number;
  priority?: number;
  [key: string]: unknown;
}

interface Domain {
  id: number;
  name: string;
  [key: string]: unknown;
}

export function generateZoneFile(domainId: number): string {
  const domain = db.queryEntries<Domain>("SELECT * FROM domains WHERE id = ?", [domainId])[0];
  if (!domain) throw new Error(`Domain ${domainId} not found`);

  const records = db.queryEntries<DnsRecord>(
    "SELECT * FROM dns_records WHERE domain_id = ? ORDER BY type, name, priority", 
    [domainId]
  );

  // fix record
  records.push({
    name: "@",
    type: "CNAME",
    value: `${domain.name}.preview.${config.domain}`,
  });

  return createZoneFile({
    origin: domain.name,
    ttl: domain.dns_ttl,
    primaryNs: config.dns_primary_ns,
    hostmaster: config.dns_hostmaster,
    serial: Math.floor(Date.now() / 1000),
    refresh: domain.dns_refresh,
    retry: domain.dns_retry,
    expire: domain.dns_expire,
  }, records);
}

export async function writeZoneFile(domainId: number): Promise<void> {
  try {
    const domain = db.queryEntries<Domain>("SELECT * FROM domains WHERE id = ?", [domainId])[0];
    if (!domain) throw new Error(`Domain ${domainId} not found`);

    const zoneContent = generateZoneFile(domainId);
    const zonePath = `${config.bind_zones_dir}/${domain.name}.zone`;

    await Deno.writeTextFile(zonePath, zoneContent);
    logInfo(`Zone file for ${domain.name} written to ${zonePath}`, "DNS");
    
    // Optional: Reload BIND
    if (config.bind_auto_reload) {
      const { code, stderr } = run('rndc', ['reload', domain.name]);

      
      if (code === 0) {
        logInfo(`BIND reloaded for ${domain.name}`, "DNS");
      } else {
        throw new Error("Failed to reload BIND: " + stderr);
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      logError(`Error writing zone file: ${error.message}`, "DNS");
    } else {
      logError("Unknown error writing zone file", "DNS");
    }
    throw error;
  }
}




function createZoneFile(header, entries) {
  let zoneFile = '';

  const serial = generateSerialNumber(header.origin);

  zoneFile += `$ORIGIN ${header.origin}\n`;
  zoneFile += `$TTL ${header.ttl}\n`;
  zoneFile += `@ IN SOA ${header.primaryNs}. ${header.hostmaster}. (\n`;
  zoneFile += `    ${serial} ; Seriennummer\n`;
  zoneFile += `    ${header.refresh} ; Refresh-Zeit\n`;
  zoneFile += `    ${header.expire} ; Expire-Zeit\n`;
  zoneFile += `)\n`;
  entries.forEach(entry => {
      if (entry.name === '') entry.name = '@';
      zoneFile += `${entry.name} ${entry.ttl} ${entry.type} ${entry.value}\n`;
  });

  return zoneFile;
}


const lastSerialsRaw = localStorage.getItem('lastSerials') || '{}';
let lastSerials = {};
try {
  lastSerials = JSON.parse(lastSerialsRaw);
} catch {
  logError('Failed to parse lastSerials (dns-zone)');
}

function generateSerialNumber(domain: string): number {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const lastSerial = lastSerials[domain] || 1000000000;
  const lastDatePart = String(lastSerial).slice(0, 8);
  const counter = lastDatePart === datePart ? (lastSerial % 100) + 1 : 1;
  if (counter >= 100) throw new Error('Serial number counter overflow');
  
  lastSerials[domain] = Number(`${datePart}${String(counter).padStart(2, '0')}`);
  localStorage.setItem('lastSerials', JSON.stringify(lastSerials)); 
  return Number(`${datePart}${String(counter).padStart(2, '0')}`);
}


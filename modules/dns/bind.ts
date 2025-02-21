import { runCommand } from "../../utils/command.ts";

export async function createBindZone(domainName: string, dnsRecords: any[], defaultIp: string) {
    const bindZoneFile = `/etc/bind/zones/db.${domainName}`;
    
    // Erstelle DNS Records
    const records = dnsRecords.map(record => {
        switch(record.type) {
            case 'A':
                return `${record.name}\tIN\tA\t${record.value}`;
            case 'CNAME':
                return `${record.name}\tIN\tCNAME\t${record.value}`;
            case 'MX':
                return `${record.name}\tIN\tMX\t${record.priority}\t${record.value}`;
            case 'TXT':
                return `${record.name}\tIN\tTXT\t"${record.value}"`;
            default:
                return '';
        }
    }).join('\n');

    const bindZone = `
$TTL    604800
@       IN      SOA     ns1.${domainName}. admin.${domainName}. (
                          3         ; Serial
                     604800         ; Refresh
                      86400         ; Retry
                    2419200         ; Expire
                     604800 )       ; Negative Cache TTL
;
@       IN      NS      ns1.${domainName}.
ns1     IN      A       ${defaultIp}

${records}
    `;
    // Speichere Bind-Zone-Datei
    await Deno.writeTextFile(bindZoneFile, bindZone);

    const namedConfLocal = `/etc/bind/named.conf.local`;
    const zoneEntry = `
zone "${domainName}" {
    type master;
    file "${bindZoneFile}";
};
    `;
    await runCommand(["bash", "-c", `echo '${zoneEntry}' >> ${namedConfLocal}`]);
}

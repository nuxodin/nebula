// Server-weite Konfigurationseinstellungen
export const config = {
  // Plesk-ähnliche Pfad-Konfigurationen
  hostname: 'localhost',

  vhosts_root: '/var/www/vhosts',
  bind_zones_dir: '/etc/bind/zones',
  
  // Domain-Standardeinstellungen
  default_webspace_limit: 1024, // MB
  default_traffic_limit: 10240, // MB
  default_ip: "auto",
  ssl_cert_dir: "../nebula-data/ssl",
  
  // DNS-Einstellungen
  bind_auto_reload: true,
  dns_primary_ns: "ns1.nebula.local",
  dns_secondary_ns: "ns2.nebula.local",
  dns_hostmaster: "hostmaster.nebula.local",

  // Backup-Einstellungen (todo)
  // backup_directory: '/var/lib/nebula/dumps';  
  
};


if (Deno.build.os === 'windows') {
  config.vhosts_root = 'C:\\Inetpub\\vhosts';
  config.bind_zones_dir = 'C:\\ProgrmData\\Nebula\\bind\\zones';
}
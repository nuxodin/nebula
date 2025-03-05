// Server-weite Konfigurationseinstellungen
export const config = {
  // Plesk-ähnliche Pfad-Konfigurationen
  hostname: 'localhost',

  vhosts_root: '/var/www/vhosts',  
  
  // Domain-Standardeinstellungen
  default_webspace_limit: 1024, // MB
  default_traffic_limit: 10240, // MB
  
  // Server-Einstellungen
  default_ip: "auto",
  
  // SSL-Einstellungen
  ssl_cert_dir: "../nebula-data/ssl",

  lets_encrypt_enabled: true,
  
  // DNS-Einstellungen
  get bind_zones_dir() {
    return Deno.build.os === 'windows' ? 'C:\\ProgrmData\\Nebula\\bind\\zones' : '/etc/bind/zones';
  },
  bind_auto_reload: true,
  dns_primary_ns: "ns1.nebula.local",
  dns_secondary_ns: "ns2.nebula.local",
  dns_hostmaster: "hostmaster.nebula.local",
  
  // Backup-Einstellungen
  backup_enabled: true,
  get backup_directory() {
    return Deno.build.os === 'windows' ? 'C:\\ProgramData\\Nebula\\dumps' : '/var/lib/nebula/dumps';
  },
  backup_keep_days: 30,
  backup_types: ["full", "incremental"],
  
  // Sicherheitseinstellungen
  mod_security_enabled: true,
  fail2ban_enabled: true,
  default_ftp_quota: 0, // 0 = unlimited
  
  // Resource Limits
  php_memory_limit: "256M",
  php_max_execution_time: 30,
  php_upload_max_filesize: "32M",
  php_post_max_size: "32M"
};

if (Deno.build.os === 'windows') {
  config.vhosts_root = 'C:\\Inetpub\\vhosts';
}
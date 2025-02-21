// Server-weite Konfigurationseinstellungen
export const config = {
  // Plesk-ähnliche Pfad-Konfigurationen
  vhosts_root: "./var/www/vhosts",
  httpd_vhosts: "./var/www/vhosts",
  
  // Domain-Standardeinstellungen
  default_document_root: "httpdocs",
  default_php_version: "8.2",
  available_php_versions: ["7.4", "8.0", "8.1", "8.2"],
  default_webspace_limit: 1024, // MB
  default_traffic_limit: 10240, // MB
  
  // Server-Einstellungen
  default_ip: "auto",
  default_webserver: "apache",
  server_hostname: "server.nebula.local",
  
  // SSL-Einstellungen
  ssl_cert_dir: "./var/www/ssl",
  lets_encrypt_enabled: true,
  
  // Datenbank-Einstellungen
  default_db_type: "mysql",
  db_host: "localhost",
  allowed_db_types: ["mysql", "postgresql"],
  max_databases_per_domain: 25,
  
  // Mail-Einstellungen
  mail_enabled: true,
  default_mail_quota: 1024, // MB
  max_mail_accounts: 100,
  spam_protection: true,
  virus_protection: true,
  
  // Backup-Einstellungen
  backup_enabled: true,
  backup_directory: "./var/www/backups",
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
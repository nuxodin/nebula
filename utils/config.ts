// Server-weite Konfigurationseinstellungen
export const config = {
  // Plesk-ähnliche Pfad-Konfigurationen
  vhosts_root: "./var/www/vhosts",
  httpd_vhosts: "./var/www/vhosts",  // Kompatibilität mit Plesk-Notation
  
  // Domain-Standardeinstellungen
  default_document_root: "httpdocs",
  default_php_version: "8.2",
  default_webspace_limit: 1024, // MB
  default_traffic_limit: 10240, // MB
  
  // Server-Einstellungen
  default_ip: "auto",
  default_webserver: "apache",
  
  // Datenbank-Einstellungen
  default_db_type: "mysql",
  max_db_count: 10,
  
  // Mail-Einstellungen
  max_mailbox_count: 100,
  default_mailbox_quota: 1024 // MB
};
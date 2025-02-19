import { DB } from "https://deno.land/x/sqlite/mod.ts";

const db = new DB("nebula.db");

// Tabellen erstellen wenn sie nicht existieren
db.query(`
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    login TEXT UNIQUE,
    password TEXT,
    email TEXT UNIQUE
  );
`);

db.query(`
  CREATE TABLE IF NOT EXISTS domains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    owner_id INTEGER,
    status TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ssl_enabled BOOLEAN DEFAULT 0,
    ssl_expires_at DATETIME,
    webspace_limit INTEGER DEFAULT 1024, -- MB
    traffic_limit INTEGER DEFAULT 10240, -- MB
    php_version TEXT DEFAULT '8.2',
    document_root TEXT DEFAULT 'httpdocs',
    FOREIGN KEY (owner_id) REFERENCES clients(id)
  );
`);

db.query(`
  CREATE TABLE IF NOT EXISTS hosting (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dom_id INTEGER,
    htype TEXT,
    ip_address TEXT,
    ftp_username TEXT,
    ftp_password TEXT,
    php_memory_limit INTEGER DEFAULT 128,
    backup_enabled BOOLEAN DEFAULT 1,
    FOREIGN KEY (dom_id) REFERENCES domains(id)
  );
`);

db.query(`
  CREATE TABLE IF NOT EXISTS dns_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain_id INTEGER,
    record_type TEXT,
    name TEXT,
    value TEXT,
    ttl INTEGER DEFAULT 3600,
    priority INTEGER,
    FOREIGN KEY (domain_id) REFERENCES domains(id)
  );
`);

db.query(`
  CREATE TABLE IF NOT EXISTS databases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dom_id INTEGER,
    name TEXT,
    type TEXT,
    FOREIGN KEY (dom_id) REFERENCES domains(id)
  );
`);

db.query(`
  CREATE TABLE IF NOT EXISTS mail (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dom_id INTEGER,
    mail_name TEXT,
    password TEXT,
    FOREIGN KEY (dom_id) REFERENCES domains(id)
  );
`);

// Tabelle neu erstellen mit user_id statt user_login
db.query(`DROP TABLE IF EXISTS logs`);
db.query(`
  CREATE TABLE logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    level TEXT NOT NULL,
    message TEXT NOT NULL,
    source TEXT NULL,
    user_id INTEGER NULL,
    FOREIGN KEY (user_id) REFERENCES clients(id)
  );
`);

console.log("Datenbank-Tabellen wurden initialisiert");

export default db;
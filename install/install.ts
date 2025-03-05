// filepath: c:\workspace\nuxodin\nebula-project\nebula\install\install.ts
import { existsSync, ensureDirSync } from "https://deno.land/std/fs/mod.ts";
import { DB } from "https://deno.land/x/sqlite/mod.ts";
import { dirname, fromFileUrl, join } from "https://deno.land/std/path/mod.ts";
import { config } from "../utils/config.ts";
import { hash } from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

// Berechne absolute Pfade
const currentDir = dirname(fromFileUrl(import.meta.url));
const dataPath = join(currentDir, "../../nebula-data");
const configPath = join(dataPath, "config");
const configFile = join(configPath, "config.json");
const dataFolder = join(dataPath, "data");
const dbFile = join(dataFolder, "nebula.db");

// Standard-Config
const defaultConfig = {
  appName: "Nebula",
  version: "1.0.0"
};

function initializeDatabase() {
  const db = new DB(dbFile);

  try {
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
        status TEXT DEFAULT 'aktiv',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        runtime TEXT DEFAULT 'static',
        runtime_version TEXT,

        ssl_enabled BOOLEAN DEFAULT 0,
        ssl_expires_at DATETIME,

        dns_ttl INTEGER DEFAULT 3600,
        dns_refresh INTEGER DEFAULT 3600,
        dns_retry INTEGER DEFAULT 600,
        dns_expire INTEGER DEFAULT 604800,

        webspace_limit INTEGER DEFAULT 1024,
        traffic_limit INTEGER DEFAULT 10240,
        FOREIGN KEY (owner_id) REFERENCES clients(id)
      );
    `);

    db.query(`
      CREATE TABLE IF NOT EXISTS dns_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain_id INTEGER,
        record_type TEXT,
        name TEXT,
        value TEXT,
        ttl INTEGER,
        priority INTEGER,
        FOREIGN KEY (domain_id) REFERENCES domains(id)
      );
    `);

    db.query(`
      CREATE TABLE IF NOT EXISTS database_servers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        type TEXT NOT NULL,
        admin_login TEXT NOT NULL,
        admin_password TEXT NOT NULL
      );
    `);

    db.query(`
      CREATE TABLE IF NOT EXISTS databases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dom_id INTEGER,
        server_id INTEGER,
        name TEXT,
        type TEXT,
        db_user TEXT,
        db_pass TEXT,
        FOREIGN KEY (dom_id) REFERENCES domains(id),
        FOREIGN KEY (server_id) REFERENCES database_servers(id)
      );
    `);

    db.query(`
      CREATE TABLE IF NOT EXISTS mail (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dom_id INTEGER,
        mail_name TEXT,
        password TEXT,
        status TEXT DEFAULT 'aktiv',
        quota INTEGER,
        autoresponder_enabled INTEGER DEFAULT 0,
        autoresponder_config TEXT,
        forwarders TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (dom_id) REFERENCES domains(id)
      );
    `);

    db.query(`
      CREATE TABLE IF NOT EXISTS mail_aliases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mail_id INTEGER,
        alias TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (mail_id) REFERENCES mail(id) ON DELETE CASCADE
      );
    `);

    db.query(`
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        source TEXT NULL,
        user_id INTEGER NULL,
        FOREIGN KEY (user_id) REFERENCES clients(id)
      );
    `);

    db.query(`
      CREATE TABLE IF NOT EXISTS webauthn_devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        device_id TEXT NOT NULL,
        device_name TEXT NOT NULL,
        public_key TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_used TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES clients(id),
        UNIQUE(device_id)
      );
    `);

    db.query(`
      CREATE INDEX IF NOT EXISTS idx_webauthn_user ON webauthn_devices(user_id);
      CREATE INDEX IF NOT EXISTS idx_webauthn_device ON webauthn_devices(device_id);
    `);

    console.log("✅ Datenbank-Tabellen wurden initialisiert");
  } catch (error) {
    console.error("❌ Fehler bei der Datenbank-Initialisierung:", error);
    throw error;
  } finally {
    db.close();
  }
}

const exampleData = {
  clients: [
    { login: "admin", password: "admin", email: "admin@example.com" },
    { login: "user1", password: "user1pass", email: "user1@example.com" }
  ],
  domains: [
    { name: "example.com", owner_id: 1, status: "aktiv" },
    { name: "test.com", owner_id: 2, status: "aktiv" }
  ],
  database_servers: [
    { host: 'localhost', port: 3306, type: 'mysql', admin_login: 'root', admin_password: 'root' },
    { host: 'localhost', port: 5432, type: 'postgresql', admin_login: 'postgres', admin_password: 'postgres' }
  ],
  databases: [
    { dom_id: 1, server_id: 1, name: "example_db", type: "mysql" },
    { dom_id: 1, server_id: 1, name: "blog_db", type: "mysql" },
    { dom_id: 1, server_id: 2, name: "shop_db", type: "postgresql" },
    { dom_id: 2, server_id: 2, name: "test_db", type: "postgresql" },
    { dom_id: 2, server_id: 1, name: "app_db", type: "mysql" }
  ],
  dns_records: [
    { domain_id: 1, record_type: "A", name: "@", value: "192.168.1.1", ttl: 3600 },
    { domain_id: 1, record_type: "CNAME", name: "www", value: "@", ttl: 3600 },
    { domain_id: 1, record_type: "MX", name: "@", value: "mail.example.com", ttl: 3600, priority: 10 },
    { domain_id: 1, record_type: "TXT", name: "@", value: "v=spf1 mx ~all", ttl: 3600 },
    { domain_id: 2, record_type: "A", name: "@", value: "192.168.1.2", ttl: 3600 },
    { domain_id: 2, record_type: "CNAME", name: "www", value: "@", ttl: 3600 },
    { domain_id: 2, record_type: "MX", name: "@", value: "mail.test.com", ttl: 3600, priority: 10 },
    { domain_id: 2, record_type: "TXT", name: "@", value: "v=spf1 mx ~all", ttl: 3600 }
  ],
  mail: [
    { dom_id: 1, mail_name: "info@example.com", password: "infopass" },
    { dom_id: 1, mail_name: "support@example.com", password: "supportpass" },
    { dom_id: 1, mail_name: "admin@example.com", password: "adminpass" },
    { dom_id: 2, mail_name: "contact@test.com", password: "contactpass" },
    { dom_id: 2, mail_name: "sales@test.com", password: "salespass" }
  ]
};

async function initializeExampleData() {
  const db = new DB(dbFile);
  try {
    const clientCount = db.queryEntries<{ count: number }>("SELECT COUNT(*) as count FROM clients")[0];
    if (clientCount.count === 0) {
      // Hash passwords for example data
      const hashedPasswords = {
        admin: await hash("admin"),
        user1: await hash("user1pass")
      };

      // Beispieldaten einfügen
      const clients = [
        { login: "admin", password: hashedPasswords.admin, email: "admin@example.com" },
        { login: "user1", password: hashedPasswords.user1, email: "user1@example.com" }
      ];

      for (const client of clients) {
        db.query("INSERT INTO clients (login, password, email) VALUES (?, ?, ?)", 
          [client.login, client.password, client.email]);
      }

      for (const domain of exampleData.domains) {
        db.query("INSERT INTO domains (name, owner_id, status) VALUES (?, ?, ?)", 
          [domain.name, domain.owner_id, domain.status]);
      }

      for (const server of exampleData.database_servers) {
        db.query(
          "INSERT INTO database_servers (host, port, type, admin_login, admin_password) VALUES (?, ?, ?, ?, ?)",
          [server.host, server.port, server.type, server.admin_login, server.admin_password]
        );
      }

      for (const dbEntry of exampleData.databases) {
        db.query("INSERT INTO databases (dom_id, server_id, name, type) VALUES (?, ?, ?, ?)", 
          [dbEntry.dom_id, dbEntry.server_id, dbEntry.name, dbEntry.type]);
      }

      for (const dnsRecord of exampleData.dns_records) {
        db.query("INSERT INTO dns_records (domain_id, record_type, name, value, ttl, priority) VALUES (?, ?, ?, ?, ?, ?)", 
          [dnsRecord.domain_id, dnsRecord.record_type, dnsRecord.name, dnsRecord.value, dnsRecord.ttl, dnsRecord.priority]);
      }

      for (const mailEntry of exampleData.mail) {
        db.query("INSERT INTO mail (dom_id, mail_name, password) VALUES (?, ?, ?)", 
          [mailEntry.dom_id, mailEntry.mail_name, mailEntry.password]);
      }

      console.log("✅ Beispieldaten erfolgreich eingefügt");
    } else {
      console.log("ℹ️ Datenbank bereits mit", clientCount.count, "Benutzern initialisiert");
    }
  } catch (error) {
    console.error("❌ Fehler bei der Initialisierung der Beispieldaten:", error);
    throw error;
  } finally {
    db.close();
  }
}

// Erstellen und Überprüfen der erforderlichen Verzeichnisse
function createRequiredDirectories() {
  const directories = [
    // Hauptverzeichnisse
    dataPath,
    configPath,
    dataFolder,
    
    // Vhosts-Verzeichnis (OS-spezifisch über die Konfiguration)
    config.vhosts_root,
    
    // SSL-Verzeichnis
    config.ssl_cert_dir,
    
    // Backup-Verzeichnis
    config.backup_directory
  ];
  
  for (const dir of directories) {
    if (!existsSync(dir)) {
      console.log(`📁 Erstelle Verzeichnis: ${dir}`);
      ensureDirSync(dir);
    }
  }
  
  console.log("✅ Verzeichnisstruktur überprüft und erstellt");
}

await install();

export async function install() {
  try {
    // Erstelle benötigte Verzeichnisse
    createRequiredDirectories();

    // Erstelle oder aktualisiere Konfigurationsdatei
    if (!existsSync(configFile)) {
      await Deno.writeTextFile(configFile, JSON.stringify(defaultConfig, null, 2));
      console.log("✅ Konfigurationsdatei erstellt");
    }

    // Initialisiere Datenbank und Beispieldaten
    initializeDatabase();
    await initializeExampleData();

    console.log("✅ Installation abgeschlossen.");
  } catch (error) {
    console.error("❌ Installation fehlgeschlagen:", error);
    throw error;
  }
}

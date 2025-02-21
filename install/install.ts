// filepath: c:\workspace\nuxodin\nebula-project\nebula\install\install.ts
import { existsSync, ensureDirSync } from "https://deno.land/std/fs/mod.ts";
import { DB } from "https://deno.land/x/sqlite/mod.ts";
import { dirname, fromFileUrl, join } from "https://deno.land/std/path/mod.ts";

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

async function initializeDatabase() {
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
        status TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ssl_enabled BOOLEAN DEFAULT 0,
        ssl_expires_at DATETIME,
        webspace_limit INTEGER DEFAULT 1024,
        traffic_limit INTEGER DEFAULT 10240,
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
  hosting: [
    { dom_id: 1, htype: "apache", ip_address: "192.168.1.1" },
    { dom_id: 2, htype: "nginx", ip_address: "192.168.1.2" }
  ],
  databases: [
    { dom_id: 1, name: "example_db", type: "mysql" },
    { dom_id: 1, name: "blog_db", type: "mysql" },
    { dom_id: 1, name: "shop_db", type: "postgresql" },
    { dom_id: 2, name: "test_db", type: "postgresql" },
    { dom_id: 2, name: "app_db", type: "mysql" }
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
      // Beispieldaten einfügen
      for (const client of exampleData.clients) {
        db.query("INSERT INTO clients (login, password, email) VALUES (?, ?, ?)", 
          [client.login, client.password, client.email]);
      }

      for (const domain of exampleData.domains) {
        db.query("INSERT INTO domains (name, owner_id, status) VALUES (?, ?, ?)", 
          [domain.name, domain.owner_id, domain.status]);
      }

      for (const host of exampleData.hosting) {
        db.query("INSERT INTO hosting (dom_id, htype, ip_address) VALUES (?, ?, ?)", 
          [host.dom_id, host.htype, host.ip_address]);
      }

      for (const dbEntry of exampleData.databases) {
        db.query("INSERT INTO databases (dom_id, name, type) VALUES (?, ?, ?)", 
          [dbEntry.dom_id, dbEntry.name, dbEntry.type]);
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

await install();

export async function install() {
  !existsSync(dataPath) && ensureDirSync(dataPath);
  !existsSync(configPath) && ensureDirSync(configPath);
  !existsSync(dataFolder) && ensureDirSync(dataFolder);


  if (!existsSync(configFile)) {
    await Deno.writeTextFile(configFile, JSON.stringify(defaultConfig, null, 2));
  }


  await initializeDatabase();
  await initializeExampleData();
 
  console.log("✅ Installation abgeschlossen.");
}

import db from "../../utils/database.ts";
import { logInfo, logError } from "../../utils/logger.ts";
import { renderTemplate } from "../../utils/template.ts";
import { config } from "../../utils/config.ts";
import { ensureDir } from "https://deno.land/std@0.208.0/fs/ensure_dir.ts";

// View Controllers
export const getDomainView = async (c) => {
  try {
    const content = await Deno.readTextFile("./modules/domains/views/content.html");
    const scripts = await Deno.readTextFile("./modules/domains/views/scripts.html");
    return c.html(await renderTemplate("Domains", content, "", scripts));
  } catch (err) {
    logError("Fehler beim Laden der Domains-Übersicht", "Domains", c, err);
    return c.text("Internal Server Error", 500);
  }
};

export const getDomainFilesView = async (c) => {
  try {
    const { id } = c.req.param();
    const domain = db.queryEntries("SELECT name FROM domains WHERE id = ?", [id])[0];
    if (!domain) {
      return c.text("Domain nicht gefunden", 404);
    }
    const content = await Deno.readTextFile("./modules/domains/views/files.html");
    const scripts = await Deno.readTextFile("./modules/domains/views/files-scripts.html");
    return c.html(await renderTemplate(`Dateiverwaltung - ${domain.name}`, content, "", scripts));
  } catch (err) {
    logError("Fehler beim Laden der Dateiverwaltung", "Domains", c, err);
    return c.text("Internal Server Error", 500);
  }
};

// Nur noch wichtige Ereignisse loggen
export const getAllDomains = (c) => {
  try {
    const domains = db.queryEntries(`
      SELECT d.*, 
             c.login as owner_name,
             h.ip_address,
             h.ftp_username,
             h.php_memory_limit
      FROM domains d
      LEFT JOIN clients c ON d.owner_id = c.id
      LEFT JOIN hosting h ON d.id = h.dom_id
    `);
    return c.json(domains);
  } catch (err) {
    logError("Fehler beim Abrufen der Domains", "Domains", c, err);
    return c.text("Internal Server Error", 500);
  }
};

export const createDomain = async (c) => {
  try {
    const { name, owner_id } = await c.req.json();
    
    // Domain erstellen
    const result = db.queryEntries(
      "INSERT INTO domains (name, owner_id, status) VALUES (?, ?, ?) RETURNING id",
      [name, owner_id, "aktiv"]
    );
    
    const domainId = result[0].id;
    
    // Verzeichnisstruktur erstellen
    const domainPath = `${config.vhosts_root}/${name}`;
    const httpdocsPath = `${domainPath}/${config.default_document_root}`;
    
    await ensureDir(httpdocsPath);
    await ensureDir(`${domainPath}/logs`);
    await ensureDir(`${domainPath}/conf`);
    await ensureDir(`${domainPath}/private`);
    await ensureDir(`${domainPath}/statistics`);

    // Standard index.html erstellen
    await Deno.writeTextFile(`${httpdocsPath}/index.html`, 
      `<!DOCTYPE html>
      <html>
        <head>
          <title>Welcome to ${name}</title>
        </head>
        <body>
          <h1>Welcome to ${name}</h1>
          <p>Your website is hosted by Nebula</p>
        </body>
      </html>`
    );
    
    // Standard-Hosting-Eintrag erstellen
    db.query(
      "INSERT INTO hosting (dom_id, htype, ip_address, ftp_username, ftp_password, php_memory_limit) VALUES (?, ?, ?, ?, ?, ?)",
      [domainId, config.default_webserver, config.default_ip, `ftp_${name}`, "changeme", 128]
    );
    
    // Standard DNS-Einträge erstellen
    const dnsEntries = [
      { type: "A", name: "@", value: config.default_ip, ttl: 3600 },
      { type: "CNAME", name: "www", value: "@", ttl: 3600 }
    ];

    for (const dns of dnsEntries) {
      db.query(
        "INSERT INTO dns_records (domain_id, record_type, name, value, ttl) VALUES (?, ?, ?, ?, ?)",
        [domainId, dns.type, dns.name, dns.value, dns.ttl]
      );
    }

    logInfo(`Domain ${name} wurde erstellt`, "Domains", c);
    const newDomain = db.queryEntries("SELECT * FROM domains WHERE id = ?", [domainId])[0];
    return c.json(newDomain);
  } catch (err) {
    logError("Fehler beim Erstellen der Domain", "Domains", c, err);
    return c.text("Internal Server Error", 500);
  }
};

export const deleteDomain = async (c) => {
  try {
    const { id } = c.req.param();
    const domain = db.queryEntries("SELECT name FROM domains WHERE id = ?", [id])[0];
    
    if (!domain) {
      return c.text("Domain nicht gefunden", 404);
    }

    // Lösche Domain-Verzeichnis
    const domainPath = `${config.vhosts_root}/${domain.name}`;
    try {
      await Deno.remove(domainPath, { recursive: true });
    } catch (err) {
      logError(`Fehler beim Löschen des Domain-Verzeichnisses ${domainPath}`, "Domains", c, err);
      // Wir setzen fort, auch wenn das Verzeichnis nicht gelöscht werden konnte
    }
    
    // Lösche alle abhängigen Datensätze
    db.query("DELETE FROM dns_records WHERE domain_id = ?", [id]);
    db.query("DELETE FROM hosting WHERE dom_id = ?", [id]);
    db.query("DELETE FROM databases WHERE dom_id = ?", [id]);
    db.query("DELETE FROM mail WHERE dom_id = ?", [id]);
    db.query("DELETE FROM domains WHERE id = ?", [id]);
    
    logInfo(`Domain ${domain?.name} wurde gelöscht`, "Domains", c);
    return c.json({ message: "Domain deleted" });
  } catch (err) {
    logError("Fehler beim Löschen der Domain", "Domains", c, err);
    return c.text("Internal Server Error", 500);
  }
};

export const getDomainById = async (c) => {
  try {
    const { id } = c.req.param();
    
    const domain = db.queryEntries(`
      SELECT d.*, 
             c.login as owner_name,
             h.ip_address,
             h.htype,
             h.ftp_username,
             h.php_memory_limit
      FROM domains d
      LEFT JOIN clients c ON d.owner_id = c.id
      LEFT JOIN hosting h ON d.id = h.dom_id
      WHERE d.id = ?
    `, [id])[0];

    if (!domain) {
      return c.text("Domain not found", 404);
    }

    // Datenbanken separat abrufen
    domain.databases = db.queryEntries(`
      SELECT name, type
      FROM databases
      WHERE dom_id = ?
    `, [id]);

    // E-Mail-Konten separat abrufen
    domain.mail_accounts = db.queryEntries(`
      SELECT mail_name
      FROM mail
      WHERE dom_id = ?
    `, [id]);

    // Wenn API-Anfrage
    if (c.req.header("Accept")?.includes("application/json")) {
      return c.json(domain);
    }

    // Wenn HTML-Anfrage
    const content = await Deno.readTextFile("./modules/domains/views/detail.html");
    const scripts = await Deno.readTextFile("./modules/domains/views/detail-scripts.html");
    return c.html(await renderTemplate(`Domain ${domain.name}`, content, "", scripts));
  } catch (err) {
    logError("Fehler beim Abrufen der Domain-Details", "Domains", c, err);
    return c.text("Internal Server Error", 500);
  }
};
import { Context } from "hono";
import db from "../../utils/database.ts";
import { logError, logInfo } from "../../utils/logger.ts";
import { createDomain } from "./createDomain.ts";
import { config } from "../../utils/config.ts";
import { runCommand } from "../../utils/command.ts";
import { renderTemplate } from "../../utils/template.ts";
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

// todo: da stimmt was nicht, createDomain wurde ja importiert, welche ist die richtige?
export const createDomain = async (c) => {
  try {
    const { name, owner_id } = await c.req.json();
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
      return c.json({ error: "Domain not found" }, 404);
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

    return c.json(domain);
  } catch (err) {
    logError("Fehler beim Abrufen der Domain-Details", "Domains", c, err);
    return c.json({ error: "Internal Server Error" }, 500);
  }
};

export const getDomainDetailView = async (c) => {
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

    const content = await Deno.readTextFile("./modules/domains/views/detail.html");
    const scripts = await Deno.readTextFile("./modules/domains/views/detail-scripts.html");
    return c.html(await renderTemplate(`Domain ${domain.name}`, content, "", scripts));
  } catch (err) {
    logError("Fehler beim Abrufen der Domain-Details", "Domains", c, err);
    return c.text("Internal Server Error", 500);
  }
};

// Get domain list with statistics
export async function getDomains(c: Context) {
  try {
    const domains = db.queryEntries(`
      SELECT 
        d.*,
        h.ip_address,
        h.php_memory_limit,
        (SELECT COUNT(*) FROM databases WHERE dom_id = d.id) as db_count,
        (SELECT COUNT(*) FROM mail WHERE dom_id = d.id) as mail_count
      FROM domains d
      LEFT JOIN hosting h ON h.dom_id = d.id
    `);

    // Disk usage berechnen für jede Domain
    for (const domain of domains) {
      try {
        const { stdout } = await runCommand(`du -sb ${config.vhosts_root}/${domain.name}`);
        domain.disk_usage = parseInt(stdout.split('\t')[0]);
      } catch {
        domain.disk_usage = 0;
      }
    }

    return c.json(domains);
  } catch (err) {
    logError("Error fetching domains", "Domains", c, err);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Create new domain
export async function postDomain(c: Context) {
  try {
    const data = await c.req.parseBody();
    const session = c.get('session');
    const userId = await session.get('userId');

    const result = await createDomain({
      name: String(data.name),
      owner_id: userId,
      php_version: String(data.php_version || config.default_php_version),
      document_root: String(data.document_root || config.default_document_root),
      webspace_limit: Number(data.webspace_limit || config.default_webspace_limit),
      traffic_limit: Number(data.traffic_limit || config.default_traffic_limit)
    });

    return c.json(result);
  } catch (err) {
    logError("Error creating domain", "Domains", c, err);
    return c.json({ error: err.message }, 500);
  }
}

// Update domain settings
export async function updateDomain(c: Context) {
  try {
    const domainId = c.req.param('id');
    const data = await c.req.parseBody();
    
    // Update domain settings
    db.query(`
      UPDATE domains 
      SET php_version = ?, document_root = ?, webspace_limit = ?, traffic_limit = ?
      WHERE id = ?
    `, [
      data.php_version,
      data.document_root,
      data.webspace_limit,
      data.traffic_limit,
      domainId
    ]);

    // Update hosting settings
    db.query(`
      UPDATE hosting 
      SET php_memory_limit = ?
      WHERE dom_id = ?
    `, [data.php_memory_limit, domainId]);

    // Regenerate Apache config
    const domain = db.queryEntries('SELECT * FROM domains WHERE id = ?', [domainId])[0];
    const vhostPath = `${config.vhosts_root}/${domain.name}/conf/vhost.conf`;
    
    // Regenerate and write new vhost config
    const apacheConfig = generateVhostConfig(domain);
    await Deno.writeTextFile(vhostPath, apacheConfig);
    
    // Reload Apache
    await runCommand('systemctl reload apache2');

    return c.json({ success: true });
  } catch (err) {
    logError("Error updating domain", "Domains", c, err);
    return c.json({ error: err.message }, 500);
  }
}

// Generate Apache vhost configuration
function generateVhostConfig(domain: any) {
  const domainPath = `${config.vhosts_root}/${domain.name}`;
  return `
<VirtualHost *:80>
    ServerName ${domain.name}
    ServerAlias www.${domain.name}
    DocumentRoot "${domainPath}/${domain.document_root}"
    
    CustomLog "${domainPath}/logs/access.log" combined
    ErrorLog "${domainPath}/logs/error.log"
    
    <Directory "${domainPath}/${domain.document_root}">
        Options Indexes FollowSymLinks MultiViews
        AllowOverride All
        Require all granted
        
        # PHP Settings
        php_admin_value open_basedir "${domainPath}/:/tmp:/var/tmp"
        php_admin_value upload_tmp_dir /tmp
        php_admin_value session.save_path /tmp
        
        # Resource Limits
        php_admin_value memory_limit ${domain.php_memory_limit || config.php_memory_limit}
        php_admin_value max_execution_time ${config.php_max_execution_time}
        php_admin_value post_max_size ${config.php_post_max_size}
        php_admin_value upload_max_filesize ${config.php_upload_max_filesize}
    </Directory>

    # PHP-FPM Configuration
    <FilesMatch \\.php$>
        SetHandler "proxy:unix:/run/php/php${domain.php_version}-fpm.sock|fcgi://localhost"
    </FilesMatch>

    # Additional Security Headers
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-XSS-Protection "1; mode=block"
    Header always set X-Content-Type-Options "nosniff"
</VirtualHost>

${domain.ssl_enabled ? generateSSLConfig(domain) : ''}`;
}

// Generate SSL configuration if enabled
function generateSSLConfig(domain: any) {
  const domainPath = `${config.vhosts_root}/${domain.name}`;
  const sslPath = `${config.ssl_cert_dir}/${domain.name}`;
  
  return `
<VirtualHost *:443>
    ServerName ${domain.name}
    ServerAlias www.${domain.name}
    DocumentRoot "${domainPath}/${domain.document_root}"
    
    SSLEngine on
    SSLCertificateFile "${sslPath}/cert.pem"
    SSLCertificateKeyFile "${sslPath}/privkey.pem"
    SSLCertificateChainFile "${sslPath}/chain.pem"
    
    # SSL Settings
    SSLProtocol all -SSLv3 -TLSv1 -TLSv1.1
    SSLCipherSuite ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384
    SSLHonorCipherOrder off
    SSLSessionTickets off
    
    # HSTS
    Header always set Strict-Transport-Security "max-age=63072000"
    
    # Logs
    CustomLog "${domainPath}/logs/ssl_access.log" combined
    ErrorLog "${domainPath}/logs/ssl_error.log"
    
    <Directory "${domainPath}/${domain.document_root}">
        Options Indexes FollowSymLinks MultiViews
        AllowOverride All
        Require all granted
        
        # PHP Settings
        php_admin_value open_basedir "${domainPath}/:/tmp:/var/tmp"
        php_admin_value upload_tmp_dir /tmp
        php_admin_value session.save_path /tmp
        
        # Resource Limits
        php_admin_value memory_limit ${domain.php_memory_limit || config.php_memory_limit}
        php_admin_value max_execution_time ${config.php_max_execution_time}
        php_admin_value post_max_size ${config.php_post_max_size}
        php_admin_value upload_max_filesize ${config.php_upload_max_filesize}
    </Directory>

    <FilesMatch \\.php$>
        SetHandler "proxy:unix:/run/php/php${domain.php_version}-fpm.sock|fcgi://localhost"
    </FilesMatch>
</VirtualHost>`;
}
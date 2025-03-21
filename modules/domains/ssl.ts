import { run, reloadService } from "../../utils/command.ts";
import { config } from "../../utils/config.ts";
import { logError, logInfo } from "../../utils/logger.ts";
import { ensureDir } from "https://deno.land/std/fs/mod.ts";
import db from "../../utils/database.ts";

export async function installSSL(domainId: number, certType: 'lets_encrypt' | 'custom' = 'lets_encrypt', certData?: { cert: string; key: string; chain: string }) {
  try {
    const domain = db.queryEntries('SELECT * FROM domains WHERE id = ?', [domainId])[0];
    if (!domain) throw new Error('Domain not found');

    const sslPath = `${config.ssl_cert_dir}/${domain.name}`;
    await ensureDir(sslPath);

    if (certType === 'lets_encrypt') {
      // Certbot für Let's Encrypt verwenden
      await run(`certbot certonly --webroot -w ${config.vhosts_root}/${domain.name}/httpdocs -d ${domain.name} -d www.${domain.name} --cert-path ${sslPath}`);
      
      // SSL in der Datenbank aktivieren
      db.query('UPDATE domains SET ssl_enabled = 1, ssl_type = ?, ssl_expires_at = ? WHERE id = ?',
        ['lets_encrypt', new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), domainId]);
    } 
    else if (certType === 'custom' && certData) {
      // Custom Zertifikate speichern
      await Deno.writeTextFile(`${sslPath}/cert.pem`, certData.cert);
      await Deno.writeTextFile(`${sslPath}/privkey.pem`, certData.key);
      await Deno.writeTextFile(`${sslPath}/chain.pem`, certData.chain);
      
      db.query('UPDATE domains SET ssl_enabled = 1, ssl_type = ? WHERE id = ?', ['custom', domainId]);
    }

    // Apache neu laden
    await reloadService('apache2');
    
    logInfo(`SSL certificate installed for ${domain.name}`, 'SSL');
    return { success: true };
  } catch (error) {
    logError(`Error installing SSL certificate: ${error.message}`, 'SSL');
    throw error;
  }
}

export async function removeSSL(domainId: number) {
  try {
    const domain = db.queryEntries('SELECT * FROM domains WHERE id = ?', [domainId])[0];
    if (!domain) throw new Error('Domain not found');

    const sslPath = `${config.ssl_cert_dir}/${domain.name}`;

    if (domain.ssl_type === 'lets_encrypt') {
      await run(`certbot delete --cert-name ${domain.name}`);
    }

    try {
      await Deno.remove(sslPath, { recursive: true });
    } catch {}

    db.query('UPDATE domains SET ssl_enabled = 0, ssl_type = NULL, ssl_expires_at = NULL WHERE id = ?', [domainId]);
    await run('systemctl reload apache2');

    logInfo(`SSL certificate removed for ${domain.name}`, 'SSL');
    return { success: true };
  } catch (error) {
    logError(`Error removing SSL certificate: ${error.message}`, 'SSL');
    throw error;
  }
}

export async function renewSSL(domainId: number) {
  try {
    const domain = db.queryEntries('SELECT * FROM domains WHERE id = ?', [domainId])[0];
    if (!domain) throw new Error('Domain not found');
    if (domain.ssl_type !== 'lets_encrypt') throw new Error('Domain not found or not using Let\'s Encrypt');

    await run('certbot', ['renew', '--cert-name', domain.name]);
    db.query('UPDATE domains SET ssl_expires_at = ? WHERE id = ?', [new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), domainId]);

    logInfo(`SSL certificate renewed for ${domain.name}`, 'SSL');
    return { success: true };
  } catch (error) {
    logError(`Error renewing SSL certificate: ${error.message}`, 'SSL');
    throw error;
  }
}
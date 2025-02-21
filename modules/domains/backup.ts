import { ensureDir } from "https://deno.land/std/fs/mod.ts";
import { runCommand } from "../../utils/command.ts";
import { config } from "../../utils/config.ts";
import { logError, logInfo } from "../../utils/logger.ts";
import db from "../../utils/database.ts";

interface BackupOptions {
  type: 'full' | 'incremental';
  includeFiles?: boolean;
  includeDatabases?: boolean;
  includeMailData?: boolean;
  includeConfigs?: boolean;
}

export async function createBackup(domainId: number, options: BackupOptions) {
  try {
    const domain = db.queryEntries('SELECT * FROM domains WHERE id = ?', [domainId])[0];
    if (!domain) throw new Error('Domain not found');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = `${config.backup_directory}/${domain.name}/${timestamp}`;
    await ensureDir(backupDir);

    const tasks = [];
    
    // Dateien sichern
    if (options.includeFiles !== false) {
      tasks.push(runCommand(`tar -czf ${backupDir}/files.tar.gz -C ${config.vhosts_root}/${domain.name} .`));
    }

    // Datenbanken sichern
    if (options.includeDatabases !== false) {
      const databases = db.queryEntries('SELECT * FROM databases WHERE dom_id = ?', [domainId]);
      for (const database of databases) {
        if (database.type === 'mysql') {
          tasks.push(runCommand(
            `mysqldump --single-transaction ${database.name} > ${backupDir}/${database.name}.sql`
          ));
        } else if (database.type === 'postgresql') {
          tasks.push(runCommand(
            `pg_dump ${database.name} > ${backupDir}/${database.name}.sql`
          ));
        }
      }
    }

    // Mail-Daten sichern
    if (options.includeMailData !== false) {
      const mailDir = `/var/mail/${domain.name}`;
      if (await Deno.stat(mailDir).catch(() => null)) {
        tasks.push(runCommand(`tar -czf ${backupDir}/mail.tar.gz -C ${mailDir} .`));
      }
    }

    // Konfigurationen sichern
    if (options.includeConfigs !== false) {
      tasks.push(runCommand(`tar -czf ${backupDir}/configs.tar.gz -C ${config.vhosts_root}/${domain.name}/conf .`));
    }

    // Alle Backup-Tasks ausführen
    await Promise.all(tasks);

    // Backup in Datenbank registrieren
    db.query(`
      INSERT INTO backups (domain_id, path, type, created_at) 
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `, [domainId, backupDir, options.type]);

    // Alte Backups bereinigen
    await cleanupOldBackups(domain.name);

    logInfo(`Backup created for ${domain.name}`, 'Backup');
    return { success: true, path: backupDir };
  } catch (error) {
    logError(`Error creating backup: ${error.message}`, 'Backup');
    throw error;
  }
}

export async function restoreBackup(domainId: number, backupPath: string, options: BackupOptions) {
  try {
    const domain = db.queryEntries('SELECT * FROM domains WHERE id = ?', [domainId])[0];
    if (!domain) throw new Error('Domain not found');

    // Domain temporär deaktivieren
    await runCommand(`a2dissite ${domain.name}`);
    await runCommand('systemctl reload apache2');

    // Dateien wiederherstellen
    if (options.includeFiles !== false) {
      await runCommand(`rm -rf ${config.vhosts_root}/${domain.name}/*`);
      await runCommand(`tar -xzf ${backupPath}/files.tar.gz -C ${config.vhosts_root}/${domain.name}`);
    }

    // Datenbanken wiederherstellen
    if (options.includeDatabases !== false) {
      const databases = db.queryEntries('SELECT * FROM databases WHERE dom_id = ?', [domainId]);
      for (const database of databases) {
        if (database.type === 'mysql') {
          await runCommand(`mysql ${database.name} < ${backupPath}/${database.name}.sql`);
        } else if (database.type === 'postgresql') {
          await runCommand(`psql ${database.name} < ${backupPath}/${database.name}.sql`);
        }
      }
    }

    // Mail-Daten wiederherstellen
    if (options.includeMailData !== false && await Deno.stat(`${backupPath}/mail.tar.gz`).catch(() => null)) {
      const mailDir = `/var/mail/${domain.name}`;
      await ensureDir(mailDir);
      await runCommand(`tar -xzf ${backupPath}/mail.tar.gz -C ${mailDir}`);
    }

    // Konfigurationen wiederherstellen
    if (options.includeConfigs !== false) {
      await runCommand(`tar -xzf ${backupPath}/configs.tar.gz -C ${config.vhosts_root}/${domain.name}/conf`);
    }

    // Domain wieder aktivieren
    await runCommand(`a2ensite ${domain.name}`);
    await runCommand('systemctl reload apache2');

    logInfo(`Backup restored for ${domain.name}`, 'Backup');
    return { success: true };
  } catch (error) {
    logError(`Error restoring backup: ${error.message}`, 'Backup');
    throw error;
  }
}

async function cleanupOldBackups(domainName: string) {
  try {
    const maxAge = config.backup_keep_days * 24 * 60 * 60 * 1000;
    const backupDir = `${config.backup_directory}/${domainName}`;
    
    for await (const entry of Deno.readDir(backupDir)) {
      if (!entry.isDirectory) continue;
      
      const path = `${backupDir}/${entry.name}`;
      const stat = await Deno.stat(path);
      
      if (Date.now() - stat.mtime!.getTime() > maxAge) {
        await Deno.remove(path, { recursive: true });
        db.query('DELETE FROM backups WHERE path = ?', [path]);
      }
    }
  } catch (error) {
    logError(`Error cleaning up old backups: ${error.message}`, 'Backup');
  }
}
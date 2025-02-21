import { runCommand } from "../../utils/command.ts";
import { config } from "../../utils/config.ts";
import { logError, logInfo } from "../../utils/logger.ts";
import db from "../../utils/database.ts";

interface DatabaseOptions {
  name: string;
  type: 'mysql' | 'postgresql';
  dom_id: number;
  charset?: string;
  collation?: string;
}

export async function createDatabase(options: DatabaseOptions) {
  try {
    const domain = db.queryEntries('SELECT * FROM domains WHERE id = ?', [options.dom_id])[0];
    if (!domain) throw new Error('Domain not found');

    // Überprüfe Datenbank-Limit
    const dbCount = db.queryEntries<{count: number}>(
      'SELECT COUNT(*) as count FROM databases WHERE dom_id = ?', 
      [options.dom_id]
    )[0].count;

    if (dbCount >= config.max_databases_per_domain) {
      throw new Error('Database limit reached for this domain');
    }

    // Datenbankname mit Domain-Präfix
    const dbName = `${domain.name.replace(/[^a-z0-9]/g, '_')}_${options.name}`;
    const dbUser = `${dbName}_user`;
    const dbPass = crypto.randomUUID();

    if (options.type === 'mysql') {
      await runCommand(`mysql -e "CREATE DATABASE \\\`${dbName}\\\` ${options.charset ? `CHARACTER SET ${options.charset}` : ''} ${options.collation ? `COLLATE ${options.collation}` : ''}"`);
      await runCommand(`mysql -e "CREATE USER '${dbUser}'@'localhost' IDENTIFIED BY '${dbPass}'"`);
      await runCommand(`mysql -e "GRANT ALL PRIVILEGES ON \\\`${dbName}\\\`.* TO '${dbUser}'@'localhost'"`);
      await runCommand('mysql -e "FLUSH PRIVILEGES"');
    } 
    else if (options.type === 'postgresql') {
      await runCommand(`createuser ${dbUser}`);
      await runCommand(`psql -c "ALTER USER ${dbUser} WITH PASSWORD '${dbPass}'"`);
      await runCommand(`createdb -O ${dbUser} ${dbName} ${options.charset ? `LC_CTYPE='${options.charset}'` : ''}`);
    }

    // In Datenbank speichern
    db.query(`
      INSERT INTO databases (dom_id, name, type, db_user, db_pass)
      VALUES (?, ?, ?, ?, ?)
    `, [options.dom_id, dbName, options.type, dbUser, dbPass]);

    logInfo(`Database ${dbName} created for domain ${domain.name}`, 'Databases');
    return { success: true, database: { name: dbName, user: dbUser, password: dbPass } };
  } catch (error) {
    logError(`Error creating database: ${error.message}`, 'Databases');
    throw error;
  }
}

export async function deleteDatabase(databaseId: number) {
  try {
    const database = db.queryEntries('SELECT * FROM databases WHERE id = ?', [databaseId])[0];
    if (!database) throw new Error('Database not found');

    if (database.type === 'mysql') {
      await runCommand(`mysql -e "DROP DATABASE IF EXISTS \\\`${database.name}\\\`"`);
      await runCommand(`mysql -e "DROP USER IF EXISTS '${database.db_user}'@'localhost'"`);
      await runCommand('mysql -e "FLUSH PRIVILEGES"');
    } 
    else if (database.type === 'postgresql') {
      await runCommand(`dropdb ${database.name}`);
      await runCommand(`dropuser ${database.db_user}`);
    }

    db.query('DELETE FROM databases WHERE id = ?', [databaseId]);
    
    logInfo(`Database ${database.name} deleted`, 'Databases');
    return { success: true };
  } catch (error) {
    logError(`Error deleting database: ${error.message}`, 'Databases');
    throw error;
  }
}

export async function changePassword(databaseId: number, newPassword: string) {
  try {
    const database = db.queryEntries('SELECT * FROM databases WHERE id = ?', [databaseId])[0];
    if (!database) throw new Error('Database not found');

    if (database.type === 'mysql') {
      await runCommand(`mysql -e "ALTER USER '${database.db_user}'@'localhost' IDENTIFIED BY '${newPassword}'"`);
      await runCommand('mysql -e "FLUSH PRIVILEGES"');
    } 
    else if (database.type === 'postgresql') {
      await runCommand(`psql -c "ALTER USER ${database.db_user} WITH PASSWORD '${newPassword}'"`);
    }

    db.query('UPDATE databases SET db_pass = ? WHERE id = ?', [newPassword, databaseId]);
    
    logInfo(`Password changed for database user ${database.db_user}`, 'Databases');
    return { success: true };
  } catch (error) {
    logError(`Error changing database password: ${error.message}`, 'Databases');
    throw error;
  }
}

export async function getDatabaseStats(databaseId: number) {
  try {
    const database = db.queryEntries('SELECT * FROM databases WHERE id = ?', [databaseId])[0];
    if (!database) throw new Error('Database not found');

    let size = 0;
    let tables = 0;

    if (database.type === 'mysql') {
      const result = await runCommand(`mysql -N -e "
        SELECT 
          ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) as size,
          COUNT(*) as tables
        FROM information_schema.tables 
        WHERE table_schema = '${database.name}'
      "`);
      const [dbSize, tableCount] = result.stdout.trim().split('\t');
      size = parseFloat(dbSize);
      tables = parseInt(tableCount);
    } 
    else if (database.type === 'postgresql') {
      const result = await runCommand(`psql -t -A -c "
        SELECT 
          pg_size_pretty(pg_database_size('${database.name}')) as size,
          (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public') as tables
        FROM pg_database 
        WHERE datname = '${database.name}'
      "`);
      const [dbSize, tableCount] = result.stdout.trim().split('|');
      size = parseFloat(dbSize);
      tables = parseInt(tableCount);
    }

    return { 
      name: database.name,
      type: database.type,
      size,
      tables,
      user: database.db_user
    };
  } catch (error) {
    logError(`Error getting database stats: ${error.message}`, 'Databases');
    throw error;
  }
}
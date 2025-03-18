import { Context } from "hono";
import { logInfo, logError } from "../../utils/logger.ts";
import db from "../../utils/database.ts";
import { run } from "../../utils/command.ts";
import { config } from "../../utils/config.ts";
import { dbClient } from "../database_servers/dbClient.ts";


export const api = {
  get: async function() {
    const databases = db.queryEntries(`
      SELECT d.*, dom.name as domain_name,
             s.host, s.port, s.type as server_type
      FROM databases d
      LEFT JOIN domains dom ON d.dom_id = dom.id
      LEFT JOIN database_servers s ON d.server_id = s.id
    `);
    
    // get size (MB) and table count of databases:
    /* too slow, cache or load on demand
    for (const database of databases) {
      try {
        const client = await dbClient(database.server_id);
        
        if (database.type === 'mysql') {
          const result = await client.execute(`
            SELECT 
              SUM(data_length + index_length) as size,
              COUNT(*) as tables
            FROM information_schema.tables 
            WHERE table_schema = ?
          `, [database.name]);
          database.size = result.rows[0]?.size;
          database.tables = result.rows[0]?.tables
        } 
        else if (database.type === 'postgresql') {
          const sizeResult = await client.queryObject(`
            SELECT pg_database_size($1)::float / 1024 / 1024 as size
            FROM pg_database 
            WHERE datname = $1
          `, [database.name]);
          
          const tableResult = await client.queryObject(`
            SELECT COUNT(*) as tables 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            AND table_type = 'BASE TABLE'
          `);

          database.size = sizeResult.rows[0]?.size;
          database.tables = tableResult.rows[0].tables;
        }
      } catch (error) {
        console.error(error);
        database.size = null;
        // Wir setzen keine tables-Property wenn es einen Fehler gab
      }
    }
    */
    return databases;
  },
  post: async function(c: Context) {
    const data = await c.req.json();
    
    try {
      const domain = db.queryEntries('SELECT * FROM domains WHERE id = ?', [data.dom_id])[0];
      if (!domain) {
        return { error: 'Domain nicht gefunden' };
      }

      const server = db.queryEntries('SELECT * FROM database_servers WHERE id = ?', [data.server_id])[0];
      if (!server) {
        return { error: 'Datenbankserver nicht gefunden' };
      }

      // Überprüfe Datenbank-Limit
      const dbCount = db.queryEntries<{count: number}>(
        'SELECT COUNT(*) as count FROM databases WHERE dom_id = ?', 
        [data.dom_id]
      )[0].count;

      // Datenbankname mit Domain-Präfix
      const dbName = `domain${domain.id}_${data.name}`;
      const dbUser = `${dbName}_user`;
      const dbPass = crypto.randomUUID();

      const client = await dbClient(server.id);

      if (server.type === 'mysql') {
        await client.execute(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
        await client.execute(`CREATE USER IF NOT EXISTS '${dbUser}'@'%' IDENTIFIED BY ?`, [dbPass]);
        await client.execute(`GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${dbUser}'@'%'`);
        await client.execute('FLUSH PRIVILEGES');
      } 
      else if (server.type === 'postgresql') {
        await client.queryObject(`CREATE DATABASE ${dbName}`);
        await client.queryObject(`CREATE USER ${dbUser} WITH PASSWORD $1`, [dbPass]);
        await client.queryObject(`GRANT ALL PRIVILEGES ON DATABASE ${dbName} TO ${dbUser}`);
      }

      // In Datenbank speichern
      db.query(`
        INSERT INTO databases (dom_id, server_id, name, type, db_user, db_pass)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [data.dom_id, data.server_id, dbName, server.type, dbUser, dbPass]);

      logInfo(`Datenbank ${dbName} für Domain ${domain.name} erstellt`, 'Databases', c);
      return { success: true, database: { name: dbName, user: dbUser, password: dbPass } };
    } catch (error) {
      logError(`Fehler beim Erstellen der Datenbank: ${error.message}`, 'Databases', c, error);
      return { error: error.message };
    }
  },
  ':id': {
    get: async function(c: Context) {
      const { id } = c.req.param();
      
      try {
        const database = db.queryEntries(`
          SELECT d.*, dom.name as domain_name,
                 s.host, s.port, s.type as server_type, s.id as server_id
          FROM databases d
          LEFT JOIN domains dom ON d.dom_id = dom.id
          LEFT JOIN database_servers s ON d.server_id = s.id
          WHERE d.id = ?
        `, [id])[0];

        if (!database) {
          return { error: "Datenbank nicht gefunden" };
        }

        // Statistiken und Version abrufen
        let stats = { size: 0, tables: 0, version: null };
        const client = await dbClient(database.server_id);
        
        if (database.type === 'mysql') {
          const [statsResult, versionResult] = await Promise.all([
            client.execute(`
              SELECT 
                ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) as size,
                COUNT(*) as tables
              FROM information_schema.tables 
              WHERE table_schema = ?
            `, [database.name]),
            client.execute('SELECT VERSION() as version')
          ]);
          
          stats = {
            size: parseFloat(statsResult.rows[0]?.size || '0'),
            tables: parseInt(statsResult.rows[0]?.tables || '0'),
            version: versionResult.rows[0]?.version?.split('-')[0] || null
          };
        } 
        else if (database.type === 'postgresql') {
          const [statsResult, versionResult] = await Promise.all([
            client.queryObject(`
              SELECT 
                pg_database_size($1)::float / 1024 / 1024 as size,
                (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public') as tables
              FROM pg_database 
              WHERE datname = $1
            `, [database.name]),
            client.queryObject('SHOW server_version')
          ]);
          
          stats = {
            size: parseFloat(statsResult.rows[0].size || '0'),
            tables: parseInt(statsResult.rows[0].tables || '0'),
            version: versionResult.rows[0].server_version || null
          };
        }

        return { ...database, ...stats };
      } catch (error) {
        logError(`Fehler beim Abrufen der Datenbank-Details: ${error.message}`, 'Databases', c, error);
        return { error: error.message };
      }
    },
    delete: async function(c: Context) {
      const { id } = c.req.param();
      
      try {
        const database = db.queryEntries('SELECT * FROM databases WHERE id = ?', [id])[0];
        if (!database) return { error: 'Datenbank nicht gefunden' };
        const client = await dbClient(database.server_id);
        if (database.type === 'mysql') {
          await client.execute(`DROP DATABASE IF EXISTS \`${database.name}\``);
          await client.execute(`DROP USER IF EXISTS '${database.db_user}'@'%'`);
          await client.execute('FLUSH PRIVILEGES');
        } 
        if (database.type === 'postgresql') {
          // We need to connect to a different database to drop the current one
          await client.queryObject(`
            SELECT pg_terminate_backend(pid) 
            FROM pg_stat_activity 
            WHERE datname = $1
          `, [database.name]);
          await client.queryObject(`DROP DATABASE IF EXISTS ${database.name}`);
          await client.queryObject(`DROP USER IF EXISTS ${database.db_user}`);
        }
        logInfo(`Datenbank ${database.name} gelöscht`, 'Databases', c);
      } catch (error) {
        logError(`Fehler beim Löschen der Datenbank: ${error.message}`, 'Databases', c, error);
      }
      db.query('DELETE FROM databases WHERE id = ?', [id]);
      return { success: true };
    },
    'password': {
      post: async function(c: Context) {
        const { id } = c.req.param();
        const { password } = await c.req.json();
        
        try {
          const database = db.queryEntries('SELECT * FROM databases WHERE id = ?', [id])[0];
          if (!database) {
            return { error: 'Datenbank nicht gefunden' };
          }

          const client = await dbClient(database.server_id);

          if (database.type === 'mysql') {
            await client.execute(`ALTER USER '${database.db_user}'@'%' IDENTIFIED BY ?`, [password]);
            await client.execute('FLUSH PRIVILEGES');
          } 
          else if (database.type === 'postgresql') {
            await client.queryObject(`ALTER USER ${database.db_user} WITH PASSWORD $1`, [password]);
          }

          db.query('UPDATE databases SET db_pass = ? WHERE id = ?', [password, id]);
          
          logInfo(`Passwort für Datenbankbenutzer ${database.db_user} geändert`, 'Databases', c);
          return { success: true };
        } catch (error) {
          logError(`Fehler beim Ändern des Datenbank-Passworts: ${error.message}`, 'Databases', c, error);
          return { error: error.message };
        }
      }
    },
    'copy': {
      post: async function(c: Context) {
        const { id } = c.req.param();
        const { name } = await c.req.json();
        
        try {
          const database = db.queryEntries('SELECT * FROM databases WHERE id = ?', [id])[0];
          if (!database) return { error: 'Datenbank nicht gefunden' };

          const client = await dbClient(database.server_id);
          const newName = name;
          const newUser = newName;
          const newPass = crypto.randomUUID();

          if (database.type === 'mysql') {

            await client.execute(`CREATE DATABASE \`${newName}\``);
            await client.execute('CREATE USER ?@\'%\' IDENTIFIED BY ?', [newUser, newPass]);
            await client.execute('GRANT ALL PRIVILEGES ON ??.* TO ?@\'%\'', [newName, newUser]);
            await client.execute('FLUSH PRIVILEGES');

            // Copy data
            if (Deno.build.os !== 'windows') {
              //await run(`mysqldump -h ${database.host} -P ${database.port} -u ${database.username} -p${database.password} ${database.name} | mysql -h ${database.host} -P ${database.port} -u ${database.username} -p${database.password} ${newName}`);
              //await run('sh', ['-c', `mysqldump -h ${database.host} -P ${database.port} -u ${database.username} -p${database.password} ${database.name} | mysql -h ${database.host} -P ${database.port} -u ${database.username} -p${database.password} ${newName}`]);
              const out = await run('sh', ['-c', `mysqldump -h ${database.host} -P ${database.port} -u ${database.username} ${database.name} | mysql -h ${database.host} -P ${database.port} -u ${database.username} ${newName}`]);
              console.log(out);
            } else {
              const out = await run('cmd', ['/c', `mysqldump -h ${database.host} -P ${database.port} -u ${database.username} ${database.name} | mysql -h ${database.host} -P ${database.port} -u ${database.username} ${newName}`]);
              console.log(out);
            }
          } else if (database.type === 'postgresql') {
            // Create new database and user
            await client.queryObject(`CREATE DATABASE ${newName}`);
            await client.queryObject(`CREATE USER ${newUser} WITH PASSWORD '${newPass}'`);
            await client.queryObject(`GRANT ALL PRIVILEGES ON DATABASE ${newName} TO ${newUser}`);
            
            // Copy data
            await run(`PGPASSWORD=${database.password} pg_dump -h ${database.host} -p ${database.port} -U ${database.username} ${database.name} | PGPASSWORD=${database.password} psql -h ${database.host} -p ${database.port} -U ${database.username} ${newName}`);
          }

          // Save in database
          db.query(`
            INSERT INTO databases (server_id, name, type, db_user, db_pass)
            VALUES (?, ?, ?, ?, ?)
          `, [database.server_id, newName, database.type, newUser, newPass]);

          logInfo(`Datenbank ${database.name} nach ${newName} kopiert`, 'Databases', c);
          return { success: true };
        } catch (error) {
          logError(`Fehler beim Kopieren der Datenbank: ${error.message}`, 'Databases', c, error);
          return { error: error.message };
        }
      }
    },
    'export': {
      get: async function(c: Context) {
        const { id } = c.req.param();
        
        try {
          const database = db.queryEntries('SELECT * FROM databases WHERE id = ?', [id])[0];
          if (!database) {
            return { error: 'Datenbank nicht gefunden' };
          }

          // Create temporary file for dump
          const tmpFile = await Deno.makeTempFile({ suffix: '.sql' });

          if (database.type === 'mysql') {
            await run(`mysqldump -h ${database.host} -P ${database.port} -u ${database.username} -p${database.password} ${database.name} > ${tmpFile}`);
          } 
          else if (database.type === 'postgresql') {
            await run(`PGPASSWORD=${database.password} pg_dump -h ${database.host} -p ${database.port} -U ${database.username} ${database.name} > ${tmpFile}`);
          }

          // Read file and clean up
          const content = await Deno.readFile(tmpFile);
          await Deno.remove(tmpFile);

          // Set response headers
          c.header('Content-Type', 'application/sql');
          c.header('Content-Disposition', `attachment; filename=${database.name}_${new Date().toISOString().split('T')[0]}.sql`);
          
          return c.body(content);
        } catch (error) {
          logError(`Fehler beim Exportieren der Datenbank: ${error.message}`, 'Databases', c, error);
          return { error: error.message };
        }
      }
    },
    'import': {
      post: async function(c: Context) {
        const { id } = c.req.param();
        
        try {
          const database = db.queryEntries('SELECT * FROM databases WHERE id = ?', [id])[0];
          if (!database) {
            return { error: 'Datenbank nicht gefunden' };
          }

          const formData = await c.req.formData();
          const file = formData.get('file');
          if (!file || !(file instanceof File)) {
            return { error: 'Keine SQL-Datei gefunden' };
          }

          // Save uploaded file temporarily
          const tmpFile = await Deno.makeTempFile({ suffix: '.sql' });
          await Deno.writeFile(tmpFile, new Uint8Array(await file.arrayBuffer()));

          if (database.type === 'mysql') {
            await run(`mysql -h ${database.host} -P ${database.port} -u ${database.username} -p${database.password} ${database.name} < ${tmpFile}`);
          } 
          else if (database.type === 'postgresql') {
            await run(`PGPASSWORD=${database.password} psql -h ${database.host} -p ${database.port} -U ${database.username} ${database.name} < ${tmpFile}`);
          }

          // Clean up
          await Deno.remove(tmpFile);

          logInfo(`SQL-Datei in Datenbank ${database.name} importiert`, 'Databases', c);
          return { success: true };
        } catch (error) {
          logError(`Fehler beim Importieren der SQL-Datei: ${error.message}`, 'Databases', c, error);
          return { error: error.message };
        }
      }
    },
    'check': {
      post: async function(c: Context) {
        const { id } = c.req.param();
        
        try {
          const database = db.queryEntries('SELECT * FROM databases WHERE id = ?', [id])[0];
          if (!database) {
            return { error: 'Datenbank nicht gefunden' };
          }

          const client = await dbClient(database.server_id);
          let message = 'Datenbank-Check abgeschlossen';

          if (database.type === 'mysql') {
            const tables = await client.execute('SHOW TABLES FROM ??', [database.name]);
            for (const row of tables) {
              const tableName = row[`Tables_in_${database.name}`];
              await client.execute('CHECK TABLE ?? EXTENDED', [tableName]);
            }
          } 
          else if (database.type === 'postgresql') {
            await client.queryObject('ANALYZE VERBOSE');
            message = 'Datenbank-Analyse abgeschlossen';
          }

          logInfo(`Check für Datenbank ${database.name} durchgeführt`, 'Databases', c);
          return { success: true, message };
        } catch (error) {
          logError(`Fehler beim Prüfen der Datenbank: ${error.message}`, 'Databases', c, error);
          return { error: error.message };
        }
      }
    },
    'optimize': {
      post: async function(c: Context) {
        const { id } = c.req.param();
        
        try {
          const database = db.queryEntries('SELECT * FROM databases WHERE id = ?', [id])[0];
          if (!database) {
            return { error: 'Datenbank nicht gefunden' };
          }

          const client = await dbClient(database.server_id);

          if (database.type === 'mysql') {
            await client.execute('USE ??', [database.name]);

            // kleinere zuerst
            const tables = await client.execute(`
              SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA = ? ORDER BY DATA_LENGTH + INDEX_LENGTH
            `, [database.name]);

            for (const row of tables.rows) {
              const tableName = row['TABLE_NAME'];
              console.log(`Optimizing table ${tableName}`);
              await client.execute('OPTIMIZE TABLE ??', [tableName]);
            }
          } 
          else if (database.type === 'postgresql') {
            await client.queryObject('VACUUM ANALYZE');
          }

          logInfo(`Optimierung für Datenbank ${database.name} durchgeführt`, 'Databases', c);
          return { success: true };
        } catch (error) {
          logError(`Fehler bei der Datenbank-Optimierung: ${error.message}`, 'Databases', c, error);
          return { error: error.message };
        }
      }
    },
    'tables': {
      get: async function(c: Context) {
        const { id } = c.req.param();
        
        try {
          const database = db.queryEntries('SELECT * FROM databases WHERE id = ?', [id])[0];
          if (!database) {
            return { error: 'Datenbank nicht gefunden' };
          }

          const client = await dbClient(database.server_id);
          let tables = [];

          if (database.type === 'mysql') {
            const result = await client.execute(`
              SELECT 
                TABLE_NAME as name,
                TABLE_ROWS as \`rows\`,
                ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024, 2) as size,
                ENGINE as engine,
                TABLE_COLLATION as encoding
              FROM information_schema.TABLES
              WHERE TABLE_SCHEMA = ?
            `, [database.name]);
            tables = result.rows;
          } 
          else if (database.type === 'postgresql') {
            const result = await client.queryObject(`
              SELECT 
                t.tablename as name,
                n.n_live_tup as rows,
                pg_total_relation_size(quote_ident(t.tablename))::float / 1024 / 1024 as size,
                'PostgreSQL' as engine,
                COALESCE(collname, current_setting('server_encoding')) as encoding
              FROM pg_tables t
              LEFT JOIN pg_class c ON c.relname = t.tablename
              LEFT JOIN pg_collation l ON l.oid = c.relcollation
              LEFT JOIN pg_stat_user_tables n ON n.relname = t.tablename
              WHERE t.schemaname = 'public'
            `);
            tables = result.rows;
          }

          return tables;
        } catch (error) {
          logError(`Fehler beim Abrufen der Tabellen: ${error.message}`, 'Databases', c, error);
          return { error: error.message };
        }
      },
      ':table': {
        get: async function(c: Context) {
          const { id, table } = c.req.param();
          
          try {
            const database = db.queryEntries('SELECT * FROM databases WHERE id = ?', [id])[0];
            if (!database) {
              return { error: 'Datenbank nicht gefunden' };
            }

            const client = await dbClient(database.server_id);
            let columns = [], indexes = [];

            if (database.type === 'mysql') {
              columns = await client.execute(`
                SELECT 
                  COLUMN_NAME as name,
                  COLUMN_TYPE as type,
                  IS_NULLABLE as nullable,
                  COLUMN_DEFAULT as default_value,
                  EXTRA as extra
                FROM information_schema.COLUMNS 
                WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
              `, [database.name, table]);

              indexes = await client.execute(`
                SELECT 
                  INDEX_NAME as name,
                  GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) as columns,
                  INDEX_TYPE as type
                FROM information_schema.STATISTICS
                WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
                GROUP BY INDEX_NAME, INDEX_TYPE
              `, [database.name, table]);
            } 
            else if (database.type === 'postgresql') {
              const columnsResult = await client.queryObject(`
                SELECT 
                  a.attname as name,
                  pg_catalog.format_type(a.atttypid, a.atttypmod) as type,
                  CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END as nullable,
                  pg_get_expr(d.adbin, d.adrelid) as default_value,
                  '' as extra
                FROM pg_catalog.pg_attribute a
                LEFT JOIN pg_catalog.pg_attrdef d ON (a.attrelid, a.attnum) = (d.adrelid, d.adnum)
                WHERE a.attnum > 0 
                  AND NOT a.attisdropped
                  AND a.attrelid = quote_ident($1)::regclass
              `, [table]);
              columns = columnsResult.rows;

              const indexesResult = await client.queryObject(`
                SELECT
                  i.relname as name,
                  string_agg(a.attname, ', ' ORDER BY c.ordinality) as columns,
                  CASE 
                    WHEN am.amname = 'btree' AND idx.indisunique THEN 'UNIQUE'
                    ELSE am.amname
                  END as type
                FROM pg_index idx
                JOIN pg_class i ON i.oid = idx.indexrelid
                JOIN pg_class t ON t.oid = idx.indrelid
                JOIN pg_am am ON am.oid = i.relam
                JOIN pg_attribute a ON a.attrelid = t.oid
                JOIN unnest(idx.indkey) WITH ORDINALITY c(colnum, ordinality) ON a.attnum = c.colnum
                WHERE t.relname = $1
                GROUP BY i.relname, am.amname, idx.indisunique
              `, [table]);
              indexes = indexesResult.rows;
            }

            return { columns, indexes };
          } catch (error) {
            logError(`Fehler beim Abrufen der Tabellendetails: ${error.message}`, 'Databases', c, error);
            return { error: error.message };
          }
        }
      }
    }
  }
};
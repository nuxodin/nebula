import { Context } from "hono";
import { logInfo, logError } from "../../utils/logger.ts";
import { renderTemplate } from "../../utils/template.ts";
import db from "../../utils/database.ts";
import { dbClient, getServerDatabases, getServerProcesses, killProcess } from "./dbClient.ts";

// View Controllers
export const getDatabaseServersView = async (c: Context) => {
  try {
    const content = await Deno.readTextFile("./modules/database_servers/views/content.html");
    const scripts = await Deno.readTextFile("./modules/database_servers/views/scripts.html");
    return c.html(await renderTemplate("Datenbankserver", content, '', scripts));
  } catch (err) {
    logError("Fehler beim Laden der Datenbankserver-Übersicht", "Database Servers", c, err);
    return c.text("Internal Server Error", 500);
  }
};

export const getDbServerDetailView = async (c: Context) => {
  try {
    const content = await Deno.readTextFile("./modules/database_servers/views/detail/content.html");
    const scripts = await Deno.readTextFile("./modules/database_servers/views/detail/scripts.html");
    return c.html(await renderTemplate("Database Server Details", content, "", scripts));
  } catch (error) {
    if (error instanceof Error) {
      logError("Fehler beim Laden der Datenbankserver-Details", "Database Servers", c, error);
    }
    return c.text("Internal Server Error", 500);
  }
};

// API Controllers
export const api = {
  get: async function() {
    const servers = await db.queryEntries('SELECT * FROM database_servers');

    for (const server of servers) {
      try {
        const client = await dbClient(server.id);
        
        if (server.type === 'mysql') {
          const result = await client.execute('SELECT VERSION() as version');
          server.version = result.rows[0]?.version?.split('-')[0];
          const dbResult = await client.execute('SHOW DATABASES');
          server.count_databases = dbResult.length;
        }
        if (server.type === 'postgresql') {
          const version = await client.queryObject('SHOW server_version');
          server.version = version.rows[0]?.server_version;
          const dbResult = await client.queryObject('SELECT datname FROM pg_database WHERE datistemplate = false');
          server.count_databases = dbResult.rows.length;
        }
      } catch (error) {
        //console.error(error);
        server.count_databases = null;
        server.version = 'nicht verbunden';
      }
    }
    return servers;
  },
  post: async function(c: Context) {
    const data = await c.req.json();
    try {
      db.query(
        'INSERT INTO database_servers (host, port, type, admin_login, admin_password) VALUES (?, ?, ?, ?, ?)',
        [data.host, data.port, data.type, data.admin_login, data.admin_password]
      );
      logInfo(`Datenbankserver ${data.host}:${data.port} hinzugefügt`, 'Database Servers', c);
      return { success: true };
    } catch (error) {
      logError(`Fehler beim Hinzufügen des Datenbankservers: ${error.message}`, 'Database Servers', c, error);
      return { error: error.message };
    }
  },
  ':id': {
    get: async function(c: Context) {
      const { id } = c.req.param();
      
      const server = db.queryEntries(`
        SELECT * FROM database_servers WHERE id = ?
      `, [id])[0];

      if (!server) {
        return c.json({ error: 'Server nicht gefunden' }, 404);
      }

      try {
        const client = await dbClient(server.id);
        
        if (server.type === 'mysql') {
          const result = await client.execute('SELECT VERSION() as version');
          server.version = result.rows[0]?.version?.split('-')[0];
        }
        else if (server.type === 'postgresql') {
          const version = await client.queryObject('SHOW server_version');
          server.version = version.rows[0]?.server_version;
        }

        // Get managed and unmanaged databases
        const databases = await getServerDatabases(server);
        
        // Get current processes
        const processes = await getServerProcesses(server);

        return {
          ...server,
          databases,
          processes
        };

      } catch (error) {
        console.error(error);
        server.version = 'Nicht verbunden';
        return {
          ...server,
          databases: [],
          processes: []
        };
      }
    },
    delete: async function(c: Context) {
      const { id } = c.req.param();
      
      try {
        const server = db.queryEntries('SELECT * FROM database_servers WHERE id = ?', [id])[0];
        if (!server) {
          return { error: 'Server nicht gefunden' };
        }

        const databases = db.queryEntries('SELECT id FROM databases WHERE server_id = ?', [id]);
        if (databases.length > 0) {
          return { error: 'Server hat noch aktive Datenbanken und kann nicht gelöscht werden' };
        }

        db.query('DELETE FROM database_servers WHERE id = ?', [id]);
        
        logInfo(`Datenbankserver ${server.host}:${server.port} gelöscht`, 'Database Servers', c);
        return { success: true };
      } catch (error) {
        logError(`Fehler beim Löschen des Datenbankservers: ${error.message}`, 'Database Servers', c, error);
        return { error: error.message };
      }
    },
    'import': {
      post: async function(c: Context) {
        const { id } = c.req.param();
        
        try {
          const server = db.queryEntries('SELECT * FROM database_servers WHERE id = ?', [id])[0];
          if (!server) {
            return { error: 'Server nicht gefunden' };
          }

          // Get existing managed databases
          const managedDbs = db.queryEntries('SELECT name FROM databases WHERE server_id = ?', [id]);
          const managedNames = new Set(managedDbs.map(db => db.name));

          // Get all databases from server
          let newDatabases = [];
          const client = await dbClient(server.id);

          if (server.type === 'mysql') {
            const results = await client.execute(`
              SELECT 
                SCHEMA_NAME as name,
                GROUP_CONCAT(DISTINCT USER) as users
              FROM information_schema.SCHEMATA
              LEFT JOIN mysql.db ON SCHEMA_NAME = Db
              WHERE SCHEMA_NAME NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
              GROUP BY SCHEMA_NAME
            `);
            
            for (const row of results.rows) {
              if (!managedNames.has(row.name)) {
                const dbUser = row.users?.split(',')[0]?.split('@')[0] || `${row.name}_user`;
                newDatabases.push({ name: row.name, db_user: dbUser });
              }
            }
          } else if (server.type === 'postgresql') {
            const result = await client.queryObject(`
              SELECT datname as name, rolname as owner 
              FROM pg_database d 
              JOIN pg_roles r ON d.datdba = r.oid
              WHERE datistemplate = false 
              AND datname != 'postgres'
            `);
            
            for (const row of result.rows) {
              if (!managedNames.has(row.name)) {
                newDatabases.push({ name: row.name, db_user: row.owner });
              }
            }
          }

          // Import new databases
          for (const database of newDatabases) {
            db.query(`
              INSERT INTO databases (server_id, name, type, db_user)
              VALUES (?, ?, ?, ?)
            `, [id, database.name, server.type, database.db_user]);
          }

          logInfo(`${newDatabases.length} Datenbanken von Server ${server.host}:${server.port} importiert`, 'Database Servers', c);
          return { success: true, imported: newDatabases.length };
        } catch (error) {
          logError(`Fehler beim Importieren der Datenbanken: ${error.message}`, 'Database Servers', c, error);
          return { error: error.message };
        }
      }
    },
    'processes': {
      delete: async function(c: Context) {
        const { id } = c.req.param();
        const data = await c.req.json();

        const server = db.queryEntries(`
          SELECT * FROM database_servers WHERE id = ?
        `, [id])[0];

        if (!server) {
          return c.json({ error: 'Server nicht gefunden' }, 404);
        }

        try {
          await killProcess(server, data.processId);
          return { success: true };
        } catch (error) {
          if (error instanceof Error) {
            return c.json({ error: error.message }, 500);
          }
          return c.json({ error: 'Unknown error' }, 500);
        }
      }
    }
  }
};
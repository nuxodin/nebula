import { Client } from "https://deno.land/x/mysql/mod.ts";
import { Pool } from "https://deno.land/x/postgres/mod.ts";
import db from "../../utils/database.ts";

const clients = new Map();

export async function dbClient(serverId: number) {
    if (clients.has(serverId)) {
        return clients.get(serverId);
    }

    const server = db.queryEntries('SELECT * FROM database_servers WHERE id = ?', [serverId])[0];
    if (!server) throw new Error('Server nicht gefunden');

    let client;
    if (server.type === 'mysql') {
        client = await new Client().connect({
            hostname: server.host,
            port: server.port,
            username: server.admin_login,
            password: server.admin_password,
        });
    } else if (server.type === 'postgresql') {
        const pool = new Pool({
            hostname: server.host,
            port: server.port,
            user: server.admin_login,
            password: server.admin_password,
            database: 'postgres',
        }, 1);
        client = await pool.connect();
    }

    clients.set(serverId, client);
    return client;
}

export async function getServerDatabases(server: any) {
    const client = await dbClient(server.id);
    const managedDbs = new Set(db.queryEntries('SELECT name FROM databases WHERE server_id = ?', [server.id]).map(db => db.name));
    let databases = [];

    if (server.type === 'mysql') {
        // Hole Datenbanken mit Benutzer und Tabellenanzahl
        const results = await client.execute(`
            SELECT 
                s.SCHEMA_NAME as name,
                GROUP_CONCAT(DISTINCT d.USER) as users,
                COUNT(t.TABLE_NAME) as table_count
            FROM information_schema.SCHEMATA s
            LEFT JOIN mysql.db d ON s.SCHEMA_NAME = d.Db
            LEFT JOIN information_schema.TABLES t ON s.SCHEMA_NAME = t.TABLE_SCHEMA
            WHERE s.SCHEMA_NAME NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
            GROUP BY s.SCHEMA_NAME
        `);
        
        databases = results.rows.map(row => ({
            name: row.name,
            db_user: row.users?.split(',')[0]?.split('@')[0] || `${row.name}_user`,
            managed: managedDbs.has(row.name),
            tables: parseInt(row.table_count) || 0
        }));
    } else if (server.type === 'postgresql') {
        const result = await client.queryObject(`
            SELECT 
                d.datname as name, 
                r.rolname as owner,
                (SELECT COUNT(*) FROM information_schema.tables 
                 WHERE table_schema = 'public' 
                 AND table_catalog = d.datname) as table_count
            FROM pg_database d
            JOIN pg_roles r ON d.datdba = r.oid
            WHERE d.datistemplate = false 
            AND d.datname != 'postgres'
        `);
        
        databases = result.rows.map(row => ({
            name: row.name,
            db_user: row.owner,
            managed: managedDbs.has(row.name),
            tables: parseInt(row.table_count) || 0
        }));
    }

    return databases;
}

export async function getServerProcesses(server: any) {
    const client = await dbClient(server.id);
    
    if (server.type === 'mysql') {
        const results = await client.execute(`
            SELECT 
                ID as id,
                DB as db,
                USER as user,
                HOST as host,
                COMMAND as state,
                INFO as info,
                TIME_MS as time_ms,
                MAX_MEMORY_USED as memory_used
            FROM information_schema.PROCESSLIST
            WHERE COMMAND != 'Sleep'
        `);
        return results.rows;
    } else if (server.type === 'postgresql') {
        const result = await client.queryObject(`
            SELECT 
                pid as id,
                datname as db,
                usename as user,
                client_addr as host,
                state,
                query as info,
                EXTRACT(EPOCH FROM now() - query_start) * 1000 as time_ms,
                NULLIF(REGEXP_REPLACE(COALESCE(work_mem, '0kB'), '[^0-9]', '', 'g'), '')::bigint * 1024 as memory_used
            FROM pg_stat_activity
            WHERE state != 'idle'
            AND pid != pg_backend_pid()
        `);
        return result.rows;
    }
    
    return [];
}

export async function killProcess(server: any, processId: number) {
    const client = await dbClient(server.id);
    
    if (server.type === 'mysql') {
        await client.execute('KILL ?', [processId]);
    } else if (server.type === 'postgresql') {
        await client.queryObject('SELECT pg_terminate_backend($1)', [processId]);
    }
}
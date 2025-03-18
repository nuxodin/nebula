import { Context } from "hono";
import { logError } from "../../utils/logger.ts";
import { run } from "../../utils/command.ts";
import { join, basename } from "https://deno.land/std@0.208.0/path/mod.ts";
import { LogParser } from "../../utils/LogParser.js";

const LOG_PATHS = [
    // Linux System Logs
    "/var/log/syslog",
    "/var/log/messages",
    "/var/log/dmesg",
    "/var/log/kern.log",
    "/var/log/auth.log",
    "/var/log/boot.log",
    "/var/log/daemon.log",
    "/var/log/dpkg.log",
    "/var/log/faillog",
    "/var/log/alternatives.log",
    "/var/log/lastlog",
    "/var/log/mail.log",
    "/var/log/user.log",
    "/var/log/debug",
    "/var/log/wtmp",
    "/var/log/btmp",
    "/var/log/utmp",

    // Linux Webserver Logs
    "/var/log/nginx/access.log",
    "/var/log/nginx/error.log",
    "/var/log/apache2/access.log",
    "/var/log/apache2/error.log",
    "/var/log/apache2/other_vhosts_access.log",
    "/var/log/httpd/access_log",
    "/var/log/httpd/error_log",

    // Linux Database Logs
    "/var/log/mysql/error.log",
    "/var/log/mysql/mysql.log",
    "/var/log/mysql/mysql-slow.log",
    "/var/log/postgresql/postgresql-main.log",
    "/var/log/mariadb/mariadb.log",

    // Linux Mail Logs
    "/var/log/mail.info",
    "/var/log/mail.warn",
    "/var/log/mail.err",
    "/var/log/exim4/",
    "/var/log/dovecot.log",

    // Linux Security Logs
    "/var/log/secure",
    "/var/log/fail2ban.log",
    "/var/log/clamav/freshclam.log",
    "/var/log/ufw.log",

    // Application Logs
    "/var/log/php/error.log",
    "/var/log/php-fpm/error.log",
    "/var/log/php-fpm/www-error.log",
    "/var/log/redis/redis-server.log",
    "/var/log/supervisor/supervisord.log",
    "/var/log/jenkins/jenkins.log",
    "/var/log/letsencrypt/letsencrypt.log",

    // Windows System Logs
    "C:\\Windows\\System32\\winevt\\Logs\\System.evtx",
    "C:\\Windows\\System32\\winevt\\Logs\\Application.evtx",
    "C:\\Windows\\System32\\winevt\\Logs\\Security.evtx",
    "C:\\Windows\\debug\\WIA\\wiatrace.log",
    "C:\\Windows\\SoftwareDistribution\\ReportingEvents.log",
    "C:\\Windows\\WindowsUpdate.log",
    "C:\\Windows\\Panther\\UnattendGC\\setupact.log",
    "C:\\Windows\\inf\\setupapi.dev.log",
    "C:\\Windows\\Logs\\CBS\\CBS.log",
    "C:\\Windows\\Logs\\DISM\\dism.log",

    // Windows IIS Logs
    "C:\\inetpub\\logs\\LogFiles\\W3SVC1\\u_ex*.log",
    "C:\\inetpub\\logs\\LogFiles\\HTTPERR\\httperr*.log",

    // Windows Program Logs
    "C:\\Program Files\\Microsoft SQL Server\\*\\MSSQL\\Log\\ERRORLOG",
    "%ProgramFiles%\\MySQL\\MySQL Server*\\data\\*.err",
    "%ProgramFiles%\\PostgreSQL\\*\\data\\log\\postgresql-*.log",
    "%ProgramData%\\MySQL\\MySQL Server*\\data\\*.err",
    
    // Windows XAMPP Logs
    "C:\\xampp\\apache\\logs\\access.log",
    "C:\\xampp\\apache\\logs\\error.log",
    "C:\\xampp\\mysql\\data\\mysql_error.log",
    "C:\\xampp\\php\\logs\\php_error_log",

    // Windows Nginx Logs
    "%ProgramFiles%\\nginx\\logs\\access.log",
    "%ProgramFiles%\\nginx\\logs\\error.log",

    // Application Data Logs
    "%LOCALAPPDATA%\\*.log",
    "%TEMP%\\*.log",
    "%PROGRAMDATA%\\*.log"
];

// Findet und filtert Log-Dateien
async function findLogFiles(paths: string[]): Promise<Array<{name: string; path: string; size: number; modified: Date | null; type: string}>> {
    const files: Array<{name: string; path: string; size: number; modified: Date | null; type: string}> = [];
    const processedPaths = new Set();
    const isWindows = Deno.build.os === "windows";

    // Ersetze Umgebungsvariablen
    function expandEnvVars(path: string): string {
        if (isWindows) {
            return path.replace(/%([^%]+)%/g, (_, name) => Deno.env.get(name) || `%${name}%`);
        }
        return path;
    }

    for (const rawPath of paths) {
        const path = expandEnvVars(rawPath);
        
        try {
            const stat = await Deno.stat(path);
            
            if (stat.isDirectory) {
                try {
                    for await (const entry of Deno.readDir(path)) {
                        if (entry.isFile && entry.name.toLowerCase().includes('log')) {
                            const filePath = join(path, entry.name);
                            if (!processedPaths.has(filePath)) {
                                processedPaths.add(filePath);
                                const fileInfo = await Deno.stat(filePath);
                                files.push({
                                    name: entry.name,
                                    path: filePath,
                                    size: fileInfo.size,
                                    modified: fileInfo.mtime,
                                    type: getLogType(entry.name)
                                });
                            }
                        }
                    }
                } catch (error) {
                    logError(`Fehler beim Lesen des Verzeichnisses ${path}: ${error.message}`, "Log Browser 2");
                }
            } else {
                if (!processedPaths.has(path)) {
                    processedPaths.add(path);
                    files.push({
                        name: basename(path),
                        path: path,
                        size: stat.size,
                        modified: stat.mtime,
                        type: getLogType(path)
                    });
                }
            }
        } catch {
            // Ignoriere nicht existierende Pfade
        }
    }

    return files;
}

// Bestimmt den Log-Typ basierend auf Dateinamen und Inhalt
function getLogType(filename: string): string {
    const lower = filename.toLowerCase();
    if (lower.includes('error') || lower.includes('err')) return 'error';
    if (lower.includes('access')) return 'access';
    if (lower.includes('debug')) return 'debug';
    if (lower.includes('audit')) return 'audit';
    return 'general';
}

// API Controller
export const api = {
    files: {
        get: async () => {
            const files = [];
            for (const path of LOG_PATHS) {
                try {
                    const stat = await Deno.stat(path);
                    files.push({
                        name: basename(path),
                        path: path,
                        size: stat.size,
                        modified: stat.mtime
                    });
                } catch {
                    // Ignoriere nicht existierende Dateien
                }
            }
            return { files };
        }
    },

    content: {
        post: async (c: Context) => {
            const { path, filter, lines = 100, format } = await c.req.json();
            
            if (!path) return { error: "Kein Pfad angegeben" };

            // Für Windows Event Logs
            if (path.endsWith('.evtx')) {
                const cmd = filter
                    ? `Get-WinEvent -Path "${path}" -MaxEvents ${lines} | Where-Object { $_.Message -match "${filter}" } | Format-List`
                    : `Get-WinEvent -Path "${path}" -MaxEvents ${lines} | Format-List`;
                
                const result = await run("powershell", ["-Command", cmd], { silent: true });
                return {
                    content: result.stdout,
                    error: result.code !== 0 ? result.stderr : null
                };
            }

            // Für normale Log-Dateien
            const parser = new LogParser(path);
            if (format) parser.setFormat(format);
            
            const entries = await parser.getEntries({
                limit: lines,
                search: filter || "",
                order: "desc"
            });

            return {
                content: entries.map(entry => entry.toString()).join('\n'),
                entries: entries
            };
        }
    }
};
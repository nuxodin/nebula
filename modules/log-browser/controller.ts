import { Context } from "hono";
import { logError } from "../../utils/logger.ts";
import { run } from "../../utils/command.ts";
import { join, basename } from "https://deno.land/std@0.208.0/path/mod.ts";
import { LogParser } from "../../utils/LogParser.ts";

// Definiert verschiedene Log-Kategorien und ihre Pfade
const LOG_CATEGORIES = {
    system: {
        name: "System Logs",
        paths: [
            "/var/log/syslog",
            "/var/log/messages",
            "/var/log/dmesg",
            "/var/log/kern.log",
            "/var/log/boot.log",
            // faillog
            "/var/log/faillog",
            "/var/log/lastlog",
            "/var/log/wtmp",
            "/var/log/btmp",
            "/var/log/utmp",
            "/var/log/letsencrypt/letsencrypt.log",
            // Windows
            "C:\\Windows\\System32\\winevt\\Logs\\System.evtx",
            "C:\\Windows\\System32\\winevt\\Logs\\Application.evtx"
        ]
    },
    webserver: {
        name: "Webserver",
        paths: [
            "/var/log/nginx",
            "/var/log/apache2",
            "/var/log/nginx/access.log",
            "/var/log/nginx/error.log",
            "/var/log/apache2/access.log",
            "/var/log/apache2/error.log",
            "/var/log/apache2/ssl_error.log",
            "/var/log/apache2/ssl_access.log",
            // Windows
            "C:\\inetpub\\logs\\LogFiles",
            "C:\\xampp\\apache\\logs",
            "%ProgramFiles%\\nginx\\logs",
        ]
    },
    database: {
        name: "Datenbanken",
        paths: [
            "/var/log/mysql",
            "/var/log/postgresql",
            "/var/log/mysql/error.log",
            "/var/log/mariadb/mariadb.log",
            // Windows
            "%ProgramFiles%\\MySQL\\MySQL Server*\\data\\*.err",
            "%ProgramFiles%\\PostgreSQL\\*\\data\\log"
        ]
    },
    application: {
        name: "Anwendungs-Logs",
        paths: [
            "./logs",
            "./nebula-data/logs",
            // Windows
            "%LOCALAPPDATA%\\Temp\\*.log",
            "%TEMP%\\*.log"
        ]
    },
    security: {
        name: "Sicherheits-Logs",
        paths: [
            "/var/log/auth.log",
            "/var/log/secure",
            // Windows
            "C:\\Windows\\System32\\winevt\\Logs\\Security.evtx"
        ]
    }
};

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
    categories: {
        get: () => {
            return { categories: Object.entries(LOG_CATEGORIES).map(([id, cat]) => ({
                id,
                name: cat.name
            }))};
        }
    },

    files: {
        ':category': async (c: Context) => {
            const { category } = c.req.param();
            if (!LOG_CATEGORIES[category]) {
                return c.json({ error: "Ungültige Kategorie" }, 400);
            }

            const files = await findLogFiles(LOG_CATEGORIES[category].paths);
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
    },

    analyze: {
        post: async (c: Context) => {
            const { path } = await c.req.json();
            
            if (!path) {
                return c.json({ error: "Kein Pfad angegeben" }, 400);
            }

            const parser = new LogParser(path);
            const entries = await parser.getEntries({ limit: 1000 });

            // Analyse der Log-Einträge
            const analysis = {
                totalEntries: entries.length,
                levels: {} as Record<string, number>,
                timeDistribution: {} as Record<string, number>,
                commonPatterns: [] as Array<{pattern: string, count: number}>,
            };

            // Zähle Level und Zeitverteilung
            for (const entry of entries) {
                analysis.levels[entry.level] = (analysis.levels[entry.level] || 0) + 1;
                
                if (entry.date) {
                    const hour = entry.date.getHours();
                    analysis.timeDistribution[hour] = (analysis.timeDistribution[hour] || 0) + 1;
                }
            }

            return analysis;
        }
    }
};
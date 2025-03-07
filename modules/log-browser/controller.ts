import { Context } from "hono";
import { logError } from "../../utils/logger.ts";
import { run } from "../../utils/command.ts";
import { join, basename } from "https://deno.land/std@0.208.0/path/mod.ts";

// Erweiterte und verbesserte Liste von Log-Speicherorten
const LOG_PATHS = {
  webserver: {
    name: "Webserver",
    paths: [
      // Linux/Unix Pfade
      "/var/log/nginx",
      "/var/log/apache2",
      "/var/log/httpd",
      "/var/log/nginx/access.log",
      "/var/log/nginx/error.log",
      "/var/log/apache2/access.log",
      "/var/log/apache2/error.log",
      "/var/log/httpd/access_log",
      "/var/log/httpd/error_log",
      // Windows Pfade
      "C:\\nginx\\logs",
      "C:\\Apache24\\logs",
      "C:\\inetpub\\logs\\LogFiles"
    ]
  },
  mail: {
    name: "E-Mail",
    paths: [
      // Linux/Unix Pfade
      "/var/log/mail",
      "/var/log/mail.log",
      "/var/log/mail.err",
      "/var/log/mail.warn",
      "/var/log/maillog",
      "/var/log/exim/mainlog",
      "/var/log/exim4/mainlog",
      "/var/log/postfix/mail.log",
      // Einzelne Dateien
      "/var/log/postfix.log",
      "/var/log/dovecot.log"
    ]
  },
  system: {
    name: "System",
    paths: [
      // Linux/Unix Pfade
      "/var/log",
      "/var/log/syslog",
      "/var/log/messages",
      "/var/log/kern.log",
      "/var/log/dmesg",
      "/var/log/auth.log",
      "/var/log/secure",
      "/var/log/boot.log",
      "/var/log/daemon.log",
      // Windows Pfade
      "C:\\Windows\\System32\\winevt\\Logs",
      "C:\\Windows\\System32\\winevt\\Logs\\System.evtx",
      "C:\\Windows\\System32\\winevt\\Logs\\Application.evtx",
      "C:\\Windows\\System32\\winevt\\Logs\\Security.evtx"
    ]
  },
  database: {
    name: "Datenbanken",
    paths: [
      // Linux/Unix Pfade
      "/var/log/mysql",
      "/var/log/postgresql",
      "/var/log/mongodb",
      "/var/log/mysql/error.log",
      "/var/log/postgresql/postgresql.log",
      // Windows Pfade
      "C:\\ProgramData\\MySQL\\MySQL Server\\data\\*.err",
      "C:\\Program Files\\PostgreSQL\\*\\data\\log\\*.log",
      // Spezifische Dateien
      "/var/log/mysql.log",
      "/var/log/mysql.err"
    ]
  },
  application: {
    name: "Anwendungen",
    paths: [
      // Anwendungsverzeichnisse
      "/var/log/app",
      "/var/log/apps",
      "/var/log/application",
      "/var/log/applications",
      // Nebula Logs
      "./logs",
      "../logs",
      "./nebula-data/logs",
      "../nebula-data/logs"
    ]
  }
};

// Verbesserte Funktion zum Finden von Log-Dateien
async function findFiles(paths: string[]): Promise<Array<{name: string, path: string, size: number, modified: Date | null}>> {
  const files = [];
  const processedPaths = new Set(); // Um doppelte Dateien zu vermeiden

  for (const path of paths) {
    try {
      // Prüfen, ob der Pfad ein Glob-Pattern enthält
      if (path.includes('*')) {
        const isWindows = Deno.build.os === "windows";
        const basePath = path.substring(0, path.indexOf('*')).replace(/\\$/, '');
        
        try {
          // Basisverzeichnis prüfen
          const baseDir = await Deno.stat(basePath);
          if (baseDir.isDirectory) {
            // Einfache Glob-Suche mit Kommandozeile
            const cmd = isWindows 
              ? await run("powershell", ["-Command", `Get-ChildItem -Path "${path}" -File | Select-Object -ExpandProperty FullName`], { silent: true })
              : await run("sh", ["-c", `ls -1 ${path} 2>/dev/null`], { silent: true });
              
            if (cmd.code === 0) {
              const foundFiles = cmd.stdout.split('\n').filter(f => f.trim());
              for (const file of foundFiles) {
                const filePath = isWindows ? file.trim() : join(basePath, file.trim());
                if (!processedPaths.has(filePath)) {
                  processedPaths.add(filePath);
                  try {
                    const stat = await Deno.stat(filePath);
                    files.push({
                      name: basename(filePath),
                      path: filePath,
                      size: stat.size,
                      modified: stat.mtime
                    });
                  } catch {} // Überspringe unzugängliche Dateien
                }
              }
            }
          }
        } catch {} // Basisverzeichnis nicht gefunden
        continue;
      }
      
      const stat = await Deno.stat(path);
      
      if (stat.isDirectory) {
        // Wenn es ein Verzeichnis ist, füge alle Dateien darin hinzu
        try {
          for await (const entry of Deno.readDir(path)) {
            if (entry.isFile) {
              const filePath = join(path, entry.name);
              if (!processedPaths.has(filePath)) {
                processedPaths.add(filePath);
                try {
                  const fileInfo = await Deno.stat(filePath);
                  files.push({
                    name: entry.name,
                    path: filePath,
                    size: fileInfo.size,
                    modified: fileInfo.mtime
                  });
                } catch {} // Überspringe Dateien ohne Zugriffsberechtigung
              }
            }
          }
        } catch (error) {
          // Weitermachen mit anderen Pfaden
          logError(`Zugriff auf Verzeichnis nicht möglich: ${path} - ${error.message}`, "Log Browser");
        }
      } else {
        // Eine direkte Datei hinzufügen, wenn sie nicht bereits verarbeitet wurde
        if (!processedPaths.has(path)) {
          processedPaths.add(path);
          files.push({
            name: basename(path),
            path: path,
            size: stat.size,
            modified: stat.mtime
          });
        }
      }
    } catch {} // Pfad existiert nicht oder ist nicht zugänglich, überspringe
  }

  return files;
}

// API Controllers
export const api = {
  // Gibt verfügbare Log-Typen zurück
  types: async function() {
    const availableTypes = [];
    
    for (const [type, config] of Object.entries(LOG_PATHS)) {
      const files = await findFiles(config.paths);
      if (files.length > 0) {
        availableTypes.push({ 
          id: type, 
          name: config.name
        });
      }
    }
    
    return { types: availableTypes };
  },
  
  // Gibt Dateien für einen bestimmten Log-Typ zurück
  files: {
    ':type': async function(c: Context) {
      try {
        const { type } = c.req.param();
        
        if (!LOG_PATHS[type]) return { error: "Ungültiger Log-Typ", files: [] };
        
        const files = await findFiles(LOG_PATHS[type].paths);
        
        if (files.length === 0) return { error: "Keine zugänglichen Logs für diesen Typ gefunden", files: [] };

        // Sortiere nach letzter Änderung (neueste zuerst)
        files.sort((a, b) => {
          if (!a.modified || !b.modified) return 0;
          return new Date(b.modified).getTime() - new Date(a.modified).getTime();
        });
        
        return { files };
      } catch (err) {
        logError(`Fehler beim Auflisten der Log-Dateien: ${err.message}`, "Log Browser");
        return { error: "Fehler beim Auflisten der Log-Dateien", files: [] };
      }
    }
  },

  // Gibt Inhalt einer Log-Datei zurück
  content: {
    post: async function(c: Context) {
      try {
        const { path, filter, lines = 100 } = await c.req.json();

        if (!path) return { error: "Kein Log-Dateipfad angegeben" };

        // Sicherheitscheck: Verhindere Directory Traversal
        if (path.includes('..')) return { error: "Ungültiger Pfad" };

        try {
          const stat = await Deno.stat(path);
          if (stat.isDirectory) return { error: "Der angegebene Pfad ist ein Verzeichnis, keine Datei" };
        } catch {
          return { error: "Log-Datei nicht gefunden oder nicht zugänglich" };
        }

        const isWindows = Deno.build.os === "windows";
        let result;

        if (isWindows) {
          // Windows-spezifische Behandlung für .evtx-Dateien
          if (path.endsWith('.evtx')) {
            const powershellCmd = `Get-WinEvent -Path "${path}" -MaxEvents ${lines} | Format-List`;
            result = await run("powershell", ["-Command", powershellCmd]);
          } else {
            // Normale Textdateien unter Windows
            const powershellCmd = filter 
              ? `Get-Content -Tail ${lines} "${path}" | Select-String -Pattern "${filter}"` 
              : `Get-Content -Tail ${lines} "${path}"`;
            result = await run("powershell", ["-Command", powershellCmd]);
          }
        } else {
          // Unix-Systeme mit vereinfachtem Befehl
          const command = filter 
            ? `tail -n${lines} "${path}" | grep -i "${filter}"` 
            : `tail -n${lines} "${path}"`;
          result = await run("sh", ["-c", command], { silent: true });
        }

        return { 
          content: result.stdout, 
          error: result.code !== 0 ? result.stderr : null 
        };
      } catch (err) {
        logError(`Fehler beim Lesen der Log-Datei: ${err.message}`, "Log Browser");
        return { error: "Fehler beim Lesen der Log-Datei" };
      }
    }
  }
};
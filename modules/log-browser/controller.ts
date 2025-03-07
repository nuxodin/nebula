import { Context } from "hono";
import { logError } from "../../utils/logger.ts";
import { run } from "../../utils/command.ts";
import { join, basename } from "https://deno.land/std@0.208.0/path/mod.ts";

// Verbesserte Log-Speicherorte mit mehr Windows-Unterstützung
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
      // Windows Pfade - mehr Kombinationen
      "C:\\nginx\\logs",
      "C:\\Program Files\\nginx\\logs",
      "C:\\Apache24\\logs",
      "C:\\Program Files\\Apache24\\logs",
      "C:\\Program Files\\Apache Software Foundation\\Apache2.4\\logs",
      "C:\\xampp\\apache\\logs",
      "C:\\xampp\\logs",
      "C:\\inetpub\\logs\\LogFiles"
    ]
  },
  windows_system: {
    name: "Windows System",
    paths: [
      "C:\\Windows\\System32\\winevt\\Logs\\System.evtx",
      "C:\\Windows\\System32\\winevt\\Logs\\Application.evtx", 
      "C:\\Windows\\System32\\winevt\\Logs\\Security.evtx",
      "C:\\Windows\\debug",
      "C:\\Windows\\debug\\netsetup.log",
      "C:\\Windows\\Logs",
      "C:\\Windows\\Logs\\CBS",
      "C:\\Windows\\Panther",
      "C:\\Users\\Default\\AppData\\Local\\Microsoft\\Windows\\WER"
    ]
  },
  windows_iis: {
    name: "Windows IIS",
    paths: [
      "C:\\inetpub\\logs\\LogFiles",
      "C:\\inetpub\\logs\\FailedReqLogFiles"
    ]
  },
  windows_apps: {
    name: "Windows Programme",
    paths: [
      "C:\\Program Files\\Common Files\\Microsoft Shared\\Web Server Extensions\\16\\LOGS",
      "C:\\Program Files (x86)\\Common Files\\Microsoft Shared\\Web Server Extensions\\16\\LOGS",
      "%USERPROFILE%\\AppData\\Local\\Temp",
      "%PROGRAMDATA%\\Microsoft\\Windows\\WER"
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
      "C:\\ProgramData\\MySQL\\MySQL Server*\\data\\*.err",
      "C:\\Program Files\\MySQL\\MySQL Server*\\*.err",
      "C:\\Program Files\\PostgreSQL\\*\\data\\log",
      "C:\\Program Files\\Microsoft SQL Server\\MSSQL*\\MSSQL\\Log",
      // XAMPP
      "C:\\xampp\\mysql\\data\\*.err",
      // Spezifische Dateien
      "/var/log/mysql.log",
      "/var/log/mysql.err"
    ]
  },
  local_app: {
    name: "Anwendungs-Logs",
    paths: [
      // Nebula-spezifische Logs
      "./logs",
      "../logs",
      "./nebula-data/logs",
      "../nebula-data/logs",
      // Anwendungslogs unter Windows
      "%LOCALAPPDATA%\\Temp",
      "%APPDATA%\\Local\\Temp",
      "%TEMP%"
    ]
  },
  powershell: {
    name: "PowerShell",
    paths: [
      "%USERPROFILE%\\AppData\\Roaming\\Microsoft\\Windows\\PowerShell\\PSReadLine\\ConsoleHost_history.txt"
    ]
  }
};

// Verbesserte Funktion zum Finden von Log-Dateien mit Windows-Unterstützung
async function findFiles(paths: string[]): Promise<Array<{name: string, path: string, size: number, modified: Date | null}>> {
  const files = [];
  const processedPaths = new Set(); // Um doppelte Dateien zu vermeiden
  const isWindows = Deno.build.os === "windows";

  // Umgebungsvariablen ersetzen - besonders für Windows wichtig
  function expandEnvVars(path: string): string {
    if (isWindows) {
      // Ersetze Windows-Umgebungsvariablen wie %USERPROFILE%, %TEMP%, usw.
      return path.replace(/%([^%]+)%/g, (_, name) => {
        const envVar = Deno.env.get(name);
        return envVar || `%${name}%`;
      });
    }
    return path;
  }

  for (const rawPath of paths) {
    const path = expandEnvVars(rawPath);
    try {
      // Spezielle Behandlung für Windows Event Logs
      if (isWindows && path.endsWith('.evtx')) {
        if (!processedPaths.has(path)) {
          try {
            const stat = await Deno.stat(path);
            files.push({
              name: basename(path),
              path: path,
              size: stat.size,
              modified: stat.mtime
            });
            processedPaths.add(path);
          } catch {} // Datei nicht zugänglich
        }
        continue;
      }
      
      // Prüfen, ob der Pfad ein Glob-Pattern enthält
      if (path.includes('*')) {
        const basePath = path.substring(0, path.indexOf('*')).replace(/\\$/, '');
        
        try {
          // Basisverzeichnis prüfen
          let baseExists = false;
          try {
            const baseDir = await Deno.stat(basePath);
            baseExists = baseDir.isDirectory;
          } catch {
            baseExists = false;
          }
          
          // Glob-Suche mit Kommandozeile
          if (baseExists) {
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
        } catch {} // Fehler bei der Glob-Verarbeitung
        continue;
      }
      
      // Normaler Pfad-Check
      try {
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
    } catch {} // Allgemeiner Fehler, überspringe
  }

  // Windows Event Log durch PowerShell auslesen, wenn keine Dateien gefunden wurden und Windows
  if (isWindows && files.length === 0) {
    try {
      // Liste der Windows-Ereignisprotokolle erhalten
      const eventLogsResult = await run("powershell", ["-Command", "Get-WinEvent -ListLog * | Where-Object {$_.RecordCount -gt 0} | Select-Object -First 5 | Select-Object LogName, RecordCount"], { silent: true });
      
      if (eventLogsResult.code === 0) {
        const eventLogNames = eventLogsResult.stdout
          .split('\n')
          .filter(line => line.includes('LogName'))
          .map(line => {
            const match = line.match(/LogName\s*:\s*(.+)/);
            return match ? match[1].trim() : null;
          })
          .filter(name => name);
        
        for (const logName of eventLogNames) {
          files.push({
            name: `${logName} (Windows Event Log)`,
            path: `winlog:${logName}`,
            size: 0,
            modified: new Date()
          });
        }
      }
    } catch {} // Fehler beim Zugriff auf Windows Event Logs
  }

  return files;
}

// API Controllers
export const api = {
  // Gibt verfügbare Log-Typen zurück
  types: async function() {
    const availableTypes = [];
    const isWindows = Deno.build.os === "windows";
    
    // Spezielle Windows-Kategorien zuerst anzeigen, wenn auf Windows
    const categories = isWindows 
      ? { ...LOG_PATHS } 
      : Object.entries(LOG_PATHS)
          .filter(([key]) => !key.startsWith('windows_'))
          .reduce((obj, [key, value]) => {
            obj[key] = value;
            return obj;
          }, {});
    
    for (const [type, config] of Object.entries(categories)) {
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

        const isWindows = Deno.build.os === "windows";
        
        // Windows Event Log spezielle Behandlung
        if (path.startsWith('winlog:')) {
          const logName = path.substring(7); // 'winlog:' entfernen
          const powershellCmd = filter
            ? `Get-WinEvent -LogName "${logName}" -MaxEvents ${lines} | Where-Object { $_.Message -match "${filter}" } | Format-List`
            : `Get-WinEvent -LogName "${logName}" -MaxEvents ${lines} | Format-List`;
          
          const result = await run("powershell", ["-Command", powershellCmd], { silent: true });
          return {
            content: result.stdout || "Keine Ereignisse gefunden",
            error: result.code !== 0 ? result.stderr : null
          };
        }

        // Sicherheitscheck: Verhindere Directory Traversal
        if (path.includes('..')) return { error: "Ungültiger Pfad" };

        // Für normale Dateien
        try {
          const stat = await Deno.stat(path);
          if (stat.isDirectory) return { error: "Der angegebene Pfad ist ein Verzeichnis, keine Datei" };
        } catch {
          return { error: "Log-Datei nicht gefunden oder nicht zugänglich" };
        }

        let result;

        if (isWindows) {
          // Windows-spezifische Behandlung
          if (path.endsWith('.evtx')) {
            // Windows Event Log Dateien
            const powershellCmd = `Get-WinEvent -Path "${path}" -MaxEvents ${lines} | Format-List`;
            result = await run("powershell", ["-Command", powershellCmd], { silent: true });
          } else {
            // Normale Textdateien unter Windows
            const powershellCmd = filter 
              ? `Get-Content -Tail ${lines} "${path}" | Select-String -Pattern "${filter}"`
              : `Get-Content -Tail ${lines} "${path}"`;
            result = await run("powershell", ["-Command", powershellCmd], { silent: true });
          }
        } else {
          // Unix-Systeme mit vereinfachtem Befehl
          const command = filter 
            ? `tail -n${lines} "${path}" | grep -i "${filter}"`
            : `tail -n${lines} "${path}"`;
          result = await run("sh", ["-c", command], { silent: true });
        }

        return { 
          content: result.stdout || "Keine Inhalte gefunden", 
          error: result.code !== 0 ? result.stderr : null
        };
      } catch (err) {
        logError(`Fehler beim Lesen der Log-Datei: ${err.message}`, "Log Browser");
        return { error: `Fehler beim Lesen der Log-Datei: ${err.message}` };
      }
    }
  }
};
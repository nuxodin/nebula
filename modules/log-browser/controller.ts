import { Context } from "hono";
import { logError } from "../../utils/logger.ts";
import { renderTemplate } from "../../utils/template.ts";
import { run, isCommandAvailable } from "../../utils/command.ts";
import { join, basename, dirname } from "https://deno.land/std@0.208.0/path/mod.ts";

// Vereinfachte Liste von Log-Speicherorten nach Kategorien
const LOG_PATHS = {
  webserver: {
    name: "Webserver",
    paths: ["/var/log/nginx", "/var/log/apache2", "/var/log/httpd", "C:\\nginx\\logs", "C:\\Apache24\\logs"]
  },
  mail: {
    name: "E-Mail",
    paths: ["/var/log/mail", "/var/log/mail.log", "/var/log/maillog", "/var/log/postfix"]
  },
  system: {
    name: "System",
    paths: ["/var/log", "/var/log/syslog", "/var/log/messages", "C:\\Windows\\System32\\winevt\\Logs"]
  },
  database: {
    name: "Datenbanken",
    paths: ["/var/log/mysql", "/var/log/postgresql", "/var/log/mongodb"]
  }
};

// View Controller
export const getLogBrowserView = async (c: Context) => {
    const content = await Deno.readTextFile("./modules/log-browser/views/content.html");
    const scripts = await Deno.readTextFile("./modules/log-browser/views/scripts.html");
    return c.html(await renderTemplate("Log Browser", content, "", scripts));
};

// Prüft, ob ein Pfad existiert und gibt Informationen darüber zurück
async function checkPath(path: string): Promise<{ exists: boolean; isDirectory: boolean; path: string } | null> {
  try {
    const stat = await Deno.stat(path);
    return {
      exists: true,
      isDirectory: stat.isDirectory,
      path: path
    };
  } catch {
    return null;
  }
}

// Findet gültige Log-Pfade (sowohl Dateien als auch Verzeichnisse)
async function findValidLogPaths(paths: string[]): Promise<{ directories: string[]; files: { path: string; name: string }[] }> {
  const result = {
    directories: [],
    files: []
  };

  for (const path of paths) {
    const pathInfo = await checkPath(path);
    
    if (pathInfo) {
      if (pathInfo.isDirectory) {
        result.directories.push(path);
      } else {
        result.files.push({
          path: path,
          name: basename(path)
        });
      }
    }
  }

  return result;
}

// API Controllers
export const api = {
  // Gibt verfügbare Log-Typen zurück
  types: async function() {
    const availableTypes = [];
    
    for (const [type, config] of Object.entries(LOG_PATHS)) {
      const validPaths = await findValidLogPaths(config.paths);
      
      if (validPaths.directories.length > 0 || validPaths.files.length > 0) {
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
        
        if (!LOG_PATHS[type]) {
          return { error: "Ungültiger Log-Typ", files: [] };
        }
        
        const validPaths = await findValidLogPaths(LOG_PATHS[type].paths);
        const files = [];

        // Direkte Log-Dateien hinzufügen
        for (const file of validPaths.files) {
          try {
            const fileInfo = await Deno.stat(file.path);
            files.push({
              name: file.name,
              path: file.path,
              size: fileInfo.size,
              modified: fileInfo.mtime
            });
          } catch {
            // Überspringe Dateien ohne Zugriffsberechtigung
          }
        }
        
        // Verzeichnisse durchsuchen und Dateien hinzufügen
        for (const dir of validPaths.directories) {
          try {
            for await (const entry of Deno.readDir(dir)) {
              if (entry.isFile) {
                const filePath = join(dir, entry.name);
                try {
                  const fileInfo = await Deno.stat(filePath);
                  files.push({
                    name: entry.name,
                    path: filePath,
                    size: fileInfo.size,
                    modified: fileInfo.mtime
                  });
                } catch {
                  // Überspringe Dateien ohne Zugriffsberechtigung
                }
              }
            }
          } catch (error) {
            logError(`Zugriff auf Verzeichnis nicht möglich: ${dir} - ${error.message}`, "Log Browser");
            // Trotz Fehler bei diesem Verzeichnis weitermachen
          }
        }
        
        // Wenn keine Dateien gefunden wurden
        if (files.length === 0) {
          return { error: "Keine zugänglichen Logs für diesen Typ gefunden", files: [] };
        }

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

        if (!path) {
          return { error: "Kein Log-Dateipfad angegeben" };
        }

        // Sicherheitscheck: Verhindere Directory Traversal
        if (path.includes('..')) {
          return { error: "Ungültiger Pfad" };
        }

        try {
          const stat = await Deno.stat(path);
          if (stat.isDirectory) {
            return { error: "Der angegebene Pfad ist ein Verzeichnis, keine Datei" };
          }
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
  },

  // Gibt Status von log-relevanten Diensten zurück
  services: async function() {
    try {
      const isWindows = Deno.build.os === "windows";
      
      // Relevante Dienste nach Kategorien
      const serviceGroups = {
        webserver: ["nginx", "apache2", "httpd"],
        mail: ["postfix", "dovecot"],
        database: ["mysql", "mariadb", "postgresql"],
        system: ["rsyslog", "syslog-ng"]
      };
      
      const services = [];
      
      // Einfacher Service-Check basierend auf OS
      const checkService = async (name) => {
        if (isWindows) {
          const result = await run("sc", ["query", name], { silent: true });
          return {
            exists: result.code === 0,
            running: result.stdout.includes("RUNNING")
          };
        } else {
          if (await isCommandAvailable("systemctl")) {
            const exists = await run("systemctl", ["list-unit-files", `${name}.service`], { silent: true });
            if (exists.stdout.includes(name)) {
              const status = await run("systemctl", ["is-active", name], { silent: true });
              return {
                exists: true,
                running: status.code === 0
              };
            }
          }
          
          // Fallback auf service-Befehl
          const checkCmd = await run("which", ["service"], { silent: true });
          if (checkCmd.code === 0) {
            const status = await run("service", [name, "status"], { silent: true });
            return {
              exists: status.code !== 127, // 127 bedeutet "command not found"
              running: status.code === 0
            };
          }
        }
        
        return { exists: false, running: false };
      };
      
      // Prüfe alle Services in allen Gruppen
      for (const [group, serviceList] of Object.entries(serviceGroups)) {
        for (const name of serviceList) {
          const { exists, running } = await checkService(name);
          if (exists) {
            services.push({
              name,
              group,
              status: running ? "aktiv" : "inaktiv",
              running
            });
          }
        }
      }
      
      return { services };
    } catch (err) {
      logError(`Fehler beim Prüfen des Service-Status: ${err.message}`, "Log Browser");
      return { error: "Fehler beim Prüfen der Services", services: [] };
    }
  }
};
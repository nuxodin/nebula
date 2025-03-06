import { Context } from "hono";
import { logError } from "../../utils/logger.ts";
import { renderTemplate } from "../../utils/template.ts";
import { run, isCommandAvailable } from "../../utils/command.ts";
import { join } from "https://deno.land/std@0.208.0/path/mod.ts";

// Liste aller möglichen Log-Speicherorte unabhängig vom Betriebssystem
const possibleLogPaths = {
  nginx: [
    "/var/log/nginx",
    "/usr/local/nginx/logs",
    "/usr/local/var/log/nginx",
    "C:\\nginx\\logs"
  ],
  apache: [
    "/var/log/apache2",
    "/var/log/httpd",
    "/usr/local/apache/logs",
    "/usr/local/apache2/logs",
    "/usr/local/www/apache24/logs",
    "/var/www/logs",
    "C:\\Apache24\\logs"
  ],
  iis: [
    "C:\\inetpub\\logs\\LogFiles"
  ],
  mail: [
    "/var/log/mail",
    "/var/log/mail.log",
    "/var/log/maillog",
    "/var/log/exim",
    "/var/log/postfix"
  ],
  system: [
    "/var/log/syslog",
    "/var/log/messages",
    "C:\\Windows\\System32\\winevt\\Logs\\System.evtx"
  ],
  security: [
    "/var/log/auth.log",
    "/var/log/secure",
    "C:\\Windows\\System32\\winevt\\Logs\\Security.evtx"
  ],
  application: [
    "/var/log/messages",
    "/var/log/application.log",
    "/var/log/app",
    // todo: apt?, 
    "C:\\Windows\\System32\\winevt\\Logs\\Application.evtx"
  ],
  kernel: [
    "/var/log/kern.log",
    "/var/log/dmesg"
  ],
  boot: [
    "/var/log/boot.log"
  ],
  cron: [
    "/var/log/cron",
    "/var/log/cron.log"
  ],
  ssh: [
    "/var/log/auth.log",
    "/var/log/secure"
  ],
  database: [
    "/var/log/mysql",
    "/var/log/postgresql",
    "/var/log/mongodb",
    "C:\\ProgramData\\MySQL\\MySQL Server*\\Data\\*.err"
  ],
};

// View Controller
export const getLogBrowserView = async (c: Context) => {
    const content = await Deno.readTextFile("./modules/log-browser/views/content.html");
    const scripts = await Deno.readTextFile("./modules/log-browser/views/scripts.html");
    return c.html(await renderTemplate("Log Browser", content, "", scripts));
};


// Überprüft ein bestimmtes Verzeichnis und gibt es zurück, wenn es existiert
async function checkPath(path) {
  try {
    const stat = await Deno.stat(path);
    if (stat.isDirectory) {
      return path;
    }
    return null;
  } catch {
    return null;
  }
}

// API Controllers
export const api = {
  types: async function() {
    // Finde alle existierenden Log-Typen
    const validTypes = [];
    const validLogPaths = {};
    
    for (const [type, paths] of Object.entries(possibleLogPaths)) {
      for (const path of paths) {
        try {
          const exists = await Deno.stat(path);
          if (exists) {
            validTypes.push(type);
            validLogPaths[type] = path;
            break; // Wir haben für diesen Typ einen gültigen Pfad gefunden
          }
        } catch {
          // Der Pfad existiert nicht, fahre mit dem nächsten fort
        }
      }
    }
    
    return { types: validTypes };
  },
  
  files: {
    ':type': async function(c: Context) {
      try {
        const { type } = c.req.param();
        const possiblePaths = possibleLogPaths[type] || [];
        
        // Versuche jeden möglichen Pfad für diesen Log-Typ
        let logDir = null;
        for (const path of possiblePaths) {
          logDir = await checkPath(path);
          if (logDir) break;
        }
        
        if (!logDir) {
          return { error: "Keine zugänglichen Logs für diesen Typ gefunden", files: [] };
        }

        try {
          const files = [];
          for await (const entry of Deno.readDir(logDir)) {
            if (entry.isFile) {
              const filePath = join(logDir, entry.name);
              const fileInfo = await Deno.stat(filePath);
              files.push({
                name: entry.name,
                path: filePath,
                size: fileInfo.size,
                modified: fileInfo.mtime
              });
            }
          }
          
          // Sortiere nach letzter Änderung (neueste zuerst)
          files.sort((a, b) => {
            if (!a.modified || !b.modified) return 0;
            return new Date(b.modified).getTime() - new Date(a.modified).getTime();
          });
          
          return { files };
        } catch (error) {
          return { 
            error: `Zugriff auf Log-Verzeichnis nicht möglich: ${error.message}`,
            files: []
          };
        }
      } catch (err) {
        logError(`Fehler beim Auflisten der Log-Dateien: ${err.message}`, "Log Browser");
        return { error: "Fehler beim Auflisten der Log-Dateien", files: [] };
      }
    }
  },

  content: {
    post: async function(c: Context) {
      try {
        const requestData = await c.req.json();
        const { path, filter, lines = 100 } = requestData;

        if (!path) {
          return { error: "Kein Log-Dateipfad angegeben" };
        }

        if (path.includes('..')) {
          return { error: "Ungültiger Pfad" };
        }

        try {
          await Deno.stat(path);
        } catch {
          return { error: "Log-Datei nicht gefunden oder nicht zugänglich" };
        }

        const isWindows = Deno.build.os === "windows";
        let result;

        if (isWindows) {
          if (path.endsWith('.evtx')) {
            const powershellCmd = `Get-WinEvent -Path "${path}" -MaxEvents ${lines} | Format-List`;
            result = await run("powershell", ["-Command", powershellCmd]);
            return { 
              content: result.stdout, 
              error: result.code !== 0 ? result.stderr : null 
            };
          }
          
          const powershellCmd = filter 
            ? `Get-Content -Tail ${lines} "${path}" | Select-String -Pattern "${filter}"` 
            : `Get-Content -Tail ${lines} "${path}"`;
            
          result = await run("powershell", ["-Command", powershellCmd]);
        } else {
          // Unix systems
          let command = "tail";
          let args = [`-n${lines}`, path];

          if (filter) {
            result = await run(command, [...args, "|", "grep", "-i", filter], { silent: true });
          } else {
            result = await run(command, args, { silent: true });
          }
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

  services: async function() {
    try {
      const isWindows = Deno.build.os === "windows";
      const services = [];
      
      // Gemeinsame Dienste, die mit Protokollierung zu tun haben
      const commonServices = [
        // Webserver
        "nginx", "apache2", "httpd", "apache", "apache24", "W3SVC", "IISAdmin",
        // Mail
        "postfix", "sendmail", "exim", "dovecot", "smtpd",
        // System/Logging
        "rsyslog", "syslogd", "syslog-ng", "journald", "EventLog",
        // Datenbanken
        "mysql", "mariadb", "postgresql", "mongodb", "MSSQLSERVER"
      ];
      
      for (const service of commonServices) {
        let status = "unbekannt";
        let running = false;
        
        if (isWindows) {
          const result = await run("sc", ["query", service], { silent: true });
          if (result.code === 0) {
            running = result.stdout.includes("RUNNING");
            status = running ? "aktiv" : "inaktiv";
          } else {
            continue; // Service nicht installiert, überspringen
          }
        } else {
          let serviceExists = false;
          
          if (await isCommandAvailable("systemctl")) {
            const checkResult = await run("systemctl", ["list-unit-files", `${service}.service`], { silent: true });
            if (checkResult.stdout.includes(service)) {
              serviceExists = true;
              const result = await run("systemctl", ["is-active", service], { silent: true });
              running = result.code === 0;
              status = running ? "aktiv" : "inaktiv";
            }
          } 
          
          if (!serviceExists && await isCommandAvailable("service")) {
            const checkResult = await run("service", ["--status-all"], { silent: true });
            if (checkResult.stdout.includes(service)) {
              serviceExists = true;
              const result = await run("service", [service, "status"], { silent: true });
              running = result.code === 0;
              status = running ? "aktiv" : "inaktiv";
            }
          }
          
          if (!serviceExists && await isCommandAvailable("rcctl")) {
            const checkResult = await run("rcctl", ["ls", "all"], { silent: true });
            if (checkResult.stdout.includes(service)) {
              serviceExists = true;
              const result = await run("rcctl", ["check", service], { silent: true });
              running = result.stdout.includes("(ok)");
              status = running ? "aktiv" : "inaktiv";
            }
          }
          
          if (!serviceExists) {
            continue; // Service nicht gefunden, überspringen
          }
        }
        
        services.push({
          name: service,
          running,
          status
        });
      }
      
      return { services };
    } catch (err) {
      logError(`Fehler beim Prüfen des Service-Status: ${err.message}`, "Log Browser");
      return { error: "Fehler beim Prüfen der Services", services: [] };
    }
  }
};
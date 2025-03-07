import { run, isCommandAvailable, startService, stopService, status } from "../../utils/command.ts";
import { logError, logInfo } from "../../utils/logger.ts";
import { packetManager } from "./utils.ts";

// Die unterstützten PHP-Versionen werden jetzt dynamisch ausgelesen
export async function getSupportedPhpVersions(): Promise<string[]> {
    const versions = await getAvailableVersions();
    return versions ?? ["7.4", "8.0", "8.1", "8.2", "8.3"];
}

// Installation-Befehle für verschiedene Betriebssysteme
const runOpt = { sudo: true, silent: false };
const INSTALL_COMMANDS = {
  apt: {
    enableRepo: async () => {
        await run("apt", ["update"], runOpt)
        await run("apt", ["install", "-y", "apt-transport-https", "lsb-release", "ca-certificates", "software-properties-common"], runOpt);
        //await run("sh", ["-c", "LC_ALL=C.UTF-8 add-apt-repository -y ppa:ondrej/php"], runOpt);
        await run("sh", ["-c", "add-apt-repository -y ppa:ondrej/php"], runOpt);
        await run("apt", ["update"], runOpt);
        return true;
    },
    install: (version: string) => {
      return run("apt", ["install", "-y", `php${version}-fpm`, `php${version}-common`, `php${version}-cli`, `php${version}-mysql`, `php${version}-curl`, `php${version}-gd`, `php${version}-mbstring`, `php${version}-xml`, `php${version}-zip`], runOpt);
    }
  },
  yum: {
    enableRepo: async () => {
      await run("yum", ["install", "-y", "epel-release"], runOpt);
      await run("yum", ["install", "-y", "https://rpms.remirepo.net/enterprise/remi-release-7.rpm"], runOpt);
      return true;
    },
    install: (version: string) => {
      const versionNumber = version.replace(".", "");
      return run("yum", ["install", "-y", `php${versionNumber}-php-fpm`, `php${versionNumber}-php-common`, `php${versionNumber}-php-cli`, `php${versionNumber}-php-mysqlnd`, `php${versionNumber}-php-curl`, `php${versionNumber}-php-gd`, `php${versionNumber}-php-mbstring`, `php${versionNumber}-php-xml`, `php${versionNumber}-php-zip`], runOpt);
    }
  },
  dnf: {
    enableRepo: async () => {
      await run("dnf", ["install", "-y", "epel-release"], runOpt);
      await run("dnf", ["install", "-y", "https://rpms.remirepo.net/fedora/remi-release-36.rpm"], runOpt);
      return true;
    },
    install: (version: string) => {
      const versionNumber = version.replace(".", "");
      return run("dnf", ["install", "-y", `php${versionNumber}-php-fpm`, `php${versionNumber}-php-common`, `php${versionNumber}-php-cli`, `php${versionNumber}-php-mysqlnd`, `php${versionNumber}-php-curl`, `php${versionNumber}-php-gd`, `php${versionNumber}-php-mbstring`, `php${versionNumber}-php-xml`, `php${versionNumber}-php-zip`], runOpt);
    }
  }
};

// Funktion um installierte PHP-Versionen zu prüfen
export async function checkInstalledPhpVersions(): Promise<{ version: string, status: string, fpmStatus: string }[]> {
  const installedVersions = [];
  
  // Prüfen, ob PHP-CLI vorhanden ist
  const phpBaseAvailable = await isCommandAvailable("php");
  
  if (phpBaseAvailable) {
    try {
      // Prüfen der Standardversion
      const versionResult = await run("php", ["-v"], { silent: true });
      if (versionResult.code === 0) {
        const versionMatch = versionResult.stdout.match(/PHP\s+([\d\.]+)/i);
        if (versionMatch && versionMatch[1]) {
            const version = versionMatch[1].substring(0, 3); // Nehme nur die ersten 3 Zeichen (z.B. "7.4" aus "7.4.33")

            const fpmStatus = await status(`php${version}-fpm`) ? "Aktiv" : "Inaktiv";

            installedVersions.push({
                version,
                status: "Installiert",
                fpmStatus
            });
        }
      }
    } catch (error) {
      logError("Fehler bei der Prüfung der Standard-PHP-Version: " + error, "PHP");
    }
  }
  
  // Bekannte PHP-Versionen suchen
  for (const version of await getAvailableVersions()) {
    try {
      // Prüfen, ob Version installiert ist
      //const versionCmd = await run(`php${version}`, ["-v"], { silent: true });
      const versionCmd = await run("php${version}", ["-v"], { silent: true, throw:true });
      if (versionCmd.code === 0) {
        // Vermeiden von Duplikaten (falls Default-Version bereits erkannt wurde)

            const fpmStatus = await status(`php${version}-fpm`) ? "Aktiv" : "Inaktiv";

            installedVersions.push({
                version,
                status: "Installiert",
                fpmStatus
            });
      }
    } catch {} // Version nicht installiert, ignorieren
  }
  
  return installedVersions;
}

// Funktion um eine bestimmte PHP-Version zu installieren
export async function installPhpVersion(version: string): Promise<boolean> {
  try {
    if (!version.match(/^\d\.\d$/)) throw new Error("Ungültige PHP-Version");
    
    const pm = await packetManager();
    const installResult = await INSTALL_COMMANDS[pm].install(version);
    
    if (installResult.code !== 0) throw new Error(`Fehler bei der Installation: ${installResult.stderr}`);
    
    const fpmService = `php${version}-fpm`; // `php${version.replace(".", "")}-php-fpm`
    
    //await run("systemctl", ["enable", fpmService], runOpt);
    console.log(fpmService + " nicht enabled, aber wird gestartet...");
    startService(fpmService);
    logInfo(`PHP ${version} wurde erfolgreich installiert und gestartet.`, "PHP");
    return true;
  } catch (error) {
    logError(`Fehler bei der Installation von PHP ${version}: ${error.message}`, "PHP");
    throw error;
  }
}

// Funktion um PHP-Repository zu aktivieren
export async function enablePhpRepository(): Promise<boolean> {
    try {
      const pm = await packetManager();
      return await INSTALL_COMMANDS[pm].enableRepo();
    } catch (error) {
      logError(`Fehler beim Aktivieren des PHP-Repositories: ${error.message}`, "PHP");
      throw error;
    }
}
 
export async function installPhp(version: string) {
  try {
    await installPhpVersion(version);
    return { success: true };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logError(`Fehler bei der Installation von PHP ${version}: ${errorMessage}`, "PHP");
    throw error;
  }
}

export async function startPhpService(version: string): Promise<boolean> {
    try {
        const fpmService = `php${version}-fpm`;
        //const fpmService = `php${version.replace(".", "")}-php-fpm`;
        await startService(fpmService);
        await run("service", [fpmService, "start"], {sudo:true});


        logInfo(`PHP ${version} FPM Service wurde gestartet.`, "PHP");
        return true;
    } catch (error) {
        logError(`Fehler beim Starten des PHP ${version} FPM Service: ${error.message}`, "PHP");
        throw error;
    }
}

export async function stopPhpService(version: string): Promise<boolean> {
    try {
        const fpmService = `php${version}-fpm`;
        await stopService(fpmService);
        logInfo(`PHP ${version} FPM Service wurde gestoppt.`, "PHP");
        return true;
    } catch (error) {
        logError(`Fehler beim Stoppen des PHP ${version} FPM Service: ${error.message}`, "PHP");
        throw error;
    }
}


// cache
let availableVersions: string[] | null = null;
export async function getAvailableVersions(): Promise<string[]> {
    if (!availableVersions) {
        availableVersions = await fetchAvailableVersions();
    }
    return availableVersions;
}

export async function fetchAvailableVersions(): Promise<string[]> {
    const pm = await packetManager();
    try {
        if (pm === "apt") {
            const result = await run("apt", ["search", "php"], { silent: true });
            const versions = new Set<string>();
            const versionRegex = /php(\d+\.\d+)/;
            result.stdout.split('\n').forEach(line => {
                const match = line.match(versionRegex);
                if (match) versions.add(match[1]);
            });
            return Array.from(versions).sort();
        } else if (pm === "yum") {
            const result = await run("dnf", ["list", "available", "php*", "--enablerepo=remi-php*"], { silent: true });
            const versions = new Set<string>();
            const versionRegex = /php(\d+\.\d+)/;
            result.stdout.split('\n').forEach(line => {
                const match = line.match(versionRegex);
                if (match) versions.add(match[1]);
            });
            return Array.from(versions).sort();
        }
        return [];
    } catch (error) {
        logError(`Fehler beim Abrufen der verfügbaren PHP-Versionen: ${error}`, "PHP");
        return [];
    }
}
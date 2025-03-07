import { Runtime, DomainConfig } from "../../utils/runtime.ts";
import db from "../../utils/database.ts";
import { join } from "https://deno.land/std/path/mod.ts";
import { ensureDir } from 'https://deno.land/std/fs/mod.ts';
import { config } from "../../utils/config.ts";
import { run } from "../../utils/command.ts";
import { logError, logInfo } from "../../utils/logger.ts";


const domainProcesses = new Map();

class DenoRuntime implements Runtime {
    async initDomain(domainId: number): Promise<void> {
        const domain = db.queryEntries(`
            SELECT id, name, runtime, runtime_version 
            FROM domains WHERE id = ? AND runtime = 'deno'
        `, [domainId])[0] as DomainConfig;
        if (!domain) throw new Error("Domain not found or not a Deno domain");

        const appDir = join(config.vhosts_root, domain.name, "deno-app");
        await ensureDir(appDir);

        // Erstelle eine grundlegende deno.json für die Domain
        const denoJsonFile = join(appDir, "deno.json");
        const denoJsonContent = JSON.stringify({
            "tasks": {
                "start": `deno run --allow-net --allow-read --allow-env main.ts`
            },
            "imports": {}
        }, null, 2);
        
        // Erstelle eine einfache main.ts als Startpunkt
        const mainTsFile = join(appDir, "main.ts");
        const mainTsContent = 
            'import { serve } from "https://deno.land/std/http/server.ts";\n' +
            '\n' +
            'const port = Number(Deno.env.get("PORT")) || 8000;\n' +
            '\n' +
            'serve((req) => {\n' +
            '  const url = new URL(req.url);\n' +
            '  return new Response(`Hello from Deno! You requested: ${url.pathname}`);\n' +
            '}, { port });\n' +
            '\n' +
            'console.log(`Server running on port ${port}`);\n';

        try {
            await Deno.writeTextFile(denoJsonFile, denoJsonContent);
            await Deno.writeTextFile(mainTsFile, mainTsContent);
            
            logInfo(`Deno-App für Domain ${domain.name} initialisiert`, "Deno");
        } catch (error) {
            logError(`Fehler bei der Initialisierung der Deno-App: ${error.message}`, "Deno");
            throw error;
        }
    }

    async deleteDomain(domainId: number): Promise<void> {
        const domain = db.queryEntries(`
            SELECT id as domainId, name as domain 
            FROM domains WHERE id = ? AND runtime = 'deno'
        `, [domainId])[0] as DomainConfig;
        if (!domain) return;
        
        try {
            await this.stopDomainProcess(domainId);
            logInfo(`Deno-App für Domain ${domain.name} gelöscht`, "Deno");
        } catch (error) {
            logError(`Fehler beim Löschen der Deno-App: ${error.message}`, "Deno");
        }
    }

    async getInstalledVersions(): Promise<string[]> {
        try {
            const result = await run('/root/.dvm/bin/dvm', ['list'], { sudo: false });
            console.log(result);
            if (result.code !== 0) throw new Error(`Fehler beim Abrufen der installierten Deno-Versionen: ${result.stderr}`);
            
            const lines = result.stdout.split('\n');
            const versions: string[] = [];
            
            for (const line of lines) {
                const version = line.trim();
                if (version) versions.push(version);
            }
            
            return versions;
        } catch (error) {
            logError(`Fehler beim Abrufen der installierten Deno-Versionen: ${error.message}`, "Deno");
            return [];
        }
    }
    async remoteVersions(): Promise<string[]> {
        try {
            const result = await run('/root/.dvm/bin/dvm', ['list-remote'], { sudo: true }); // todo: cronjob: remove cache from time to time
            if (result.code !== 0) throw new Error(`Fehler beim Abrufen der installierten Deno-Versionen: ${result.stderr}`);
            return result.stdout.split('\n').filter(v => !v.trim()[0].match(/[0-0]/)).map(v => v.trim());
        } catch (error) {
            logError(`Fehler beim Abrufen der installierten Deno-Versionen: ${error.message}`, "Deno");
            return [];
        }
    }

    async startDomainProcess(domain: DomainConfig): Promise<void> {
        try {
            const domainId = domain.id;
            const domainPath = join(config.vhosts_root, domain.name, "deno-app");
            const denoJsonPath = join(domainPath, "deno.json");
            
            // Prüfen, ob deno.json existiert
            try {
                await Deno.stat(denoJsonPath);
            } catch {
                throw new Error(`deno.json konnte nicht gefunden werden für Domain ${domain.name}`);
            }
            
            // Port ist domainId + 3000
            const port = domainId + 3000;
            
            const linuxUser = `ne-do-${domainId}`;
            
            if (Deno.build.os === "windows") throw new Error("Windows wird nicht unterstützt");
            
            const version = domain.runtime_version || 'latest';

            // Auf Linux mit dem Domain-Benutzer ausführen
            //const cmd = `cd ${domainPath} && PORT=${port} /root/.dvm/bin/dvm use ${version} && PORT=${port} deno task start`;
            const cmd = `runuser -u ${linuxUser} -- bash -c 'cd ${domainPath} && PORT=${port} /root/.dvm/bin/dvm use ${version} && nohup deno task start &'`;
            // Normales sudo -u kann Probleme bei langlebigen Prozessen machen, daher würden hier ggf. andere Methoden verwendet
            
            const command = new Deno.Command("bash", {
                args: ["-c", cmd], // Beispiel: Ein Prozess, der 10 Sekunden läuft
                env: {
                    PORT: "8080",
                },
                stdout: "piped",
                stderr: "piped",
            });
            const process = command.spawn();
            const { code, stdout, stderr } = await process.output();

            console.log(cmd);
            console.log("Exit Code:", code);
            console.log("Stdout:", new TextDecoder().decode(stdout));
            console.log("Stderr:", new TextDecoder().decode(stderr));
            

            // Process-ID in der Datenbank speichern
            if (process.pid) {
                domainProcesses.set(domainId, process.pid);
                logInfo(`Deno-Prozess für Domain ${domain.name} gestartet (PID: ${process.pid})`, "Deno");
            } else {
                throw new Error("Konnte PID des gestarteten Prozesses nicht ermitteln");
            }
        } catch (error) {
            logError(`Fehler beim Starten des Deno-Prozesses: ${error.message}`, "Deno");
            throw error;
        }
    }

    async stopDomainProcess(domainId: number): Promise<void> {
        try {
            // Prozess-ID aus der Datenbank abrufen

            const pid = domainProcesses.get(domainId);
            if (!pid) {
                logInfo(`Kein laufender Deno-Prozess für Domain ID ${domainId} gefunden`, "Deno");
                return;
            }
            
            // Prozess beenden
            if (Deno.build.os === "windows") {
                await run('taskkill', ['/F', '/PID', process.pid.toString()], { sudo: false });
            } else {
                await run('kill', ['-15', process.pid.toString()], { sudo: true });
            }

            domainProcesses.delete(domainId);
            
            logInfo(`Deno-Prozess für Domain ID ${domainId} beendet (PID: ${process.pid})`, "Deno");
        } catch (error) {
            logError(`Fehler beim Beenden des Deno-Prozesses: ${error.message}`, "Deno");
            throw error;
        }
    }

}

// Exportiere eine Instanz der Runtime
export const denoRuntime = new DenoRuntime();
import { run } from '../../utils/command.ts';

export interface ProcessInfo {
    pid: number;
    name: string;
    domain: string;
    user: string;
    cpu: number;
    memory: number;
    diskRead: number;
    diskWrite: number;
}

interface WindowsProcess {
    Id: number;
    ProcessName: string;
    CPU?: number;
    Memory?: number;
    DiskRead?: number;
    DiskWrite?: number;
    UserName?: string;
}

async function getWindowsProcesses(): Promise<ProcessInfo[]> {
    const command = new Deno.Command("powershell", {
        args: [
            "-Command",
            `Get-Process | Where-Object {$_.ProcessName -match '^(php|nginx|apache|httpd|mysql|mariadb).*$'} | Select-Object Id,ProcessName,@{Name='CPU';Expression={$_.CPU}},@{Name='Memory';Expression={$_.WorkingSet64/1MB}},@{Name='DiskRead';Expression={$_.ReadOperationCount/1024}},@{Name='DiskWrite';Expression={$_.WriteOperationCount/1024}},@{Name='UserName';Expression={$_.UserName}} | ConvertTo-Json`
        ]
    });
    
    try {
        const { stdout } = await command.output();
        const processes = JSON.parse(new TextDecoder().decode(stdout)) as WindowsProcess | WindowsProcess[];
        
        if (!Array.isArray(processes)) {
            return processes ? [{
                pid: processes.Id,
                name: processes.ProcessName,
                domain: getDomainForProcess(processes.ProcessName),
                user: processes.UserName || 'System',
                cpu: Number(processes.CPU?.toFixed(1)) || 0,
                memory: Number((processes.Memory || 0).toFixed(1)),
                diskRead: Number((processes.DiskRead || 0).toFixed(2)),
                diskWrite: Number((processes.DiskWrite || 0).toFixed(2))
            }] : [];
        }

        return processes.map((p) => ({
            pid: p.Id,
            name: p.ProcessName,
            domain: getDomainForProcess(p.ProcessName),
            user: p.UserName || 'System',
            cpu: Number(p.CPU?.toFixed(1)) || 0,
            memory: Number((p.Memory || 0).toFixed(1)),
            diskRead: Number((p.DiskRead || 0).toFixed(2)),
            diskWrite: Number((p.DiskWrite || 0).toFixed(2))
        }));
    } catch (error) {
        console.error('Windows Prozess-Fehler:', error);
        return [];
    }
}

async function getLinuxProcesses(): Promise<ProcessInfo[]> {
    const command = new Deno.Command("ps", {
        args: [
            "-eo", "pid,comm:20,pcpu,pmem,user:20,maj_flt:10,min_flt:10",
            "--no-headers"
        ]
    });
    
    try {
        const { stdout, stderr } = await command.output();
        const output = new TextDecoder().decode(stdout);
        const error = new TextDecoder().decode(stderr);
        
        if (error) {
            console.error('Linux PS Error:', error);
        }
        
        if (!output.trim()) {
            console.error('PS Output ist leer!');
            return [];
        }

        return output
            .split("\n")
            .filter(line => line.trim())
            .map(line => {
                const [pid, name, cpu, mem, user, majFault, minFault] = line.trim().split(/\s+/);
                return {
                    pid: Number(pid),
                    name,
                    domain: getDomainForProcess(name),
                    user,
                    cpu: Number(cpu) || 0,
                    memory: Number(mem) || 0,
                    diskRead: Number(majFault || 0),
                    diskWrite: Number(minFault || 0)
                };
            });
    } catch (error) {
        console.error('Linux Prozess-Fehler:', error);
        return [];
    }
}

function getDomainForProcess(_processName: string): string {
    // Diese Funktion könnte erweitert werden, um die Domain aus Konfigurationsdateien zu lesen
    // Zum Beispiel durch Parsen von nginx/apache Konfigurationen
    return 'N/A';
}

export async function getProcessList(): Promise<ProcessInfo[]> {
    try {
        const isWindows = Deno.build.os === "windows";
        return isWindows ? await getWindowsProcesses() : await getLinuxProcesses();
    } catch (error) {
        console.error("Fehler beim Abrufen der Prozessliste:", error);
        return [];
    }
}

export async function killProcess(pid: number): Promise<boolean> {
    const isWindows = Deno.build.os === "windows";
    const isMac = Deno.build.os === "darwin";
    
    // windows: await run("taskkill", ["/PID", pid.toString(), "/F"], { silent: false }) :
    let result = null

    if (isWindows) {
        result = await run("taskkill", ["/PID", pid.toString(), "/F"], { silent: false, sudo: true });
    } else if (isMac) {
        result = await run("kill", ["-9", pid.toString()], { silent: false });
    } else {
        result = await run("kill", ["-9", pid.toString()], { silent: false });
    }   

    if (result.code !== 0) {
        console.error(`Fehler beim Beenden des Prozesses ${pid}:`, result.output);
        return false;
    }
    return true;
}
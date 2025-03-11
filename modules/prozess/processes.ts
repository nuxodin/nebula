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
    startTime: string;
    command: string;
    ports: string[];
    parentProcess?: {
        pid: number;
        name: string;
    };
}

interface WindowsProcess {
    Id: number;
    ProcessName: string;
    CPU?: number;
    Memory?: number;
    DiskRead?: number;
    DiskWrite?: number;
    UserName?: string;
    StartTime?: string;
    CommandLine?: string;
    ParentProcessId?: number;
}

async function getWindowsProcesses(): Promise<ProcessInfo[]> {
    const command = new Deno.Command("powershell", {
        args: [
            "-Command",
            `Get-Process | Where-Object {$_.ProcessName -match '^(php|nginx|apache|httpd|mysql|mariadb).*$'} | Select-Object Id,ProcessName,@{Name='CPU';Expression={$_.CPU}},@{Name='Memory';Expression={$_.WorkingSet64/1MB}},@{Name='DiskRead';Expression={$_.ReadOperationCount/1024}},@{Name='DiskWrite';Expression={$_.WriteOperationCount/1024}},@{Name='UserName';Expression={$_.UserName}},@{Name='StartTime';Expression={$_.StartTime}},@{Name='CommandLine';Expression={(Get-WmiObject Win32_Process -Filter "ProcessId = $($_.Id)").CommandLine}},@{Name='ParentProcessId';Expression={(Get-WmiObject Win32_Process -Filter "ProcessId = $($_.Id)").ParentProcessId}} | ConvertTo-Json`
        ]
    });
    
    try {
        const { stdout } = await command.output();
        const processes = JSON.parse(new TextDecoder().decode(stdout)) as WindowsProcess | WindowsProcess[];
        
        // Get ports using PowerShell
        const portsCommand = new Deno.Command("powershell", {
            args: [
                "-Command",
                "Get-NetTCPConnection | Select-Object OwningProcess,LocalPort | ConvertTo-Json"
            ]
        });
        const portsOutput = await portsCommand.output();
        const portData = JSON.parse(new TextDecoder().decode(portsOutput.stdout));
        const portMap = new Map<number, string[]>();
        (Array.isArray(portData) ? portData : [portData]).forEach((conn: any) => {
            if (!portMap.has(conn.OwningProcess)) {
                portMap.set(conn.OwningProcess, []);
            }
            portMap.get(conn.OwningProcess)?.push(conn.LocalPort.toString());
        });

        if (!Array.isArray(processes)) {
            return processes ? [{
                pid: processes.Id,
                name: processes.ProcessName,
                domain: getDomainForProcess(processes.ProcessName),
                user: processes.UserName || 'System',
                cpu: Number(processes.CPU?.toFixed(1)) || 0,
                memory: Number((processes.Memory || 0).toFixed(1)),
                diskRead: Number((processes.DiskRead || 0).toFixed(2)),
                diskWrite: Number((processes.DiskWrite || 0).toFixed(2)),
                startTime: processes.StartTime ? new Date(processes.StartTime).toISOString() : null,
                command: processes.CommandLine || processes.ProcessName,
                ports: portMap.get(processes.Id) || [],
                ...(processes.ParentProcessId && {
                    parentProcess: await getParentProcessInfo(processes.ParentProcessId)
                })
            }] : [];
        }

        const processInfos = await Promise.all(processes.map(async (p) => ({
            pid: p.Id,
            name: p.ProcessName,
            domain: getDomainForProcess(p.ProcessName),
            user: p.UserName || 'System',
            cpu: Number(p.CPU?.toFixed(1)) || 0,
            memory: Number((p.Memory || 0).toFixed(1)),
            diskRead: Number((p.DiskRead || 0).toFixed(2)),
            diskWrite: Number((p.DiskWrite || 0).toFixed(2)),
            startTime: p.StartTime ? new Date(p.StartTime).toISOString() : null,
            command: p.CommandLine || p.ProcessName,
            ports: portMap.get(p.Id) || [],
            ...(p.ParentProcessId && {
                parentProcess: await getParentProcessInfo(p.ParentProcessId)
            })
        })));

        return processInfos;
    } catch (error) {
        console.error('Windows Prozess-Fehler:', error);
        return [];
    }
}

async function getLinuxProcesses(): Promise<ProcessInfo[]> {
    const command = new Deno.Command("ps", {
        args: [
            "-eo", "pid,comm,pcpu,pmem,user,maj_flt,min_flt,lstart,cmd,ppid",
            "--no-headers"
        ]
    });
    
    const { stdout, stderr } = await command.output();
    const output = new TextDecoder().decode(stdout);
    const error = new TextDecoder().decode(stderr);
    
    if (error) console.error('Linux PS Error:', error);
    
    const processes = await Promise.all(output
        .split("\n")
        .filter(line => line.trim())
        .map(async line => {
            // Split, aber behalte Whitespace in cmd
            const parts = line.match(/^\s*(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+([A-Za-z]{3}\s+[A-Za-z]{3}\s+\d+\s+\d+:\d+:\d+\s+\d+)\s+(.+?)\s+(\S+)\s*$/);
            if (!parts) return null;

            const [, pid, name, cpu, mem, user, majFault, minFault, startTimeStr, cmd, ppid] = parts;

            // Read ports from /proc/net/tcp
            let ports: string[] = [];
            try {
                const tcp = await Deno.readTextFile('/proc/net/tcp');
                const tcp6 = await Deno.readTextFile('/proc/net/tcp6');
                [...tcp.split('\n'), ...tcp6.split('\n')]
                    .filter(line => line.includes(':'))
                    .forEach(line => {
                        const matches = line.trim().match(/:\s*[\da-f]+:(\d+)\s.*\s(\d+)/i);
                        if (matches && matches[2] === pid) {
                            const port = parseInt(matches[1], 16).toString();
                            ports.push(port);
                        }
                    });
            } catch (e) {
                // Ignore errors reading /proc
            }

            return {
                pid: Number(pid),
                name,
                domain: getDomainForProcess(name),
                user,
                cpu: Number(cpu) || 0,
                memory: Number(mem) || 0,
                diskRead: Number(majFault || 0),
                diskWrite: Number(minFault || 0),
                startTime: new Date(startTimeStr).toISOString(),
                command: cmd,
                ports,
                ...(ppid && Number(ppid) > 1 && {
                    parentProcess: await getParentProcessInfo(Number(ppid))
                })
            };
        }))
        .then(processes => processes.filter((p): p is ProcessInfo => p !== null));

    return processes;
}

async function getParentProcessInfo(ppid: number): Promise<{ pid: number; name: string; } | undefined> {
    try {
        if (Deno.build.os === "windows") {
            const result = await new Deno.Command("powershell", {
                args: [
                    "-Command",
                    `Get-Process -Id ${ppid} | Select-Object Id,ProcessName | ConvertTo-Json`
                ]
            }).output();
            const process = JSON.parse(new TextDecoder().decode(result.stdout));
            return {
                pid: process.Id,
                name: process.ProcessName
            };
        } else {
            const result = await new Deno.Command("ps", {
                args: ["-p", ppid.toString(), "-o", "comm="]
            }).output();
            return {
                pid: ppid,
                name: new TextDecoder().decode(result.stdout).trim()
            };
        }
    } catch {
        return undefined;
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
    
    // windows: await run("taskkill", ["/PID", pid.toString(), "/F"], { silent: false }) :
    let result = null

    if (isWindows) {
        result = await run("taskkill", ["/PID", pid.toString(), "/F"], { silent: false, sudo: true });
    } else {
        result = await run("kill", ["-9", pid.toString()], { silent: false });
    }   

    if (result.code !== 0) {
        console.error(`Fehler beim Beenden des Prozesses ${pid}:`, result.stderr);
        return false;
    }
    return true;
}
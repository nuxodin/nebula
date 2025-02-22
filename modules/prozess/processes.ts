export interface ProcessInfo {
    name: string;
    domain: string;
    user: string;
    cpu: number;
    memory: number;
    diskRead: number;
    diskWrite: number;
}

async function getWindowsProcesses(): Promise<ProcessInfo[]> {
    const command = new Deno.Command("powershell", {
        args: [
            "-Command",
            `Get-Process | Where-Object {$_.ProcessName -match '^(php|nginx|apache|httpd|mysql|mariadb).*$'} | Select-Object ProcessName,@{Name='CPU';Expression={$_.CPU}},@{Name='Memory';Expression={$_.WorkingSet64/1MB}},@{Name='DiskRead';Expression={$_.ReadOperationCount/1024}},@{Name='DiskWrite';Expression={$_.WriteOperationCount/1024}},@{Name='UserName';Expression={$_.UserName}} | ConvertTo-Json`
        ]
    });
    
    try {
        const { stdout } = await command.output();
        const processes = JSON.parse(new TextDecoder().decode(stdout));
        
        if (!Array.isArray(processes)) {
            return processes ? [processes] : [];
        }

        return processes.map((p: any) => ({
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
            "-eo", "comm:20,pcpu,pmem,user:20,maj_flt:10,min_flt:10",  // Changed format specifiers
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
            .filter(line => line.trim())  // Remove empty lines
            .map(line => {
                const [name, cpu, mem, user, majFault, minFault] = line.trim().split(/\s+/);
                return {
                    name,
                    domain: getDomainForProcess(name),
                    user,
                    cpu: Number(cpu) || 0,
                    memory: Number(mem) || 0,
                    diskRead: Number(majFault || 0),  // Using page faults as disk activity indicator
                    diskWrite: Number(minFault || 0)
                };
            });
    } catch (error) {
        console.error('Linux Prozess-Fehler:', error);
        return [];
    }
}

function getDomainForProcess(processName: string): string {
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
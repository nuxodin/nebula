import { run } from "./command.ts";

export async function osInfo() {
    try {
        // Get system info (exact distribution and version)
        let systemInfo = Deno.build.os + " " + Deno.build.arch;
        if (Deno.build.os === "linux") {
            const { output } = await run("cat", ["/etc/os-release"]);
            const releaseName = output.match(/PRETTY_NAME="(.*)"/)?.[1];
            systemInfo = releaseName ? releaseName : systemInfo;
        } else if (Deno.build.os === "darwin") {
            const { output } = await run("sw_vers", []);
            const versionName = output.match(/ProductName:\s*(.*)/)?.[1];
            systemInfo = versionName ? versionName : systemInfo;
        } else if (Deno.build.os === "windows") {
            const { output } = await run("systeminfo", []);
            const versionName = output.match(/OS Name:\s*(.*)/)?.[1];
            systemInfo = versionName ? versionName : systemInfo;
        }

        // Get IP address
        let ipAddress;
        try {
            const networkInterfaces = Deno.networkInterfaces();
            ipAddress = networkInterfaces.find(i => i.family === "IPv4")?.address || "127.0.0.1";
        } catch (netError) {
            console.error("Network error:", netError);
            ipAddress = "127.0.0.1";
        }
        
        // Get uptime using performance.now()
        const uptimeMs = performance.now();
        const uptimeHours = Math.floor(uptimeMs / (1000 * 60 * 60));
        
        // Get memory usage using Deno.systemMemoryInfo()
        let memUsage = 0;
        try {
            const memInfo = Deno.systemMemoryInfo();
            const totalMem = memInfo.total;
            const freeMem = memInfo.free;
            const usedMem = totalMem - freeMem;
            memUsage = Math.round((usedMem / totalMem) * 100);
        } catch (memError) {
            console.error("Memory error:", memError);
        }

        // Get CPU and disk usage
        const isWindows = Deno.build.os === "windows";
        let cpuUsage = 0;
        let diskUsage = 0;

        if (isWindows) {
            try {
                // Windows CPU usage
                const { output: cpuOut } = await run("powershell", [
                    "-Command",
                    "Get-Counter '\\Processor(_Total)\\% Processor Time' | Select-Object -ExpandProperty CounterSamples | Select-Object -ExpandProperty CookedValue"
                ]);
                cpuUsage = Math.round(parseFloat(cpuOut) || 0);

                // Windows disk usage (C: drive)
                const { output: diskOut } = await run("powershell", [
                    "-Command",
                    "(Get-PSDrive C | Select-Object Used,Free | ForEach-Object { $_.Used/($_.Used + $_.Free) * 100 })"
                ]);
                diskUsage = Math.round(parseFloat(diskOut) || 0);
            } catch (shellError) {
                console.error("Shell command error:", shellError);
            }
        } else {
            try {
                // Unix CPU usage
                const { output: cpuOut } = await run("sh", [
                    "-c",
                    "top -bn1 | grep 'Cpu(s)' | sed 's/.*, *\\([0-9.]*\\)%* id.*/\\1/' | awk '{print 100 - $1}'"
                ]);
                cpuUsage = Math.round(parseFloat(cpuOut) || 0);

                // Unix disk usage
                const { output: diskOut } = await run("sh", [
                    "-c",
                    "df / | tail -1 | awk '{print $5}' | sed 's/%//'"
                ]);
                diskUsage = parseInt(diskOut) || 0;
            } catch (shellError) {
                console.error("Shell command error:", shellError);
            }
        }

        return {
            system: systemInfo,
            ipAddress,
            uptime: `${uptimeHours}h`,
            cpuUsage,
            memoryUsage: memUsage,
            diskUsage
        };
        
    } catch (error) {
        console.error("Critical error in osInfo:", error);
        return {
            system: Deno.build.os + " " + Deno.build.arch,
            ipAddress: "127.0.0.1",
            uptime: "0h",
            cpuUsage: 0,
            memoryUsage: 0,
            diskUsage: 0
        };
    }
}
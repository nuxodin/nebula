import { Context } from "hono";
import { logError, logInfo } from "../../utils/logger.ts";
import { startService, stopService, reloadService, run, isCommandAvailable, useSystem } from "../../utils/command.ts";


// Service helper functions
async function getWindowsServices() {
    const { stdout } = await run("sc", ["query"]);
    const services = [];
    let currentService: any = {};

    // Get basic info first
    const lines = stdout.split("\n");
    for (const line of lines) {
        const serviceLine = line.trim();
        if (serviceLine.startsWith("SERVICE_NAME:")) {
            if (currentService.name) {
                services.push(currentService);
            }
            currentService = {
                originalName: serviceLine.substring(13).trim(),
                name: serviceLine.substring(13).trim().toLowerCase(),
                status: "UNKNOWN",
                description: "",
                startType: "unknown"
            };
        } else if (serviceLine.startsWith("STATE")) {
            const status = serviceLine.includes("RUNNING") ? "RUNNING" :
                serviceLine.includes("STOPPED") ? "STOPPED" :
                    "UNKNOWN";
            currentService.status = status.toLowerCase();
        }
    }
    if (currentService.name) {
        services.push(currentService);
    }

    // Get additional details for each service
    for (const service of services) {
        try {
            // Get config info
            const configResult = await run("sc", ["qc", service.originalName]);
            const configLines = configResult.stdout.split("\n");

            for (const line of configLines) {
                const trimmedLine = line.trim();
                if (trimmedLine.startsWith("START_TYPE")) {
                    const startType = trimmedLine.includes("AUTO_START") ? "auto" :
                        trimmedLine.includes("DEMAND_START") ? "manual" :
                            trimmedLine.includes("DISABLED") ? "disabled" : "unknown";
                    service.startType = startType;
                }
            }

            // Get description
            const descResult = await run("sc", ["qdescription", service.originalName]);
            const descLines = descResult.stdout.split("\n");
            if (descLines.length > 1) {
                service.description = descLines[1].trim();
            }
        } catch (err) {
            console.error(`Error getting details for ${service.name}:`, err);
        }
    }

    return services;
}

async function getLinuxServices() {
    const services = [];
    const use = await useSystem();

    if (use === "systemctl") {
        // Systemd
        const { stdout } = await run("systemctl", ["list-units", "--type=service", "--all", "--no-pager", "--no-legend"], { throw: true });
        const lines = stdout.split("\n");

        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 4 && parts[0].endsWith(".service")) {
                const name = parts[0].replace(".service", "");
                const status = parts[3].toLowerCase();

                try {
                    // Get additional service info
                    const { stdout: statusOutput } = await run("systemctl", ["status", parts[0], "--no-pager"]);
                    const description = statusOutput.split("\n")
                        .find(line => !line.startsWith(" ") && !line.includes("●"))?.trim() || "";

                    const { stdout: showOutput } = await run("systemctl", ["show", parts[0], "--property=UnitFileState"]);
                    const startType = showOutput.includes("enabled") ? "auto" :
                        showOutput.includes("disabled") ? "disabled" : "manual";

                    services.push({
                        name: name.toLowerCase(),
                        originalName: name,
                        status,
                        description,
                        startType
                    });
                } catch (err) {
                    console.error(`Error getting details for ${name}:`, err);
                    services.push({
                        name: name.toLowerCase(),
                        originalName: name,
                        status,
                        description: "",
                        startType: "unknown"
                    });
                }
            }
        }
    } else {

        if (use === "service") {
            const { stdout } = await run("service", ["--status-all"], { throw: true });
            const lines = stdout.split("\n");


            for (const line of lines) {

                const match = line.match(/^\s*\[\s*([+\-\?])\s*\]\s+(\S+)/);

                if (match) {
                    const status = match[1] === '+' ? "running" : "stopped";
                    const name = match[2];

                    try {
                        // Try to get service description from init script
                        let description = "";
                        let startType = "unknown";

                        if (await isCommandAvailable("chkconfig")) {
                            const { stdout: chkConfigOutput } = await run("chkconfig", ["--list", name]);
                            startType = chkConfigOutput.includes(":on") ? "auto" : "manual";
                        }

                        try {
                            const { stdout: scriptContent } = await run("cat", [`/etc/init.d/${name}`]);
                            const descMatch = scriptContent.match(/^#\s*description:\s*(.+)$/m);
                            description = descMatch ? descMatch[1].trim() : "";
                        } catch {
                            // Ignore errors reading description
                        }

                        services.push({
                            name: name.toLowerCase(),
                            originalName: name,
                            status,
                            description,
                            startType
                        });
                    } catch (err) {
                        console.error(`Error getting details for ${name}:`, err);
                        services.push({
                            name: name.toLowerCase(),
                            originalName: name,
                            status,
                            description: "",
                            startType: "unknown"
                        });
                    }
                }
            }
        } else {
            try {
                const { stdout } = await run("ls", ["-1", "/etc/init.d"]);
                const services = stdout.split("\n").filter(name => name.trim());

                for (const name of services) {
                    try {
                        const { code } = await run(`/etc/init.d/${name}`, ["status"], { throw: true });
                        const status = code === 0 ? "running" : "stopped";

                        let description = "";
                        try {
                            const { stdout: scriptContent } = await run("cat", [`/etc/init.d/${name}`]);
                            const descMatch = scriptContent.match(/^#\s*description:\s*(.+)$/m);
                            description = descMatch ? descMatch[1].trim() : "";
                        } catch {
                            // Ignore errors reading description
                        }

                        services.push({
                            name: name.toLowerCase(),
                            originalName: name,
                            status,
                            description,
                            startType: "unknown" // Can't reliably determine start type in pure init.d
                        });
                    } catch (err) {
                        console.error(`Error getting status for ${name}:`, err);
                    }
                }
            } catch (err) {
                console.error("Error listing init.d services:", err);
            }
        }
    }
    return services;
}

// API Controllers
export const api = {
    get: async function (_c: Context) {
        const services = Deno.build.os === "windows"
            ? await getWindowsServices()
            : await getLinuxServices();
        return services;
    },
    ':name': {
        start: {
            post: async function (c: Context) {
                const { name } = c.req.param();
                try {
                    // Find original service name (case-sensitive for Windows)
                    let serviceName = name;
                    if (Deno.build.os === "windows") {
                        const services = await getWindowsServices();
                        const service = services.find(s => s.name === name.toLowerCase());
                        if (!service) throw new Error(`Service ${name} not found`);
                        serviceName = service.originalName;
                    }

                    await startService(serviceName);
                    logInfo(`Service ${name} started`, "Services", c);
                    return { success: true, message: `Service ${name} started` };
                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : String(err);
                    logError(`Error starting ${name}`, "Services", c, err);
                    return { success: false, error: message };
                }
            }
        },
        stop: {
            post: async function (c: Context) {
                const { name } = c.req.param();
                // Find original service name (case-sensitive for Windows)
                let serviceName = name;
                if (Deno.build.os === "windows") {
                    const services = await getWindowsServices();
                    const service = services.find(s => s.name === name.toLowerCase());
                    if (!service) throw new Error(`Service ${name} not found`);
                    serviceName = service.originalName;
                }
                await stopService(serviceName);
                logInfo(`Service ${name} stopped`, "Services", c);
                return { success: true, message: `Service ${name} stopped` };
            },
        },
        restart: {
            post: async function (c: Context) {
                const { name } = c.req.param();
                try {
                    // Find original service name (case-sensitive for Windows)
                    let serviceName = name;
                    if (Deno.build.os === "windows") {
                        const services = await getWindowsServices();
                        const service = services.find(s => s.name === name.toLowerCase());
                        if (!service) {
                            throw new Error(`Service ${name} not found`);
                        }
                        serviceName = service.originalName;
                    }

                    await stopService(serviceName);
                    await startService(serviceName);


                    logInfo(`Service ${name} restarted`, "Services", c);
                    return { success: true, message: `Service ${name} restarted` };
                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : String(err);
                    logError(`Error restarting ${name}`, "Services", c, err);
                    return { success: false, error: message };
                }
            }
        }
    }
};


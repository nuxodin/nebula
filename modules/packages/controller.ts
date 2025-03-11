import { Context } from "hono";
import { run } from "../../utils/command.ts";
import { packetManager, updatePackages } from '../../utils/command.ts';

interface Package {
    name: string;
    version: string;
    installed: boolean;
    automatic: boolean;
    availableVersion?: string;
    hasUpdate?: boolean;
}

interface PackageCommand {
    cmd: string;
    args: string[];
    parser: (output: string) => Package[];
    updateInfo?: (pm: string) => Promise<Record<string, {version: string}>>;
}

// API endpoints
export const api = {
    get: async function (_c: Context) {
        const pm = await packetManager();
        const commands: Record<string, PackageCommand> = {
            apt: { 
                cmd: "apt", 
                args: ["list", "--installed"], 
                parser: parseApt,
                updateInfo: getAptUpdateInfo 
            },
            yum: {
                cmd: "yum", 
                args: ["list", "installed"], 
                parser: parseYum,
                updateInfo: getYumUpdateInfo 
            },
            dnf: {
                cmd: "dnf", 
                args: ["list", "installed"], 
                parser: parseDnf,
                updateInfo: getYumUpdateInfo
            },
            dpkg: { cmd: "dpkg", args: ["-l"], parser: parseDpkg },
            pacman: { cmd: "pacman", args: ["-Q"], parser: parsePacman },
            zypper: { cmd: "zypper", args: ["search", "-i"], parser: parseZypper },
            winget: { cmd: "wmic", args: ["product", "get", "name,version", "/format:csv"], parser: parseWindows },
            brew: { cmd: "brew", args: ["list", "--versions"], parser: parseMac },
        };

        const command = commands[pm];
        if (!command) throw new Error(`Package manager ${pm} not supported`);

        const result = await run(command.cmd, command.args, { silent: true });
        if (result.code !== 0) throw new Error(`Failed to get packages: ${result.stderr}`);

        // Get installed packages
        const packages = command.parser(result.stdout);

        // Get update info if supported
        if (command.updateInfo) {
            const updates = await command.updateInfo(pm);
            packages.forEach((pkg: Package) => {
                const update = updates[pkg.name];
                if (update) {
                    pkg.availableVersion = update.version;
                    pkg.hasUpdate = true;
                }
            });
        }

        return packages;
    },
    
    update: {
        post: async function() {
            await updatePackages();
            return { success: true };
        }
    }
};

async function getAptUpdateInfo(pm: string): Promise<Record<string, {version: string}>> {
    const updateInfo = await run(pm, ["list", "--upgradeable"], { silent: true });
    if (updateInfo.code !== 0) return {};

    const updates: Record<string, {version: string}> = {};
    updateInfo.stdout.split("\n").forEach(line => {
        if (!line.includes("upgradable")) return;
        const [nameVer] = line.split(" [upgradable");
        const [name, version] = nameVer.split("/");
        if (name && version) {
            updates[name.trim()] = { version: version.trim() };
        }
    });
    return updates;
}

async function getYumUpdateInfo(pm: string): Promise<Record<string, {version: string}>> {
    const updateInfo = await run(pm, ["check-update"], { silent: true });
    if (updateInfo.code !== 100) return {}; // 100 means updates available

    const updates: Record<string, {version: string}> = {};
    updateInfo.stdout.split("\n").forEach(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
            updates[parts[0]] = { version: parts[1] };
        }
    });
    return updates;
}

// Parser functions
function parseApt(output: string): Package[] {
    return output.split("\n")
        .filter(line => line.includes("installed"))
        .map(line => {
            const [nameVer, flags] = line.split(" [");
            if (!nameVer) return null;
            const [name, versionInfo] = nameVer.split("/");
            if (!name || !versionInfo) return null;
            const version = versionInfo.split(" ")[1] || "";
            const automatic = flags?.includes("automatic");
            return { 
                name: name.trim(),
                version: version.trim(),
                installed: true,
                automatic: !!automatic
            };
        })
        .filter((pkg): pkg is Package => pkg !== null);
}

function parseDpkg(output: string): Package[] {
    return output.split("\n")
        .filter(line => line.startsWith("ii"))
        .map(line => {
            const parts = line.split(/\s+/);
            return { name: parts[1] || "", version: parts[2] || "", installed: true, automatic: false };
        });
}

function parsePacman(output: string): Package[] {
    return output.split("\n")
        .filter(line => line.trim())
        .map(line => {
            const [name, version] = line.split(" ");
            return { name: name || "", version: version || "", installed: true, automatic: false };
        });
}

function parseWindows(output: string): Package[] {
    return output.split("\n")
        .map(line => line.trim())
        .filter(line => line && !line.startsWith("Node"))
        .map(line => {
            const [, name, version] = line.split(",");
            return { name: name || "", version: version || "", installed: true, automatic: false };
        })
        .filter(pkg => pkg.name && pkg.version);
}

function parseMac(output: string): Package[] {
    return output.split("\n")
        .filter(line => line.trim())
        .map(line => {
            const [name, ...versions] = line.split(" ");
            return { name, version: versions.join(" "), installed: true, automatic: false };
        });
}

function parseDnf(output: string) {
    return output.split("\n")
        .map(line => line.trim())
        .filter(line => line && !line.startsWith("Installed") && !line.startsWith("Repo"))
        .map(line => {
            const parts = line.split(/\s+/);
            return { name: parts[0] || "", version: parts[1] || "", installed: true, automatic: false };
        });
}

function parseYum(output: string) {
    return output.split("\n")
        .map(line => line.trim())
        .filter(line => line && !line.startsWith("Installed Packages") && !line.includes("Repo"))
        .map(line => {
            const parts = line.split(/\s+/);
            return { name: parts[0] || "", version: parts[1] || "", installed: true, automatic: false };
        });
}

function parseZypper(output: string) {
    return output.split("\n")
        .map(line => line.trim())
        .filter(line => line && !line.startsWith("S |") && !line.startsWith("---"))
        .map(line => {
            const parts = line.split(/\s*\|\s*/);
            return { name: parts[1] || "", version: parts[3] || "", installed: true, automatic: false };
        });
}

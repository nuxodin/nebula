import { run } from "../../utils/command.ts";
import { isWindows } from "./utils.ts";
import { installPackages, isPackageInstalled, isCommandAvailable } from "../../utils/command.ts";
import { logInfo } from "../../utils/logger.ts";

// API Controller Functions

const COMPONENTS_FILE = "./modules/components/components.json";

export async function getComponents() {
    const content = await Deno.readTextFile(COMPONENTS_FILE);
    return JSON.parse(content);
}

const installing = <{ [key: string]: { timestamp: number } }>{};

export async function getInstalledComponents() {
    const installed = <{ [key: string]: number }>{};
    const components = await getComponents();

    for (const [name, component] of Object.entries(components)) {
        if (await isComponentInstalled(component)) {
            installed[name] = 1;
        } else if (installing[name]) {
            installed[name] = 0.5;
        }
    }

    return installed;
}

async function isComponentInstalled(config: any): Promise<boolean> {
    if (!config) return false;

    if (isWindows()) return false; // todo: windows unterstützung rein

    if (config.check_path) {
        const exists = await run('test', ['-e', config.check_path], { silent: false });
        if (exists.code === 0) return true;
    }
    // if (config.provides) {
    //     const exists = await isCommandAvailable(config.provides);
    //     if (exists) return true;
    // }
    if (config.package) {
        return await isPackageInstalled(config.package);
    }
    return false;
}

export async function installComponentBackground(component: string, version: string | undefined, componentConfig: any) {
    const config = version ? componentConfig.versions?.[version] : componentConfig;
    if (!config) throw new Error(`Version ${version} nicht gefunden`);

    if (isWindows()) throw new Error('Windows wird noch nicht unterstützt');

    installing[component] = { timestamp: Date.now() };

    if (config.install_cmd) {
        const out = await run("sh", ["-c", config.install_cmd], { sudo: true });
        if (out.code !== 0) {
            delete installing[component];
            throw new Error(`Installation fehlgeschlagen`);
        }
    } else if (config.package) {
        try {
            await installPackages([config.package]);
        } catch (error) {
            delete installing[component];
            throw error;
        }
    } else {
        delete installing[component];
        throw new Error(`Keine Installationsanweisungen für ${component}`);
    }
    
    logInfo(`${component} ${version || ''} wurde erfolgreich installiert`, "Components");
}
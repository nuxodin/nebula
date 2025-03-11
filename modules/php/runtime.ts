import { Runtime, DomainConfig } from "../../utils/runtime.ts";
import db from "../../utils/database.ts";
import { join } from "https://deno.land/std/path/mod.ts";
import { ensureDir } from 'https://deno.land/std/fs/mod.ts';
import { config } from "../../utils/config.ts";
import { run } from "../../utils/command.ts";
import { logError, logInfo } from "../../utils/logger.ts";
import { FunctionFlags } from 'https://deno.land/x/sqlite@v3.9.1/src/constants.ts';



class PhpRuntime implements Runtime {
    async installedVersions(): Promise<string[]> {
    }
    async remoteVersions(): Promise<string[]> {
    }
    async initDomain(domain): Promise<void> {
        const appDir = join(config.vhosts_root, domain.name, "httpdocs");
        await ensureDir(appDir);
    }
    async deleteDomain(domainId: number): Promise<void> {
    }
    async startDomainProcess(domainId: number): Promise<void> {
    }
    async stopDomainProcess(domainId: number): Promise<void> {
    }
}

// Exportiere eine Instanz der Runtime
export const phpRuntime = new PhpRuntime();
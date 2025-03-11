// Runtime Interface Definition

export interface Runtime {
    installedVersions(): Promise<string[]>;
    remoteVersions(): Promise<string[]>;
    initDomain(domain): Promise<void>;
    deleteDomain(domain): Promise<void>;
    startDomainProcess(domain): Promise<void>;
    stopDomainProcess(domain): Promise<void>;
}

// Runtime Registry
export const runtimes: Record<string, Runtime> = {};

export function registerRuntime(name: string, runtime: Runtime) {
    runtimes[name] = runtime;
}

export function getRuntime(name: string): Runtime {
    if (!runtimes[name]) throw new Error(`Runtime "${name}" not found. Available: ${Object.keys(runtimes).join(', ')}`);
    return runtimes[name];
}

// static runtime:

class staticRuntime implements Runtime {
    async installedVersions(): Promise<string[]> {
        return null;
    }
    async remoteVersions(): Promise<string[]> {
        return null;
    }
    async initDomain(domain): Promise<void> {
    }
    async deleteDomain(domain): Promise<void> {
    }
    async startDomainProcess(domain): Promise<void> {
    }
    async stopDomainProcess(domain): Promise<void> {
    }
}

registerRuntime('static', new staticRuntime());


// oder besser so?

// class Runtime {
//     constructor(functions) {
//         this.functions = functions;
//     }
//     installedVersions(): Promise<string[]> {
//         return this.functions.installedVersions();
//     }
//     remoteVersions(): Promise<string[]> {
//         return this.functions.remoteVersions();
//     }
//     async versions(): Promise<string[]> {
//         const installed = await this.installedVersions();
//         const remote = await this.remoteVersions();
//         const data: any = {};
//         for (const [version, isIt] of Object.entries(installing)) {
//             data[version] ??= {};
//             data[version].installing = isIt;
//         }
//         for (const version of installed) {
//             data[version] ??= {};
//             data[version].installed = true;
//         }
//         for (const version of remote) {
//             data[version] ??= {};
//             data[version].remote = true;
//         }
//         return data;
//     }
//     initDomain(domain): Promise<void> {
//     }
//     deleteDomain(domainId: number): Promise<void> {
//     }
//     startDomainProcess(domainId: number): Promise<void> {
//     }
//     stopDomainProcess(domainId: number): Promise<void> {
//     }
// }

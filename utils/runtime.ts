// Runtime Interface Definition
export interface RuntimeConfig {
    defaultVersion: string;
    permissions: Record<string, boolean>;
    maxMemory: number;
    maxCpu: number;
    watchMode: boolean;
    entryPoint?: string;
}

export interface DomainConfig extends Record<string, unknown> {
    domainId: number;
    domain: string;
    entryPoint: string;
    runtime: string;
    runtimeVersion?: string;
    runtime_pid?: number;
}

export interface Runtime {
    initDomain(domainId: number): Promise<void>;
    deleteDomain(domainId: number): Promise<void>;
    getInstalledVersions(): Promise<string[]>;
    startDomainProcess(domain: DomainConfig): Promise<void>;
    stopDomainProcess(domainId: number): Promise<void>;
}

// Runtime Registry
const runtimes: Record<string, Runtime> = {};

export function registerRuntime(name: string, runtime: Runtime) {
    runtimes[name] = runtime;
}

export function getRuntime(name: string): Runtime {
    if (!runtimes[name]) {
        throw new Error(`Runtime "${name}" not found. Available runtimes: ${Object.keys(runtimes).join(', ')}`);
    }
    return runtimes[name];
}

// Helper function to initialize a domain with the appropriate runtime
export async function initDomain(domainId: number, runtime: string) {
    const runtimeHandler = getRuntime(runtime);
    await runtimeHandler.initDomain(domainId);
}

// Helper function to delete a domain from its runtime
export async function deleteDomain(domainId: number, runtime: string) {
    const runtimeHandler = getRuntime(runtime);
    await runtimeHandler.deleteDomain(domainId);
}
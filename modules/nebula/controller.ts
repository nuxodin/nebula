import { Context } from "hono";
import { run } from "../../utils/command.ts";

export async function getGitInfo() {
    const gitInfo = { hasUpdates: false, branch: '', error: null as string | null };
    try {
        const gitDir = new URL('../../.git', import.meta.url);
        const gitExists = await Deno.stat(gitDir).catch(() => null);
        
        if (gitExists) {
            const remoteBranch = await run("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
            if (remoteBranch.code === 0) {
                await run("git", ["fetch"]);
                const status = await run("git", ["status", "-uno"]);
                gitInfo.hasUpdates = status.stdout.includes("Your branch is behind");
                const branch = await run("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
                gitInfo.branch = branch.stdout.trim();
            }
        }
    } catch (error) {
        gitInfo.error = error instanceof Error ? error.message : String(error);
    }
    return gitInfo;
}

export async function getSystemInfo(_c: Context) {
    const permissionsList = ['env', 'read', 'write', 'net', 'run', 'ffi', 'sys'] as const;
    const permissionsPromises = permissionsList.map(async (name) => {
        const result = await Deno.permissions.query({ name });
        return [name, result.state === 'granted'];
    });
    const permissionsArray = await Promise.all(permissionsPromises);
    const permissionsObject = Object.fromEntries(permissionsArray);

    // Get timezone information
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const serverTime = new Date().toLocaleString('de-DE', { timeZone: timezone });

    const info = {
        denoVersion: Deno.version,
        execPath: Deno.execPath(),
        hostname: Deno.hostname(),
        loadavg: Deno.build.os === 'windows' ? null : Deno.loadavg(),
        memory: Deno.memoryUsage(),
        os: {
            release: await Deno.osRelease(),
            platform: Deno.build.os,
            arch: Deno.build.arch,
        },
        env: Deno.env.toObject(),
        args: Deno.args,
        pid: Deno.pid,
        ppid: Deno.ppid,
        mainModule: Deno.mainModule,
        permissions: permissionsObject,
        timezone,
        serverTime
    };
    
    return info;
}

export const restart = (_c: Context) => {
    setTimeout(() => {
        const permissionFlags = [
            "--allow-net",
            "--allow-read",
            "--allow-write",
            "--allow-env",
            "--allow-sys",
            "--allow-run",
        ];
        const command = new Deno.Command(Deno.execPath(), {
            args: [
                "run",
                ...permissionFlags,
                Deno.mainModule,
                ...Deno.args
            ],
            env: Deno.env.toObject(),
            stdout: "inherit",
            stderr: "inherit",
        });
        command.spawn();
        Deno.exit();
    }, 100);
    
    return { success: true, message: 'Restarting...' };
};

export const gitPull = async () => {
    try {
        const result = await run("git", ["pull"]);
        if (result.code === 0) {
            return { success: true, message: result.stdout };
        } else {
            throw new Error(result.stderr || 'Git pull failed');
        }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
};


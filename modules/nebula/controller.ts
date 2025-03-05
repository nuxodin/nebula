import { Context } from "hono";

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
        ppid: Deno.ppid+'xxxxx',
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


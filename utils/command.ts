// Utility functions for running commands

export async function stat(path: string) {
  try {
    return await Deno.stat(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return null;
    throw error;
  }
}

/**
 * Runs a shell command and returns the exit code and output
 */
export async function run(
  command: string, 
  args: string[] = [], 
  options: {silent?: boolean, sudo?: boolean, user?: string, throw?: boolean} = {}
) {
  const { silent = true, sudo = false, user } = options;

  let finalArgs = args;
  if (sudo) {
    const sudoCmd = await getSudo();
    if (sudoCmd) {
      finalArgs = [command, ...args];
      command = sudoCmd;
    } else {
      finalArgs = args;
    }
  } else if (user) {
    const sudoCmd = await getSudo();
    if (sudoCmd) {
      finalArgs = ['-u', user, command, ...args];
      command = sudoCmd;
    } else {
      finalArgs = ['-c', `${command} ${args.join(' ')}`, user];
      command = 'su';
    }
  }
  const process = new Deno.Command(command, {
    args: finalArgs,
    stdout: "piped",
    stderr: "piped"
  });

  const result = await process.output();
  const stdout = new TextDecoder().decode(result.stdout);
  const stderr = new TextDecoder().decode(result.stderr);

  if (!silent) {
    console.log(stdout);
    console.error(stderr);
  }
  if (options.throw && result.code !== 0) {
    throw new Error(`Command '${command} ${args.join(" ")}' failed with code ${result.code}: ${stderr}`);
  }

  return { 
    code: result.code, 
    stdout, 
    stderr
  };
}



/**
 * Checks if a command is available on the system
 */
export const isCommandAvailable = async (cmd: string) => {
  const isWindows = Deno.build.os === "windows";
  return (await run(
    isWindows ? "cmd" : "sh",
    isWindows ? ["/c", "where", cmd] : ["-c", `command -v ${cmd}`],
  )).code === 0;
  // todo: discuss this with the team
  // const { code } = await run(
  //   isWindows ? "where" : "which", 
  //   [cmd], 
  //   { silent: true }
  // );
  // return code === 0;
};



/**
 * Gets sudo command if available, otherwise returns empty string
 */
export const getSudo = async () => (await isCommandAvailable("sudo")) ? "sudo" : "";


const packetManager_noCache = async () => {
  if (Deno.build.os === "windows") return "winget";
  if (Deno.build.os === "darwin") return "brew";
  if (await isCommandAvailable("apt")) return "apt";
  if (await isCommandAvailable("dnf")) return "dnf"; // prefer dnf over yum
  if (await isCommandAvailable("yum")) return "yum";
  return "apt";
};
let pm_cache = null;
export async function packetManager(){
  return pm_cache ?? (pm_cache = await packetManager_noCache());
}

/**
 * Installs packages using the appropriate package manager (apt, yum, dnf, apk)
 */
export const installPackages = async (packages: string[]) => {
  const pm = await packetManager();
  console.log(`📦 ${pm} wird verwendet, um Pakete zu installieren: ${packages.join(", ")}`);

  const commands = {
    apt: [["update"], ["install", "-y", ...packages]],
    yum: [["install", "-y", ...packages]],
    dnf: [["install", "-y", ...packages]],
    apk: [["update"], ["add", ...packages]],
    winget: [["install", "-e", ...packages]]
  };
  for (const cmd of commands[pm]) {
    const result = await run(pm, cmd, { sudo: true });
    if (result.code !== 0) throw new Error(`❌ Fehler beim Ausführen von '${pm} ${cmd.join(" ")}': (code ${result.code}) ${result.stderr}`);
  }
  console.log(`✅ Pakete ${packages.join(", ")} wurden erfolgreich installiert!`);
}  

export const updatePackages = async () => {
  const pm = await packetManager();
  console.log(`📦 ${pm} wird verwendet, um Pakete zu aktualisieren...`);

  const commands = {
    apt: [["update"], ["upgrade", "-y"]],
    yum: [["update", "-y"]],
    dnf: [["update", "-y"]],
    apk: [["update"], ["upgrade"]],
    winget: [["upgrade"]]
  };

  for (const cmd of commands[pm]) {
    const result = await run(pm, cmd, { sudo: true });
    if (result.code !== 0) {
      throw new Error(`❌ Fehler beim Ausführen von '${pm} ${cmd.join(" ")}': (code ${result.code}) ${result.stderr}`);
    }
  }
  console.log(`✅ Pakete wurden erfolgreich aktualisiert!`);

};

export const isPackageInstalled = async (pkg: string): Promise<boolean> => {
  const isWindows = Deno.build.os === "windows";
  const cmds = isWindows 
    ? [["winget", `list ${pkg}`]]
    : [
        ["dpkg", `-l ${pkg}`],    // Debian/Ubuntu
        ["rpm", `-q ${pkg}`],     // RedHat/CentOS
        ["pacman", `-Qs ${pkg}`], // Arch
        ["apk", `info ${pkg}`]    // Alpine
      ];

  for (const [cmd, args] of cmds) {
    if (await isCommandAvailable(cmd)) {
      const { code, stdout } = await run(cmd, args.split(" "), {silent: true});
      if (code === 0 && stdout.includes(pkg)) return true;
    }
  }
  return false;
};


/**
 * Service Management
 */

const useSystem_noCache = async (): Promise<string> => {
  if (Deno.build.os === "windows") return "sc";
  const initSystem = await run("cat", ["/proc/1/comm"]);
  const initProcess = initSystem.stdout.trim();
  if (initProcess === "systemd") return "systemctl";
  if (initProcess === "init") return "init";
  return await isCommandAvailable("service") ? "service" : "init";
};
let useSystemCache: string | null = null;

export async function useSystem() {
  return useSystemCache ?? (useSystemCache = await useSystem_noCache());
};

export const startService = async (service: string) => {
  console.log(`\n⚙️ Dienst ${service} wird gestartet...`);
  const commandKey = await useSystem();
  const commands = {
    sc:        { args: ["start", service] },
    systemctl: { args: ["start", service] },
    service:   { args: [service, "start"] },
    init:      { cmd: `/etc/init.d/${service}`, args: ["start"] },
  };
  const mapping = commands[commandKey];
  if (!mapping) throw new Error(`❌ Kein geeigneter Befehl zum Starten von ${service} gefunden.`);
  const result = await run(mapping.cmd ?? commandKey, mapping.args, { sudo: true });
  if (result.code !== 0) throw new Error(`❌ Fehler beim Starten von ${service}: ${result.stderr}`);
};

export const stopService = async (service: string) => {
  console.log(`\n⚙️ ${service} wird gestoppt...`);
  const commandKey = await useSystem();
  const commands = {
    sc: {        args: ["stop", service] },
    systemctl: { args: ["stop", service] },
    service: {   args: [service, "stop"] },
    init: {      args: ["stop"], cmd: `/etc/init.d/${service}` },
  };
  const mapping = commands[commandKey];
  if (!mapping) throw new Error(`❌ Kein geeigneter Befehl zum Stoppen von ${service} gefunden.`);
  const result = await run(mapping.cmd ?? commandKey, mapping.args, { sudo: true });
  if (result.code !== 0) throw new Error(`❌ Fehler beim Stoppen von ${service}: ${result.stderr}`);
  console.log(`✅ ${service} wurde erfolgreich gestoppt!`);
};

export const restartService = async (service: string) => {
  console.log(`\n⚙️ ${service} wird neu geladen...`);
  const commandKey = await useSystem();
  const commands = {
    sc: { args: ["restart", service] },
    systemctl: { args: ["restart", service] },
    service: { args: [service, "restart"] },
    init: { cmd: `/etc/init.d/${service}`, args: ["restart"] },
  };
  const mapping = commands[commandKey];
  if (!mapping) throw new Error(`❌ Kein geeigneter Befehl zum Neuladen von ${service} gefunden.`);
  const result = await run(mapping.cmd ?? commandKey, mapping.args, { sudo: true });
  if (result.code !== 0) throw new Error(`❌ Fehler beim Neuladen von ${service}: ${result.stderr}`);
  console.log(`✅ ${service} wurde erfolgreich neu geladen!`);
};

export const reloadService = async (service: string) => {
  console.log(`\n⚙️ ${service} wird neu geladen...`);
  const commandKey = await useSystem();
  const commands = {
    sc: { args: ["reload", service] },
    systemctl: { args: ["reload", service] },
    service: { args: [service, "reload"] },
    init: { cmd: `/etc/init.d/${service}`, args: ["reload"] },
  };
  const mapping = commands[commandKey];
  if (!mapping) throw new Error(`❌ Kein geeigneter Befehl zum Neuladen von ${service} gefunden.`);
  const result = await run(mapping.cmd ?? commandKey, mapping.args, { sudo: true });
  if (result.code !== 0) throw new Error(`❌ Fehler beim Neuladen von ${service}: ${result.stderr}`);
  console.log(`✅ ${service} wurde erfolgreich neu geladen!`);
};

export const enableService = async (service: string) => {
  console.log(`\n⚙️ ${service} wird aktiviert...`);
  const commandKey = await useSystem();
  const commands = {
    sc: { args: ["config", service, "start=auto"] },
    systemctl: { args: ["enable", service] },
    service: { args: [service, "enable"] },
    init: { cmd: `/etc/init.d/${service}`, args: ["enable"] },
  };
  const mapping = commands[commandKey];
  if (!mapping) throw new Error(`❌ Kein geeigneter Befehl zum Aktivieren von ${service} gefunden.`);
  const result = await run(mapping.cmd ?? commandKey, mapping.args, { sudo: true });
  if (result.code !== 0) throw new Error(`❌ Fehler beim Aktivieren von ${service}: ${result.stderr}`);
  console.log(`✅ ${service} wurde erfolgreich aktiviert!`);
};


export const status = async (service: string) => {
  const commandKey = await useSystem();
  const commands = {
    sc: { args: ["query", service] },
    systemctl: { args: ["status", service] },
    service: { args: [service, "status"] },
    init: { cmd: `/etc/init.d/${service}`, args: ["status"] },
  };
  const mapping = commands[commandKey];
  if (!mapping) throw new Error(`❌ Kein geeigneter Befehl zum Überprüfen des Status von ${service} gefunden.`);
  const result = await run(mapping.cmd ?? commandKey, mapping.args, { sudo: true });
  const isRunning = result.code === 0;
  return isRunning;
};

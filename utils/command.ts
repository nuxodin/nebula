// Utility functions for running commands

/**
 * Runs a shell command and returns the exit code and output
 */

export async function run(
  command: string, 
  args: string[] = [], 
  options: {silent?: boolean, sudo?: boolean, user?: string} = {}
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


/**
 * Installs packages using the appropriate package manager (apt, yum, dnf, apk)
 */
export const installPackages = async (packages: string[]) => {
  const sudo = await getSudo();
  const isWindows = Deno.build.os === "windows";
  console.log(`🔍 Verfügbare Paketmanager werden überprüft...`);

  const packageManagers: { name: string; commands: string[][] }[] = isWindows
    ? [{ name: "winget", commands: [["install", "-e", ...packages]] }]
    : [
        { name: "apt", commands: [["update"], ["install", "-y", ...packages]] },
        { name: "yum", commands: [["install", "-y", ...packages]] },
        { name: "dnf", commands: [["install", "-y", ...packages]] },
        { name: "apk", commands: [["update"], ["add", ...packages]] },
      ];

  for (const pm of packageManagers) {
    if (await isCommandAvailable(pm.name)) {
      console.log(`📦 ${pm.name} wird verwendet, um Pakete zu installieren: ${packages.join(", ")}`);
      for (const cmd of pm.commands) {
        const result = await run(pm.name, cmd, {sudo:true, silent:false});
        if (result.code !== 0) {
          throw new Error(`❌ Fehler beim Ausführen von '${pm.name} ${cmd.join(" ")}': (code ${result.code}) ${result.stderr}`);
        }
      }
      console.log(`✅ Pakete ${packages.join(", ")} wurden erfolgreich installiert!`);
      return true;
    }
  }

  console.error(`❌ Kein unterstützter Paketmanager gefunden (${isWindows ? "winget" : "apt, yum, dnf, apk"}).`);
  Deno.exit(1);
};

/**
 * Checks if a package is installed using the appropriate package manager (apt, yum, dnf, apk)
 */
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
 * Starts a service using systemctl, service, or direct commands
 */
export const startService = async (service: string) => {
  console.log(`\n⚙️ Dienst ${service} wird gestartet...`);
  const isWindows = Deno.build.os === "windows";

  let result;
  if (isWindows) {
    result = await run("sc", ["start", service], {sudo:true});
  } else if (await isCommandAvailable("systemctl")) {
    result = await run("systemctl", ["start", service], {sudo:true});
  } else if (await isCommandAvailable("service")) {
    result = await run("service", [service, "start"], {sudo:true});
  } else {
    result = await run(`/etc/init.d/${service}`, ["start"], {sudo:true});
  }

  if (result.code === 0) {
    console.log(`✅ Dienst ${service} wurde erfolgreich gestartet!`);
  } else {
    throw new Error(`❌ Fehler beim Starten von ${service}: ${result.stderr}`);
  }
};


/**
 * Stops a service using systemctl, service, or direct commands
 */
export const stopService = async (service: string) => {
  console.log(`\n⚙️ ${service} wird gestoppt...`);

  let result;
  if (Deno.build.os === "windows") {
    result = await run("sc", ["stop", service], {sudo:true});
  } else if (await isCommandAvailable("systemctl")) {
    result = await run("systemctl", ["stop", service], {sudo:true});
  } else if (await isCommandAvailable("service")) {
    result = await run("service", [service, "stop"], {sudo:true});
  } else {
    result = await run(`/etc/init.d/${service}`, ["stop"], {sudo:true});
  }

  if (result.code === 0) {
    console.log(`✅ ${service} wurde erfolgreich gestoppt!`);
  } else {
    throw new Error(`❌ Fehler beim Stoppen von ${service}: ${result.stderr}`);
  }
}

/**
 * Reloads a service using systemctl, service, or direct commands
 */
export const reloadService = async (service: string) => {
  console.log(`\n⚙️ ${service} wird neu geladen...`);

  let result;
  if (Deno.build.os === "windows") {
    result = await run("sc", ["restart", service], {sudo:true});
  } else if (await isCommandAvailable("systemctl")) {
    result = await run("systemctl", ["restart", service], {sudo:true});
  } else if (await isCommandAvailable("service")) {
    result = await run("service", [service, "restart"], {sudo:true});
  } else {
    result = await run(`/etc/init.d/${service}`, ["restart"], {sudo:true});
  }

  if (result.code === 0) {
    console.log(`✅ ${service} wurde erfolgreich neu geladen!`);
  } else {
    throw new Error(`❌ Fehler beim Neuladen von ${service}: ${result.stderr || result.stdout}`);
  }
}

// Utility functions for running shell commands

/**
 * Runs a shell command and returns the exit code and output
 */
export async function runCommand(command: string, args: string[] = [], silent = false) {
  const process = new Deno.Command(command, { args, stdout: "piped", stderr: "piped" });
  const result = await process.output();
  const output = new TextDecoder().decode(result.stdout) + new TextDecoder().decode(result.stderr);
  if (!silent) console.log(output);
  return { code: result.code, output };
}

/**
 * Checks if a command is available on the system
 */
export const isCommandAvailable = async (cmd: string) =>
  (await runCommand("sh", ["-c", `command -v ${cmd}`], true)).code === 0;

/**
 * Detects the Linux distribution (Debian, Ubuntu, CentOS, Alpine)
 */
export const detectDistro = async () => {
  if (await isCommandAvailable("lsb_release")) {
    const { output } = await runCommand("lsb_release", ["-si"], true);
    return output.trim();
  } else if (await isCommandAvailable("cat")) {
    const { output } = await runCommand("cat", ["/etc/os-release"], true);
    if (output.includes("Debian")) return "Debian";
    if (output.includes("Ubuntu")) return "Ubuntu";
    if (output.includes("CentOS")) return "CentOS";
    if (output.includes("Alpine")) return "Alpine";
  }
  return "Unknown";
};

/**
 * Gets sudo command if available, otherwise returns empty string
 */
export const getSudo = async () => (await isCommandAvailable("sudo")) ? "sudo" : "";

/**
 * Starts and enables a service using systemctl, service, or direct commands
 */
export const startAndEnableService = async (service: string) => {
  console.log(`\n⚙️ ${service} wird aktiviert und gestartet...`);
  const sudo = await getSudo();

  if (await isCommandAvailable("systemctl")) {
    await runCommand("sh", ["-c", `${sudo} systemctl enable ${service}`]);
    await runCommand("sh", ["-c", `${sudo} systemctl start ${service}`]);
  } else if (await isCommandAvailable("service")) {
    await runCommand("sh", ["-c", `${sudo} service ${service} start`]);
  } else {
    await runCommand("sh", ["-c", `${sudo} /etc/init.d/${service} start`]);
  }
  console.log(`✅ ${service} wurde erfolgreich aktiviert und gestartet!`);
};

/**
 * Installs packages using the appropriate package manager (apt, yum, dnf, apk)
 */
export const installPackages = async (packages: string[]) => {
  const sudo = await getSudo();

  if (await isCommandAvailable("apt")) {
    await runCommand("sh", ["-c", `${sudo} apt update && ${sudo} apt install -y ${packages.join(" ")}`]);
  } else if (await isCommandAvailable("yum")) {
    await runCommand("sh", ["-c", `${sudo} yum install -y ${packages.join(" ")}`]);
  } else if (await isCommandAvailable("dnf")) {
    await runCommand("sh", ["-c", `${sudo} dnf install -y ${packages.join(" ")}`]);
  } else if (await isCommandAvailable("apk")) {
    await runCommand("sh", ["-c", `${sudo} apk update && ${sudo} apk add ${packages.join(" ")}`]);
  } else {
    console.error("❌ Kein unterstützter Paketmanager gefunden (apt, yum, dnf, apk).");
    Deno.exit(1);
  }
};

/**
 * Reloads a service using systemctl, service, or direct commands
 */
export const reloadService = async (service: string) => {
  console.log(`\n⚙️ ${service} wird neu geladen...`);
  const sudo = await getSudo();

  if (await isCommandAvailable("systemctl")) {
    await runCommand("sh", ["-c", `${sudo} systemctl reload ${service}`]);
  } else if (await isCommandAvailable("service")) {
    await runCommand("sh", ["-c", `${sudo} service ${service} reload`]);
  } else {
    await runCommand("sh", ["-c", `${sudo} /etc/init.d/${service} reload`]);
  }
}
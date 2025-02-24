import { Context } from "hono";
import { run } from "../../utils/command.ts";
import { renderTemplate } from "../../utils/template.ts";
import { logError } from "../../utils/logger.ts";

interface Package {
    name: string;
    version: string;
    installed: boolean;
    automatic: boolean;
    error?: string;
}

// View Controller
export const getPackagesView = async (c: Context) => {
  try {
    const content = await Deno.readTextFile("./modules/packages/views/content.html");
    const scripts = await Deno.readTextFile("./modules/packages/views/scripts.html");
    return c.html(await renderTemplate("System Packages", content, "", scripts));
  } catch (err) {
    logError("Error loading packages view", "Packages", c, err);
    return c.text("Internal Server Error", 500);
  }
};

// API endpoints
export const api = {
    get: async function (_c: Context) {
      const os = Deno.build.os;
      try {
        if (os === "windows") {
          const res = await run("wmic", ["product", "get", "name,version", "/format:csv"], { silent: true });
          if (res.code !== 0) throw new Error(res.output);
          return parseWindows(res.output);
        }
        if (os === "darwin") {
          const res = await run("brew", ["list", "--versions"], { silent: true });
          if (res.code !== 0) throw new Error(res.output);
          return parseMac(res.output);
        }
        // Linux: System-Paketmanager
        const managers = [
          { cmd: "apt", args: ["list", "--installed"], parser: parseApt },
          { cmd: "dpkg", args: ["-l"], parser: parseDpkg },
          { cmd: "pacman", args: ["-Q"], parser: parsePacman },
          { cmd: "rpm", args: ["-qa", "--queryformat", "%{NAME} %{VERSION}\\n"], parser: parsePacman },
          { cmd: "dnf", args: ["list", "installed"], parser: parseDnf },
          { cmd: "yum", args: ["list", "installed"], parser: parseYum },
          { cmd: "zypper", args: ["search", "--installed-only"], parser: parseZypper }
        ];
        for (const pm of managers) {
          try {
            const res = await run(pm.cmd, pm.args, { silent: true });
            if (res.code === 0) return pm.parser(res.output);
          } catch {
            continue;
          }
        }
        throw new Error("Kein unterstützter Paketmanager gefunden");
      } catch (err) {
        logError("Fehler beim Abrufen der Paketliste", "Packages", _c, err);
        throw err;
      }
    }
};
  
function parseWindows(output: string) {
    return output.split("\n")
        .map(line => line.trim())
        .filter(line => line && !line.startsWith("Node"))
        .map(line => {
            const [, name, version] = line.split(",");
            return { name: name || "", version: version || "", installed: true, automatic: false };
        })
        .filter(pkg => pkg.name && pkg.version);
}

function parseMac(output: string) {
    return output.split("\n")
        .filter(line => line.trim())
        .map(line => {
            const [name, ...versions] = line.split(" ");
            return { name, version: versions.join(" "), installed: true, automatic: false };
        });
}

function parseApt(output: string) {
    return output.split("\n")
        .filter(line => line.includes("installed"))
        .map(line => {
            const [nameVer] = line.split(" [installed]");
            const [name, version] = nameVer.split("/");
            return { name: name || "", version: version || "", installed: true, automatic: false };
        });
}

function parseDpkg(output: string) {
    return output.split("\n")
        .filter(line => line.startsWith("ii"))
        .map(line => {
            const parts = line.split(/\s+/);
            return { name: parts[1] || "", version: parts[2] || "", installed: true, automatic: false };
        });
}

function parsePacman(output: string) {
    return output.split("\n")
        .filter(line => line.trim())
        .map(line => {
            const [name, version] = line.split(" ");
            return { name: name || "", version: version || "", installed: true, automatic: false };
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

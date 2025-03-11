import { Context } from "hono";
import { logError, logInfo } from "../../utils/logger.ts";
import { denoRuntime } from "./runtime.ts";
import { registerRuntime } from "../../utils/runtime.ts";
import { run } from "../../utils/command.ts";
import db from "../../utils/database.ts";

// Register Deno runtime
registerRuntime('deno', denoRuntime);


const installing: { [version: string]: boolean } = {};

// API Controller
export const api = {
  domains: async function(c: Context) {
    const domains = db.queryEntries(`
      SELECT d.id, d.name, d.runtime_version, d.created_at
      FROM domains d
      WHERE d.runtime = 'deno'
      ORDER BY d.created_at DESC
    `);
    
    return { success: true, domains };
  },

  versions: async function(c: Context) {
    const installed = await denoRuntime.installedVersions();
    const remote = await denoRuntime.remoteVersions();
    const data: Record<string, { installed?: boolean, remote?: boolean, installing?: boolean }> = {};
    for (const [version, isIt] of Object.entries(installing)) {
      data[version] ??= {};
      data[version].installing = isIt;
    }
    for (const version of installed) {
      data[version] ??= {};
      data[version].installed = true;
    }
    for (const version of remote) {
      data[version] ??= {};
      data[version].remote = true;
    }
    return { success: true, versions:data };
  },
  remoteVersions: async function(c: Context) {
    const versions = await denoRuntime.remoteVersions();
    return { success: true, versions };
  },
  
  install: {
    post:async function(c: Context) {
      const { version } = await c.req.json();
      if (!version) return { success: false, error: "Version muss angegeben werden" };
      
      installing[version] = true;
      const result = await run('/root/.dvm/bin/dvm', ['install', version], { sudo: true });
      installing[version] = false;

      if (result.code !== 0) throw new Error(`Installation fehlgeschlagen: ${result.stderr}`);
      
      logInfo(`Deno Version ${version} wurde installiert`, "Deno");
      return { success: true, message: `Deno Version ${version} wurde installiert` };
    }
  },
  
  uninstall: {
    post: async function(c: Context) {
      const { version } = await c.req.json();
      if (!version) return { error: "Version muss angegeben werden" };
      
      const result = await run('/root/.dvm/bin/dvm', ['uninstall', version], { sudo: true });
      if (result.code !== 0) throw new Error(`Deinstallation fehlgeschlagen: ${result.stderr}`);
      
      logInfo(`Deno Version ${version} wurde deinstalliert`, "Deno");
      return { success: true, message: `Deno Version ${version} wurde deinstalliert` };
    }
  },
  ':id': {
    start: {
      post: async function(c: Context) {
        const { id } = c.req.param();
        const domain = db.queryEntries(`SELECT * FROM domains WHERE id = ? AND runtime = 'deno'`, [id])[0];
        
        await denoRuntime.startDomainProcess(domain);
        logInfo(`Deno-Anwendung für Domain ${domain.name} gestartet`, "Deno");
        return { success: true, message: `Deno-Anwendung für Domain ${domain.name} gestartet` };
      },
    },
    
    stop: {
      post: async function(c: Context) {
        const { id } = c.req.param();
        const domain = db.queryEntries(`SELECT id, name FROM domains WHERE id = ? AND runtime = 'deno'`, [id])[0];
        
        await denoRuntime.stopDomainProcess(domain.id);
        logInfo(`Deno-Anwendung für Domain ${domain.name} gestoppt`, "Deno");
        return { success: true, message: `Deno-Anwendung für Domain ${domain.name} gestoppt` };
      }
    }
  }
};
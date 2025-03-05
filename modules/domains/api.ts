import db from "../../utils/database.ts";
import { logError, logInfo } from "../../utils/logger.ts";
import { createDomain } from "./controller.ts";
import { config } from "../../utils/config.ts";
import { api as fileApi } from "../files/controller.ts";


export const api = {
    get: function () {
        return db.queryEntries(`
            SELECT d.*, c.login as owner_name
            FROM domains d
            LEFT JOIN clients c ON d.owner_id = c.id
      `);
    },
    post: async function (c) {
        const data = await c.req.json();
        const userId = await c.get('session').get('userId');
        const result = await createDomain({
            name: data.name,
            owner_id: userId,
            runtime: data.runtime,
            runtime_version: data.runtime_version,
        });
        return result;
    },
    ':id': {
        get: async function (c) {
            const { id } = c.req.param();

            const domain = db.queryEntries(`
                SELECT d.*, c.login as owner_name 
                FROM domains d
                LEFT JOIN clients c ON d.owner_id = c.id
                WHERE d.id = ?
                `, [id])[0];

            if (!domain) throw new Error("Domain not found");

            // Datenbanken separat abrufen
            domain.databases = db.queryEntries(`
                SELECT id, name, type
                FROM databases
                WHERE dom_id = ?
                `, [id]);

            // E-Mail-Konten separat abrufen
            domain.mail_accounts = db.queryEntries(`
                SELECT id, mail_name
                FROM mail
                WHERE dom_id = ?
                `, [id]);

            return domain;
        },
        delete: async function (c) {
            const { id } = c.req.param();
            const domain = db.queryEntries("SELECT name FROM domains WHERE id = ?", [id])[0];
            if (!domain) throw new Error("Domain not found");

            // Lösche Domain-Verzeichnis
            const domainPath = `${config.vhosts_root}/${domain.name}`;
            try {
                await Deno.remove(domainPath, { recursive: true });
            } catch (err) {
                logError(`Fehler beim Löschen des Domain-Verzeichnisses ${domainPath}`, "Domains", c, err);
            }

            // Lösche DNS Zone-Datei
            try {
                const zonePath = `${config.bind_zones_dir}/${domain.name}.zone`;
                await Deno.remove(zonePath);
            } catch (err) {
                logError(`Fehler beim Löschen der Zone-Datei für ${domain.name}`, "Domains", c, err);
                // Wir setzen fort, auch wenn die Zone-Datei nicht gelöscht werden konnte
            }

            // Lösche alle abhängigen Datensätze
            db.query("DELETE FROM dns_records WHERE domain_id = ?", [id]);
            db.query("DELETE FROM databases WHERE dom_id = ?", [id]);
            db.query("DELETE FROM mail WHERE dom_id = ?", [id]);
            db.query("DELETE FROM domains WHERE id = ?", [id]);

            logInfo(`Domain ${domain?.name} wurde gelöscht`, "Domains", c);
            return { message: "Domain deleted" };
        }
    }
};

async function convertFileApi(c, fn) {
    const domain = await c.get('domain');
    return fn(c, { rootPath: `${config.vhosts_root}/${domain}` });
}

api[':id'].files = {
    list: (c) => convertFileApi(c, fileApi.list),
    post: (c) => convertFileApi(c, fileApi.post),
    delete: (c) => convertFileApi(c, fileApi.delete),
    upload: { post: (c) => convertFileApi(c, fileApi.upload.post) },
    rename: { post: (c) => convertFileApi(c, fileApi.rename.post) },
    content: {
        get: (c) => convertFileApi(c, fileApi.content.get),
        put: (c) => convertFileApi(c, fileApi.content.put),
    }
};

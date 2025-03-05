import { Context } from "hono";
import { logError } from "../../utils/logger.ts";
import { renderTemplate } from "../../utils/template.ts";
import db from "../../utils/database.ts";
import { writeZoneFile } from "./bind.ts";

interface DnsRecord {
  domain_id: number;
  [key: string]: unknown;
}

// View Controller
export const getDnsView = async (c: Context) => {
  try {
    const content = await Deno.readTextFile("./modules/dns/views/content.html");
    const scripts = await Deno.readTextFile("./modules/dns/views/scripts.html");
    return c.html(await renderTemplate("DNS Records", content, "", scripts));
  } catch (error) {
    if (error instanceof Error) {
      logError("Fehler beim Laden der DNS-Übersicht", "DNS", c, error);
    }
    return c.text("Internal Server Error", 500);
  }
};

// API Controller
export const api = {
  get: function() {
    return db.queryEntries(`
      SELECT r.*, d.name as domain_name
      FROM dns_records r
      JOIN domains d ON r.domain_id = d.id
      ORDER BY d.name, r.record_type
    `);
  },

  post: async function(c: Context) {
    const data = await c.req.json();

    try {
      db.query(`
        INSERT INTO dns_records (domain_id, record_type, name, value, ttl, priority)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [data.domain_id, data.type, data.name, data.content, data.ttl || 3600, data.type === 'MX' ? (data.priority || 10) : null]);

      // Regenerate zone file
      await writeZoneFile(Number(data.domain_id));
      
      return { success: true };
    } catch (error) {
      if (error instanceof Error) {
        logError(`Fehler beim Erstellen des DNS Records: ${error.message}`, "DNS", c, error);
        return c.json({ error: error.message }, 500);
      }
      return c.json({ error: "Unknown error occurred" }, 500);
    }
  },

  ':id': {
    put: async function(c: Context) {
      const { id } = c.req.param();
      const data = await c.req.json();

      try {
        // Get domain_id before update for zone regeneration
        const record = db.queryEntries<DnsRecord>('SELECT domain_id FROM dns_records WHERE id = ?', [id])[0];
        if (!record) {
          return c.json({ error: 'DNS Record nicht gefunden' }, 404);
        }

        db.query(`
          UPDATE dns_records 
          SET record_type = ?, name = ?, value = ?, ttl = ?, priority = ?
          WHERE id = ?
        `, [data.type, data.name, data.content, data.ttl || 3600, data.type === 'MX' ? (data.priority || 10) : null, id]);

        // Regenerate zone file
        await writeZoneFile(Number(record.domain_id));

        return { success: true };
      } catch (error) {
        if (error instanceof Error) {
          logError(`Fehler beim Aktualisieren des DNS Records: ${error.message}`, "DNS", c, error);
          return c.json({ error: error.message }, 500);
        }
        return c.json({ error: "Unknown error occurred" }, 500);
      }
    },

    delete: async function(c: Context) {
      const { id } = c.req.param();
      
      try {
        // Get domain_id before delete for zone regeneration
        const record = db.queryEntries<DnsRecord>('SELECT domain_id FROM dns_records WHERE id = ?', [id])[0];
        if (!record) {
          return c.json({ error: 'DNS Record nicht gefunden' }, 404);
        }

        // Delete record
        db.query('DELETE FROM dns_records WHERE id = ?', [id]);

        // Regenerate zone file
        await writeZoneFile(Number(record.domain_id));

        return { success: true };
      } catch (error) {
        if (error instanceof Error) {
          logError(`Fehler beim Löschen des DNS Records: ${error.message}`, "DNS", c, error);
          return c.json({ error: error.message }, 500);
        }
        return c.json({ error: "Unknown error occurred" }, 500);
      }
    }
  }
};
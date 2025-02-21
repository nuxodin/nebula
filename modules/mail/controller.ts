import { logError } from "../../utils/logger.ts";
import { renderTemplate } from "../../utils/template.ts";
import db from "../../utils/database.ts";
import { createMailbox, deleteMailbox, updateMailbox, getDiskUsage } from "./createMail.ts";

// View Controllers
export const getMailView = async (c) => {
  try {
    const content = await Deno.readTextFile("./modules/mail/views/content.html");
    const scripts = await Deno.readTextFile("./modules/mail/views/scripts.html");
    return c.html(await renderTemplate("E-Mail Konten", content, "", scripts));
  } catch (err) {
    logError("Fehler beim Laden der Mail-Übersicht", "Mail", c, err);
    return c.text("Internal Server Error", 500);
  }
};

export const getMailDetailView = async (c) => {
  try {
    const { id } = c.req.param();
    const account = db.queryEntries(`
      SELECT m.*, d.name as domain_name
      FROM mail m
      JOIN domains d ON m.dom_id = d.id
      WHERE m.id = ?
    `, [id])[0];

    if (!account) {
      return c.text("Mail account not found", 404);
    }

    const content = await Deno.readTextFile("./modules/mail/views/detail.html");
    const scripts = await Deno.readTextFile("./modules/mail/views/detail-scripts.html");
    return c.html(await renderTemplate(`E-Mail Konto ${account.mail_name}`, content, "", scripts));
  } catch (err) {
    logError("Fehler beim Laden der Mail-Details", "Mail", c, err);
    return c.text("Internal Server Error", 500);
  }
};

// API Controllers
export const api = {
  get: function() {
    return db.queryEntries(`
      SELECT m.*, d.name as domain_name 
      FROM mail m
      JOIN domains d ON m.dom_id = d.id
      ORDER BY m.mail_name
    `);
  },
  post: async function(c) {
    const data = await c.req.json();
    const domain = db.queryEntries('SELECT name FROM domains WHERE id = ?', [data.domain_id])[0];
    
    if (!domain) {
      return c.json({ error: "Domain not found" }, 404);
    }

    const mail_name = `${data.local_part}@${domain.name}`;
    return await createMailbox(data.domain_id, {
      address: mail_name,
      password: data.password
    });
  },
  ':id': {
    get: async function(c) {
      const { id } = c.req.param();
      const account = db.queryEntries(`
        SELECT m.*, d.name as domain_name, 
               (SELECT GROUP_CONCAT(alias) FROM mail_aliases WHERE mail_id = m.id) as aliases_list
        FROM mail m
        JOIN domains d ON m.dom_id = d.id
        WHERE m.id = ?
      `, [id])[0];

      if (!account) {
        return c.json({ error: "Mail account not found" }, 404);
      }

      // Parse aliases list
      account.aliases = account.aliases_list ? account.aliases_list.split(',') : [];
      delete account.aliases_list;

      return account;
    },
    'disk': {
      get: async function(c) {
        const { id } = c.req.param();
        return await getDiskUsage(Number(id));
      }
    },
    'alias': {
      post: async function(c) {
        const { id } = c.req.param();
        const data = await c.req.json();
        
        const account = db.queryEntries(`
          SELECT m.*, d.name as domain_name
          FROM mail m
          JOIN domains d ON m.dom_id = d.id
          WHERE m.id = ?
        `, [id])[0];

        if (!account) {
          return c.json({ error: "Mail account not found" }, 404);
        }

        // Add alias
        db.query(`
          INSERT INTO mail_aliases (mail_id, alias)
          VALUES (?, ?)
        `, [id, `${data.alias}@${account.domain_name}`]);

        return { success: true };
      },
      delete: async function(c) {
        const { id } = c.req.param();
        const data = await c.req.json();
        
        db.query(`
          DELETE FROM mail_aliases 
          WHERE mail_id = ? AND alias = ?
        `, [id, data.alias]);

        return { success: true };
      }
    },
    'password': {
      post: async function(c) {
        const { id } = c.req.param();
        const data = await c.req.json();
        
        return await updateMailbox(Number(id), {
          password: data.password
        });
      }
    },
    'autoresponder': {
      put: async function(c) {
        const { id } = c.req.param();
        const data = await c.req.json();
        
        return await updateMailbox(Number(id), {
          autoresponder: data.autoresponder
        });
      }
    },
    'forwarders': {
      put: async function(c) {
        const { id } = c.req.param();
        const data = await c.req.json();
        
        return await updateMailbox(Number(id), {
          forwarders: data.forwarders
        });
      }
    },
    delete: async function(c) {
      const { id } = c.req.param();
      return await deleteMailbox(Number(id));
    }
  }
};
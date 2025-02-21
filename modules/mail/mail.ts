import db from "../../utils/database.ts";
import { logInfo, logError } from "../../utils/logger.ts";
import { runCommand } from "../../utils/command.ts";
import { config } from "../../utils/config.ts";
import { ensureDir } from "https://deno.land/std/fs/mod.ts";

interface MailboxOptions {
  address: string;
  password: string;
  quota?: number;
  autoresponder?: {
    enabled: boolean;
    subject?: string;
    message?: string;
    startDate?: Date;
    endDate?: Date;
  };
  forwarders?: string[];
}

export async function createMailbox(domainId: number, options: MailboxOptions) {
  try {
    const domain = db.queryEntries('SELECT * FROM domains WHERE id = ?', [domainId])[0];
    if (!domain) throw new Error('Domain not found');

    // Check mailbox limit
    const mailCount = db.queryEntries<{count: number}>(
      'SELECT COUNT(*) as count FROM mail WHERE dom_id = ?', 
      [domainId]
    )[0].count;

    if (mailCount >= config.max_mail_accounts) {
      throw new Error('Mail account limit reached for this domain');
    }

    const [localPart] = options.address.split('@');
    const mailDir = `/var/mail/${domain.name}/${localPart}`;
    
    // Create mail directory structure
    await ensureDir(mailDir);
    await ensureDir(`${mailDir}/Maildir`);
    await ensureDir(`${mailDir}/Maildir/new`);
    await ensureDir(`${mailDir}/Maildir/cur`);
    await ensureDir(`${mailDir}/Maildir/tmp`);

    // Create system user for mail
    const username = `${localPart}_${domain.name}`.replace(/[^a-z0-9]/g, '_');
    await runCommand(`useradd -r -m -d ${mailDir} ${username}`);
    await runCommand(`echo "${username}:${options.password}" | chpasswd`);

    // Set quota if specified
    if (options.quota) {
      await runCommand(`setquota -u ${username} ${options.quota * 1024} ${options.quota * 1024} 0 0 /var/mail`);
    }

    // Configure autoresponder if enabled
    if (options.autoresponder?.enabled) {
      const autoresponderConfig = `
Subject: ${options.autoresponder.subject || 'Auto-Reply'}
Message: ${options.autoresponder.message || 'I am currently unavailable.'}
${options.autoresponder.startDate ? `Start-Date: ${options.autoresponder.startDate.toISOString()}` : ''}
${options.autoresponder.endDate ? `End-Date: ${options.autoresponder.endDate.toISOString()}` : ''}
`;
      await Deno.writeTextFile(`${mailDir}/.autoresponder`, autoresponderConfig);
    }

    // Configure mail forwarders
    if (options.forwarders?.length) {
      await Deno.writeTextFile(`${mailDir}/.forward`, options.forwarders.join('\n'));
    }

    // Add to database
    db.query(`
      INSERT INTO mail (dom_id, mail_name, password, quota, autoresponder_enabled, forwarders)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      domainId,
      options.address,
      options.password,
      options.quota || config.default_mail_quota,
      options.autoresponder?.enabled ? 1 : 0,
      options.forwarders ? JSON.stringify(options.forwarders) : null
    ]);

    // Update Postfix virtual maps
    await updatePostfixMaps(domain.name);

    logInfo(`Mailbox ${options.address} created`, 'Mail');
    return { success: true };
  } catch (error) {
    logError(`Error creating mailbox: ${error.message}`, 'Mail');
    throw error;
  }
}

export async function deleteMailbox(mailId: number) {
  try {
    const mailbox = db.queryEntries('SELECT m.*, d.name as domain_name FROM mail m JOIN domains d ON m.dom_id = d.id WHERE m.id = ?', [mailId])[0];
    if (!mailbox) throw new Error('Mailbox not found');

    const [localPart] = mailbox.mail_name.split('@');
    const username = `${localPart}_${mailbox.domain_name}`.replace(/[^a-z0-9]/g, '_');

    // Remove system user and mail directory
    await runCommand(`userdel -r ${username}`);
    await Deno.remove(`/var/mail/${mailbox.domain_name}/${localPart}`, { recursive: true });

    // Remove from database
    db.query('DELETE FROM mail WHERE id = ?', [mailId]);

    // Update Postfix virtual maps
    await updatePostfixMaps(mailbox.domain_name);

    logInfo(`Mailbox ${mailbox.mail_name} deleted`, 'Mail');
    return { success: true };
  } catch (error) {
    logError(`Error deleting mailbox: ${error.message}`, 'Mail');
    throw error;
  }
}

export async function updateMailbox(mailId: number, options: Partial<MailboxOptions>) {
  try {
    const mailbox = db.queryEntries('SELECT m.*, d.name as domain_name FROM mail m JOIN domains d ON m.dom_id = d.id WHERE m.id = ?', [mailId])[0];
    if (!mailbox) throw new Error('Mailbox not found');

    const [localPart] = mailbox.mail_name.split('@');
    const username = `${localPart}_${mailbox.domain_name}`.replace(/[^a-z0-9]/g, '_');
    const mailDir = `/var/mail/${mailbox.domain_name}/${localPart}`;

    // Update password if provided
    if (options.password) {
      await runCommand(`echo "${username}:${options.password}" | chpasswd`);
      db.query('UPDATE mail SET password = ? WHERE id = ?', [options.password, mailId]);
    }

    // Update quota if provided
    if (options.quota) {
      await runCommand(`setquota -u ${username} ${options.quota * 1024} ${options.quota * 1024} 0 0 /var/mail`);
      db.query('UPDATE mail SET quota = ? WHERE id = ?', [options.quota, mailId]);
    }

    // Update autoresponder if provided
    if (options.autoresponder) {
      if (options.autoresponder.enabled) {
        const autoresponderConfig = `
Subject: ${options.autoresponder.subject || 'Auto-Reply'}
Message: ${options.autoresponder.message || 'I am currently unavailable.'}
${options.autoresponder.startDate ? `Start-Date: ${options.autoresponder.startDate.toISOString()}` : ''}
${options.autoresponder.endDate ? `End-Date: ${options.autoresponder.endDate.toISOString()}` : ''}
`;
        await Deno.writeTextFile(`${mailDir}/.autoresponder`, autoresponderConfig);
      } else {
        await Deno.remove(`${mailDir}/.autoresponder`).catch(() => {});
      }
      
      db.query('UPDATE mail SET autoresponder_enabled = ? WHERE id = ?', 
        [options.autoresponder.enabled ? 1 : 0, mailId]);
    }

    // Update forwarders if provided
    if (options.forwarders) {
      await Deno.writeTextFile(`${mailDir}/.forward`, options.forwarders.join('\n'));
      db.query('UPDATE mail SET forwarders = ? WHERE id = ?', 
        [JSON.stringify(options.forwarders), mailId]);
    }

    logInfo(`Mailbox ${mailbox.mail_name} updated`, 'Mail');
    return { success: true };
  } catch (error) {
    logError(`Error updating mailbox: ${error.message}`, 'Mail');
    throw error;
  }
}

async function updatePostfixMaps(domainName: string) {
  try {
    const mailboxes = db.queryEntries('SELECT m.* FROM mail m JOIN domains d ON m.dom_id = d.id WHERE d.name = ?', [domainName]);
    
    let virtualContent = '';
    for (const mailbox of mailboxes) {
      const [localPart] = mailbox.mail_name.split('@');
      virtualContent += `${mailbox.mail_name} ${localPart}_${domainName.replace(/[^a-z0-9]/g, '_')}\n`;
    }

    await Deno.writeTextFile('/etc/postfix/virtual', virtualContent);
    await runCommand('postmap /etc/postfix/virtual');
    await runCommand('systemctl reload postfix');
  } catch (error) {
    logError(`Error updating Postfix maps: ${error.message}`, 'Mail');
    throw error;
  }
}

// E-Mail-Konto erstellen
export const createMailAccount = async (c) => {
  try {
    const { dom_id, mail_name, password } = await c.req.json();
    db.query("INSERT INTO mail (dom_id, mail_name, password) VALUES (?, ?, ?)", [dom_id, mail_name, password]);
    logInfo(`Mail account ${mail_name} created for domain ${dom_id}`);
    return c.json({ message: "Mail account created" });
  } catch (err) {
    logError("Error creating mail account:", err);
    return c.text("Internal Server Error", 500);
  }
};

// Alle E-Mail-Konten abrufen
export const getAllMailAccounts = (c) => {
  try {
    const { domain_id } = c.req.query();
    let mailAccounts;
    
    if (domain_id) {
      mailAccounts = db.queryEntries("SELECT * FROM mail WHERE dom_id = ?", [domain_id]);
    } else {
      mailAccounts = db.queryEntries("SELECT * FROM mail");
    }
    
    logInfo("Fetched mail accounts");
    return c.json(mailAccounts);
  } catch (err) {
    logError("Error fetching mail accounts:", err);
    return c.text("Internal Server Error", 500);
  }
};

// E-Mail-Konto nach ID abrufen
export const getMailAccountById = (c) => {
  try {
    const { id } = c.req.param();
    const mailAccount = db.query("SELECT * FROM mail WHERE id = ?", [id]);
    if (mailAccount.length === 0) {
      return c.text("Mail account not found", 404);
    }
    logInfo(`Fetched mail account with id ${id}`);
    return c.json(mailAccount[0]);
  } catch (err) {
    logError("Error fetching mail account:", err);
    return c.text("Internal Server Error", 500);
  }
};

// E-Mail-Konto aktualisieren
export const updateMailAccount = async (c) => {
  try {
    const { id } = c.req.param();
    const { dom_id, mail_name, password } = await c.req.json();
    db.query("UPDATE mail SET dom_id = ?, mail_name = ?, password = ? WHERE id = ?", [dom_id, mail_name, password, id]);
    logInfo(`Mail account ${id} updated`);
    return c.json({ message: "Mail account updated" });
  } catch (err) {
    logError("Error updating mail account:", err);
    return c.text("Internal Server Error", 500);
  }
};

// E-Mail-Konto löschen
export const deleteMailAccount = (c) => {
  try {
    const { id } = c.req.param();
    db.query("DELETE FROM mail WHERE id = ?", [id]);
    logInfo(`Mail account ${id} deleted`);
    return c.json({ message: "Mail account deleted" });
  } catch (err) {
    logError("Error deleting mail account:", err);
    return c.text("Internal Server Error", 500);
  }
};
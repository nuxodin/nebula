import db from "../../utils/database.ts";
import { logInfo, logError } from "../../utils/logger.ts";
import { run, reloadService } from "../../utils/command.ts";
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
    //const username = `${localPart}_${domain.name}`.replace(/[^a-z0-9]/g, '_');
    const linuxUser = `ne-ma-${domainId}-${localPart}`;
    //await run('adduser', ['-r', '-M', '-d', mailDir, username]);
    //await run(`echo "${username}:${options.password}" | chpasswd`);

    await run('adduser', ['--system', '--group', '--home', mailDir, linuxUser]);
    await run('sh', ['-c', `echo "${linuxUser}:${options.password}" | chpasswd`]);
    await run('chown', ['-R', `${linuxUser}:${linuxUser}`, mailDir]);

    // Set quota if specified
    if (options.quota) {
      //await run(`setquota -u ${username} ${options.quota * 1024} ${options.quota * 1024} 0 0 /var/mail`);
      await run('setquota', ['-u', linuxUser, `${options.quota * 1024}`, `${options.quota * 1024}`, '0', '0', '/var/mail']);
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
    return { success: true, message: "Mail account created" };
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
    await run('userdel', ['-r', username]);
    await Deno.remove(`/var/mail/${mailbox.domain_name}/${localPart}`, { recursive: true });

    // Remove from database
    db.query('DELETE FROM mail WHERE id = ?', [mailId]);

    // Update Postfix virtual maps
    await updatePostfixMaps(mailbox.domain_name);

    logInfo(`Mailbox ${mailbox.mail_name} deleted`, 'Mail');
    return { success: true, message: "Mail account deleted" };
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
      await run('sh', ['-c', `echo "${username}:${options.password}" | chpasswd`]);
      db.query('UPDATE mail SET password = ? WHERE id = ?', [options.password, mailId]);
    }

    // Update quota if provided
    if (options.quota) {
      await run('setquota', ['-u', username, `${options.quota * 1024}`, `${options.quota * 1024}`, '0', '0', '/var/mail']);
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
    return { success: true, message: "Mail account updated" };
  } catch (error) {
    logError(`Error updating mailbox: ${error.message}`, 'Mail');
    throw error;
  }
}

export async function getDiskUsage(mailId: number) {
  try {
    const mailbox = db.queryEntries('SELECT m.*, d.name as domain_name FROM mail m JOIN domains d ON m.dom_id = d.id WHERE m.id = ?', [mailId])[0];
    if (!mailbox) throw new Error('Mailbox not found');

    const [localPart] = mailbox.mail_name.split('@');
    const mailDir = `/var/mail/${mailbox.domain_name}/${localPart}`;

    // Get disk usage with du command
    //const { stdout } = await run(`du -sm ${mailDir}`);
    const { stdout } = await run('du', ['-sm', mailDir]);
    const used = parseInt(stdout.split('\t')[0]);
    
    // Get quota info with quota command
    //const { stdout: quotaOutput } = await run(`quota -u ${localPart}_${mailbox.domain_name} -l`);
    //const { stdout: quotaOutput } = await run('quota', ['-u', `${localPart}_${mailbox.domain_name}`, '-l']);


    //const total = mailbox.quota || config.default_mail_quota;
    const total = 0;

    return {
      used,
      total,
      unit: 'MB'
    };
  } catch (error) {
    logError(`Error getting disk usage: ${error.message}`, 'Mail');
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
    await run('postmap', ['/etc/postfix/virtual']);

    await reloadService('postfix');
  } catch (error) {
    logError(`Error updating Postfix maps: ${error.message}`, 'Mail');
    throw error;
  }
}
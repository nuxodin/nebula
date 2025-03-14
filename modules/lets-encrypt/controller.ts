import { reloadService, run } from "../../utils/command.ts";
import { config } from "../../utils/config.ts";
import { logError, logInfo } from "../../utils/logger.ts";
import db from "../../utils/database.ts";
import { ensureDir } from 'https://deno.land/std@0.224.0/fs/ensure_dir.ts';

export const api = {
    setUp: {
        post: async () => {
            const file = '/etc/nginx/nebula.conf.d/acme-challenge.conf';
            const content = 
                'server {\n'+
                '    listen 80;\n'+
                '    server_name _;  # Wir brauchen hier keinen speziellen Servernamen\n'+
                '    location ^~ /.well-known/acme-challenge/ {\n'+
                '        alias /var/www/acme-challenge/;\n'+
                '        try_files $uri =404;\n'+
                '    }\n'+
                '}';
            await Deno.writeTextFile(file, content);

            await run('mkdir', ['-p', '/var/www/acme-challenge'], { sudo: true });
            await run('chown', ['-R', 'www-data:www-data', '/var/www/acme-challenge'], { sudo: true });

            try {
                reloadService('nginx');
                return { success: true };
            } catch (error) {
                throw new Error(`Failed to reload nginx: ${error.message}`);
            }
        }
    },
    status: async () => {
        try {
            const result = await run('certbot', ['certificates']);
            return { success: true, output: result.stdout };
        } catch (error) {
            throw new Error(`Failed to get certificates status: ${error.message}`);
        }
    },

    certificates: {
        get: async () => {
            // Hole alle Domains, egal ob sie bereits ein Zertifikat haben oder nicht
            const domains = db.queryEntries(`
                SELECT id, name, ssl_enabled, ssl_type, ssl_expires_at 
                FROM domains 
            `);
            return { success: true, domains };
        },

        issue: {
            post: async (c) => {
                const {domainId} = await c.req.json();
                const domain = db.queryEntries('SELECT * FROM domains WHERE id = ?', [domainId])[0];
                if (!domain) throw new Error('Domain not found');

                const result = await run('certbot', [
                    'certonly',
                    '--webroot',
                    //'-w', `${config.vhosts_root}/${domain.name}/httpdocs`,
                    '-w', '/var/www/acme-challenge', // Pfad für die ACME-Challenge
                    '-d', domain.name,
                    '-d', `www.${domain.name}`,
                    '--non-interactive',
                    '--agree-tos',              // Zustimmung zu den Nutzungsbedingungen
                    '--email', 'lets-encrypt-test@shwups.ch' // Todo: domein.user_id > email
                ], { sudo: true });


                // todo: in die nginx und apache config einfügen, nginx:
                // ssl_certificate /etc/letsencrypt/live/${domain.name}/fullchain.pem;
                // ssl_certificate_key /etc/letsencrypt/live/${domain.name}/privkey.pem;
                // oder sudo certbot --nginx                

                if (result.code === 0) {
                    db.query(
                        'UPDATE domains SET ssl_enabled = 1, ssl_type = ?, ssl_expires_at = ? WHERE id = ?',
                        ['lets_encrypt', new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), domainId]
                    );
                    reloadService('apache2');
                    logInfo(`SSL certificate issued for ${domain.name}`, 'Lets-Encrypt');
                    return { success: true };
                }
                throw new Error(result.stderr);
            }
        },

        renew: {
            post: async ({ domainId }: { domainId: number }) => {
                const domain = db.queryEntries('SELECT * FROM domains WHERE id = ?', [domainId])[0];
                if (!domain) throw new Error('Domain not found');
                if (domain.ssl_type !== 'lets_encrypt') throw new Error('Domain not using Let\'s Encrypt');

                const result = await run('certbot', ['renew', '--cert-name', domain.name], { sudo: true });
                
                if (result.code === 0) {
                    db.query(
                        'UPDATE domains SET ssl_expires_at = ? WHERE id = ?',
                        [new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), domainId]
                    );
                    reloadService('apache2');
                    logInfo(`SSL certificate renewed for ${domain.name}`, 'Lets-Encrypt');
                    return { success: true };
                }
                throw new Error(result.stderr);
            }
        },

        delete: {
            post: async ({ domainId }: { domainId: number }) => {
                const domain = db.queryEntries('SELECT * FROM domains WHERE id = ?', [domainId])[0];
                if (!domain) throw new Error('Domain not found');
                if (domain.ssl_type !== 'lets_encrypt') throw new Error('Domain not using Let\'s Encrypt');

                await run('certbot', ['delete', '--cert-name', domain.name], { sudo: true });
                
                db.query(
                    'UPDATE domains SET ssl_enabled = 0, ssl_type = NULL, ssl_expires_at = NULL WHERE id = ?',
                    [domainId]
                );
                
                await run('systemctl', ['reload', 'apache2'], { sudo: true });
                logInfo(`SSL certificate deleted for ${domain.name}`, 'Lets-Encrypt');
                return { success: true };
            }
        }
    }
};
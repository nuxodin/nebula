import db from "../../utils/database.ts";
import { logInfo } from "../../utils/logger.ts";
import { Context } from "hono/mod.ts";
import { hash, compare } from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

export const api = {
    password: {
        post: async function (c: Context) {
            const { current, password } = await c.req.json();
            const userId = await c.get('session').get('userId');
            if (!userId) throw new Error("Not logged in");
            if (!current || !password) throw new Error("Missing data");
            if (current === password) throw new Error("New password must be different");

            const user = db.queryEntries<{password: string}>("SELECT * FROM clients WHERE id = ?", [userId])[0];
            if (!user) throw new Error("User not found");

            const isValidPassword = await compare(current, user.password);
            if (!isValidPassword) throw new Error("Current password is incorrect");

            const hashedPassword = await hash(password);
            db.query("UPDATE clients SET password = ? WHERE id = ?", [hashedPassword, userId]);
            logInfo(`Password changed for user ${userId}`, "Auth", c);
            return { success: true };
        }
    },
    passkeys: {
        get: async function(c: Context) {
            const userId = await c.get('session').get('userId');
            if (!userId) throw new Error("Not logged in");

            const devices = db.queryEntries(`
                SELECT id, device_name as name, created_at, last_used
                FROM webauthn_devices 
                WHERE user_id = ?
                ORDER BY last_used DESC NULLS LAST
            `, [userId]);

            return { devices };
        },
        ':id': {
            delete: async function(c: Context) {
                const userId = await c.get('session').get('userId');
                if (!userId) throw new Error("Not logged in");
                
                const { id } = c.req.param();
                
                // Überprüfen ob der Passkey dem Benutzer gehört
                const device = db.queryEntries(
                    "SELECT * FROM webauthn_devices WHERE id = ? AND user_id = ?",
                    [id, userId]
                )[0];
                
                if (!device) {
                    throw new Error("Passkey nicht gefunden");
                }
                
                db.query("DELETE FROM webauthn_devices WHERE id = ?", [id]);
                logInfo(`Passkey ${id} wurde gelöscht`, "Profile", c);
                
                return { success: true };
            }
        }
    }
};

import { Context } from "hono";
import { logInfo } from "../../utils/logger.ts";
import { renderTemplate } from "../../utils/template.ts";
import db from "../../utils/database.ts";
import { hash } from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

import { 
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  generateRegistrationOptions 
} from "npm:@simplewebauthn/server";
import { config } from "../../utils/config.ts";
import { authDb, authOsRoot } from './src/auth.ts';


const rpName = config.hostname || 'Nebula WebAuthn';
const rpID = config.hostname || 'localhost';
const origin = `http://${rpID}:${config.port || '4242'}`;
console.log('WebAuthn origin:', origin);

export const getLoginView = async (c: Context) => {
    const content = await Deno.readTextFile("./modules/login/views/content.html");
    const scripts = await Deno.readTextFile("./modules/login/views/scripts.html");
    return c.html(await renderTemplate("Login", content, "", scripts));
};

// Hilfsfunktionen für base64URL
function base64URLString(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function base64URLToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(base64url.length + ((4 - (base64url.length % 4)) % 4), '=');
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

// API Controller
export const api = {
  'get-auth-options': {
    post: async (c: Context) => {
      const options = await generateAuthenticationOptions({
        rpID,
        userVerification: 'preferred',
      });

      const session = c.get('session');
      await session.set('currentChallenge', options.challenge);

      return options;
    }
  },
  'verify-auth': {
    post: async (c: Context) => {
      const { assertion } = await c.req.json();
      const session = c.get('session');
      const expectedChallenge = await session.get('currentChallenge');

      try {
        const credentialId = assertion.id;
        const device = db.queryEntries(
          "SELECT d.*, c.id as user_id, c.login FROM webauthn_devices d JOIN clients c ON d.user_id = c.id WHERE d.device_id = ?",
          [credentialId]
        )[0];

        if (!device) return { error: "Unbekanntes Gerät" };

        const verification = await verifyAuthenticationResponse({
          response: assertion,
          expectedChallenge,
          expectedOrigin: origin,
          expectedRPID: rpID,
          credential: {
            id: device.device_id,
            publicKey: base64URLToBuffer(device.public_key),
            counter: 0
          },
        });

        if (verification.verified) {
          await session.set('userId', device.user_id);
          await session.set('userLogin', device.login);

          db.query(
            "UPDATE webauthn_devices SET last_used = CURRENT_TIMESTAMP WHERE device_id = ?",
            [credentialId]
          );

          return { success: true };
        }

        return { error: "Verifikation fehlgeschlagen" };
      } catch (err) {
        console.error('Auth error:', err);
        return { error: err.message };
      }
    }
  },
  'login': {
    post: async (c: Context) => {
      const data = await c.req.json();
      const { login, password } = data;
      if (!login) return { error: "Benutzername erforderlich" };

      let ok = await authDb(login, password);
      if (!ok) {
        const hasAdmin = db.queryEntries("SELECT id, login, password FROM clients WHERE is_admin = 1").length > 0;
        if (!hasAdmin) {
          if (login !== 'admin') return { error: "login: Benutzer nicht gefunden" };
          if (await authOsRoot(password)) {
            ok = true;
            logInfo("Root-Authentifizierung erfolgreich", "Auth", c);
            const passwordHash = await hash(password);
            db.query("INSERT INTO clients (login, password, is_admin) VALUES (?, ?, 1)", ["admin", passwordHash]);
          }
        }
      }
      if (!ok) return { error: "Ungültige Anmeldedaten" };

      const user = db.queryEntries(
        "SELECT id, login, password FROM clients WHERE login = ?",
        [login]
      )[0];

      const session = c.get('session');
      await session.set('userId', user.id);
      await session.set('userLogin', user.login);
      logInfo(`Benutzer ${login} hat sich angemeldet`, "Auth", c);
      return { success: true };
    }
  },
  'register-device': {
    post: async (c: Context) => {
        const session = c.get('session');
        const userId = await session.get('userId');
        if (!userId) return { error: "Nicht eingeloggt" };

        const user = db.queryEntries("SELECT login FROM clients WHERE id = ?", [userId])[0];

        const userIdBuffer = new Uint8Array(4);
        new DataView(userIdBuffer.buffer).setUint32(0, userId, false);

        const options = await generateRegistrationOptions({
            rpName,
            rpID,
            userID: userIdBuffer,
            userName: user.login,
            attestationType: 'none',
            authenticatorSelection: {
                residentKey: 'preferred',
                userVerification: 'preferred',
                authenticatorAttachment: 'platform'
            }
        });

        session.set('currentChallenge', options.challenge);

        return options;
    }
  },
  'verify-registration': {
    post: async (c: Context) => {
        const session = c.get('session');
        const userId = await session.get('userId');
        if (!userId) return { error: "Nicht eingeloggt" };

        const data = await c.req.json();
        const expectedChallenge = await session.get('currentChallenge');

        try {
          const verification = await verifyRegistrationResponse({
            response: data,
            expectedChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID
          });

          if (verification.verified) {
            const { registrationInfo } = verification;
            const deviceId = data.id;
            const publicKeyBase64 = base64URLString(registrationInfo.credential.publicKey);

            const existingDevice = db.queryEntries(
              "SELECT * FROM webauthn_devices WHERE device_id = ?",
              [deviceId]
            )[0];

            if (existingDevice) return { error: "Dieses Gerät wurde bereits registriert" };

            db.query(
              "INSERT INTO webauthn_devices (user_id, device_id, device_name, public_key) VALUES (?, ?, ?, ?)",
              [userId, deviceId, data.deviceName || 'Unbenanntes Gerät', publicKeyBase64 ]
            );

            logInfo(`Neues WebAuthn-Gerät registriert für Benutzer ${userId}`, "Auth", c);
            return { success: true };
          }
          
          return { error: "Verifikation fehlgeschlagen" };
        } catch (err) {
          console.error('Registrierungsfehler:', err);
          return { error: err.message };
        }
    }
  }
};
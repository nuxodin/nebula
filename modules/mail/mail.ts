import db from "../../utils/database.ts";
import { logInfo, logError } from "../../utils/logger.ts";

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
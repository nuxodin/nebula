import db from "./utils/database.ts";

// Beispieldaten für Clients
const clients = [
  { login: "admin", password: "admin", email: "admin@example.com" },
  { login: "user1", password: "user1pass", email: "user1@example.com" }
];

for (const client of clients) {
  db.query("INSERT INTO clients (login, password, email) VALUES (?, ?, ?)", [client.login, client.password, client.email]);
}

// Beispieldaten für Domains
const domains = [
  { name: "example.com", owner_id: 1, status: "aktiv" },
  { name: "test.com", owner_id: 2, status: "aktiv" }
];

for (const domain of domains) {
  db.query("INSERT INTO domains (name, owner_id, status) VALUES (?, ?, ?)", [domain.name, domain.owner_id, domain.status]);
}

// Beispieldaten für Hosting
const hosting = [
  { dom_id: 1, htype: "apache", ip_address: "192.168.1.1" },
  { dom_id: 2, htype: "nginx", ip_address: "192.168.1.2" }
];

for (const host of hosting) {
  db.query("INSERT INTO hosting (dom_id, htype, ip_address) VALUES (?, ?, ?)", [host.dom_id, host.htype, host.ip_address]);
}

// Beispieldaten für Datenbanken
const databases = [
  { dom_id: 1, name: "example_db", type: "mysql" },
  { dom_id: 1, name: "blog_db", type: "mysql" },
  { dom_id: 1, name: "shop_db", type: "postgresql" },
  { dom_id: 2, name: "test_db", type: "postgresql" },
  { dom_id: 2, name: "app_db", type: "mysql" }
];

for (const dbEntry of databases) {
  db.query("INSERT INTO databases (dom_id, name, type) VALUES (?, ?, ?)", [dbEntry.dom_id, dbEntry.name, dbEntry.type]);
}

// Beispieldaten für E-Mail-Konten
const mail = [
  { dom_id: 1, mail_name: "info@example.com", password: "infopass" },
  { dom_id: 1, mail_name: "support@example.com", password: "supportpass" },
  { dom_id: 1, mail_name: "admin@example.com", password: "adminpass" },
  { dom_id: 2, mail_name: "contact@test.com", password: "contactpass" },
  { dom_id: 2, mail_name: "sales@test.com", password: "salespass" }
];

for (const mailEntry of mail) {
  db.query("INSERT INTO mail (dom_id, mail_name, password) VALUES (?, ?, ?)", [mailEntry.dom_id, mailEntry.mail_name, mailEntry.password]);
}

console.log("Beispieldaten erfolgreich eingefügt");
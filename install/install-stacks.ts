// install_hosting_stack.ts – Universelle Installation von Apache2, MariaDB, Postfix, Dovecot und Bind9 mit Deno

import { installPackages, startAndEnableService } from "../utils/command.ts";

// Setzt DEBIAN_FRONTEND auf noninteractive (für Docker und CI/CD)
const setNonInteractive = () => {
  console.log("\n⚙️ Setze DEBIAN_FRONTEND auf noninteractive...");
  Deno.env.set("DEBIAN_FRONTEND", "noninteractive");
};

// Überprüft und installiert Apache2
const setupApache = async () => {
  console.log("\n🌐 Überprüfung und Installation von Apache2...");
  await installPackages(["apache2"]);
  await startAndEnableService("apache2");
};

// Überprüft und installiert MariaDB
const setupMariaDB = async () => {
  console.log("\n💾 Überprüfung und Installation von MariaDB...");
  await installPackages(["mariadb-server"]);
  await startAndEnableService("mariadb");
};

// Überprüft und installiert Postfix und Dovecot (Mailserver)
const setupMailServer = async () => {
  console.log("\n📧 Überprüfung und Installation von Postfix und Dovecot...");
  await installPackages(["postfix", "dovecot-core", "dovecot-imapd"]);
  await startAndEnableService("postfix");
  await startAndEnableService("dovecot");
};

// Überprüft und installiert Bind9 (Nameserver)
const setupNameServer = async () => {
  console.log("\n🌐 Überprüfung und Installation von Bind9...");
  await installPackages(["bind9", "bind9utils"]);
  await startAndEnableService("bind9");
};

// Hauptablauf
async function main() {
  await setNonInteractive();
  await setupApache();
  await setupMariaDB();
  await setupMailServer();
  await setupNameServer();
  console.log("\n🎉 Hosting-Stack erfolgreich installiert und gestartet!");
}


//await main();
main();

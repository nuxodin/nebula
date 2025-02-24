// install_hosting_stack.ts – Universelle Installation von Apache2, MariaDB, Postfix, Dovecot und Bind9 mit Deno

import { installPackages, startService } from "../utils/command.ts";

// Setzt DEBIAN_FRONTEND auf noninteractive (für Docker und CI/CD)
const setNonInteractive = () => {
  console.log("\n⚙️ Setze DEBIAN_FRONTEND auf noninteractive...");
  Deno.env.set("DEBIAN_FRONTEND", "noninteractive");
};

// Überprüft und installiert Apache2
const setupApache = async () => {
  console.log("\n🌐 Überprüfung und Installation von Apache2...");
  await installPackages(["apache2"]);
  await startService("apache2");
};

// Überprüft und installiert MariaDB
const setupMariaDB = async () => {
  console.log("\n💾 Überprüfung und Installation von MariaDB...");
  await installPackages(["mariadb-server"]);
  await startService("mariadb");
};

// Überprüft und installiert Postfix und Dovecot (Mailserver)
const setupMailServer = async () => {
  console.log("\n📧 Überprüfung und Installation von Postfix und Dovecot...");
  await installPackages(["postfix", "dovecot-core", "dovecot-imapd"]);
  await startService("postfix");
  await startService("dovecot");
};

// Überprüft und installiert Bind9 (Nameserver)
// zzz const setupNameServer = async () => {
//   console.log("\n🌐 Überprüfung und Installation von Bind9...");
//   await installPackages(["bind9", "bind9utils"]);
//   await startService("bind9");
// };
const setupNameServer = async () => {
  console.log("\n🌐 Überprüfung und Installation von Bind9...");
  await installPackages(["bind9", "bind9utils"]);
  try {
    await startService("bind9");
  } catch (e) {
    console.warn("Service 'bind9' nicht erkannt. Versuche 'named'...");
    await startService("named");
  }
};

// Überprüft und installiert Prozess-Tools
const setupProcessTools = async () => {
  console.log("\n📊 Überprüfung und Installation von Prozess-Tools...");
  await installPackages(["procps"]);
};

// Hauptablauf
async function main() {
  await setNonInteractive();
  await setupProcessTools();
  await setupApache();
  await setupMariaDB();
  await setupNameServer();
  await setupMailServer();
  console.log("\n🎉 Hosting-Stack erfolgreich installiert und gestartet!");
}

//await main();
const isWindows = Deno.build.os === "windows";

if (!isWindows) {
  main();
}

//main();

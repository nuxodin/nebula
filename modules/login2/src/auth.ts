import db from "../../../utils/database.ts";
import { compare } from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";


export function authDb(login: string, password: string) {
  const user = db.queryEntries(
    "SELECT id, login, password FROM clients WHERE login = ?",
    [login]
  )[0];

  return user && compare(password, user.password);
}


export async function authOsRoot(password: string) {

  if (Deno.build.os === "windows") {
      return true;
  }

  const p = new Deno.Command("su", {
      args: ["-c", "echo Zugriff erlaubt"],
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
  });

  const process = p.spawn();
  const writer = process.stdin.getWriter();
  await writer.write(new TextEncoder().encode(password + "\n"));
  await writer.close();

  const { stdout, stderr } = await process.output();
  const output = new TextDecoder().decode(stdout);
  const error = new TextDecoder().decode(stderr);

  // Wenn die Ausgabe "Zugriff erlaubt" enthält, war das Passwort korrekt
  // Wenn ein Fehler in stderr auftaucht, war das Passwort falsch
  if (output.includes("Zugriff erlaubt") && error === "") {
      return true;
  } else {
      return false;
  }
}

import { Context } from "hono";
import { logError } from "../../utils/logger.ts";
import { renderTemplate } from "../../utils/template.ts";
import { run } from "../../utils/command.ts";

// View Controller
export const getTerminalView = async (c: Context) => {
  try {
    const content = await Deno.readTextFile("./modules/terminal/views/content.html");
    const scripts = await Deno.readTextFile("./modules/terminal/views/scripts.html");
    return c.html(await renderTemplate("Terminal", content, "", scripts));
  } catch (err) {
    logError("Fehler beim Laden des Terminals", "Terminal", c, err);
    return c.text("Internal Server Error", 500);
  }
};

// API Controller
export const api = {
  post: async (c: Context) => {
    const { command } = await c.req.json();
    if (!command) throw new Error("No command provided");    

    // use sh for linux
    if (Deno.build.os !== "windows") {
        const result = await run("sh", ["-c", command], { sudo: true });
        return result;
    } else {
        return {
            stderr: "Windows wird noch nicht unterstützt"
        }
    }
  }

};
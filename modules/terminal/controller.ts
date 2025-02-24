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
    if (!command) {
        throw new Error("No command provided");
    }

    const [cmd, ...args] = command.split(' ');
    let result = null;

    return await run(cmd, args, { sudo: true });

    try {
        result = await run(cmd, args, { sudo: true });
        return {
            output: result.output,
            code: result.code
        };
    } catch (err) {
        return {
            output: result.output,
            code: result.code
        };
    }
  }
};
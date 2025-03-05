import { logError } from "../../utils/logger.ts";
import { getComponents, getInstalledComponents, installComponentBackground } from "./controller.ts";

export const api = {
    get: getComponents,
    installed: getInstalledComponents,
    install: {
        post: async function(c) {
            const data = await c.req.json();
            const { component, version } = data;

            if (!component) {
                return { error: "Komponente nicht angegeben" };
            }

            try {
                const components = await getComponents();
                const componentConfig = components[component];
                
                if (!componentConfig) {
                    return { error: "Komponente nicht gefunden" };
                }

                await installComponentBackground(component, version, componentConfig);
                return { success: true };
            } catch (error) {
                logError(`Installation fehlgeschlagen: ${error.message}`, "Components", c, error);
                return { error: error.message };
            }
        }
    }
};
import { checkInstalledPhpVersions, getAvailableVersions, installPhp, startPhpService, stopPhpService, enablePhpRepository } from "./controller.ts";

export const api = {
    installed: checkInstalledPhpVersions,
    available: getAvailableVersions,
    install: {
        post: async (c) => {
            const { version } = await c.req.json();
            return await installPhp(version);
        }
    },
    'service/:version': {
        start: {
            post: async (c) => {
                const { version } = c.req.param();
                await startPhpService(version);
            }
        },
        stop: {
            post: async (c) => {
                const { version } = c.req.param();
                await stopPhpService(version);
                return { success: true };
            }
        }
    },
    'enable-repo': {
        post: async () => {
            return await enablePhpRepository();
        }
    }
};
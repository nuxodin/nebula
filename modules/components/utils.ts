

export function isWindows(): boolean {
    return Deno.build.os === "windows";
}
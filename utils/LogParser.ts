export class LogParser {
    constructor(filePath) {
        this.filePath = filePath;
        this.format = "auto";
    }

    setFormat(format) {
        this.format = format;
        return this;
    }

    async getEntries({ order = "asc", limit = Infinity, search = "" } = {}) {
        try {
            using file = await Deno.open(this.filePath);
            const entries = [];
            for await (const line of readLines(file, order)) {
                const entry = this.parseLine(line);
                if (!search || entry.message.toLowerCase().includes(search.toLowerCase())) {
                    if (entries.length < limit) entries.push(entry);
                    else break;
                }
            }
            return entries;
        } catch (error) {
            throw error instanceof Deno.errors.NotFound ? 
                new Error(`Datei nicht gefunden: ${this.filePath}`) : 
                new Error(`Fehler beim Lesen der Datei: ${error.message}`);
        }
    }

    parseLine(line) {
        const parserObj = this.format === "auto"
            ? (Object.values(parsers).find(p => p.regex?.test(line)) || { parse: parseFallback })
            : (parsers[this.format] || { parse: parseFallback });
        return parserObj.regex ? parserObj.parse(line.match(parserObj.regex) || [line]) : parserObj.parse(line);
    }
}

async function* readLines(file, order, chunkSize = 1024) {
    const decoder = new TextDecoder();
    let buffer = "";
    if (order === "desc") {
        const stat = await file.stat();
        let position = stat.size;
        while (position > 0) {
            const readSize = Math.min(chunkSize, position);
            position -= readSize;
            await file.seek(position, Deno.SeekMode.Start);
            const chunk = new Uint8Array(readSize);
            await file.read(chunk);
            buffer = decoder.decode(chunk, { stream: true }) + buffer;
            const lines = buffer.split("\n");
            buffer = lines.shift();
            for (let i = lines.length - 1; i >= 0; i--) if (lines[i].trim()) yield lines[i];
        }
        if (buffer.trim()) yield buffer;
    } else {
        for await (const chunk of file.readable) {
            buffer += decoder.decode(chunk, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop();
            for (const line of lines) if (line.trim()) yield line;
        }
        if (buffer.trim()) yield buffer;
    }
}

function createEntry({ date, level, message, context = {} }) {
    if (message === undefined) throw new Error("Message must be provided");
    return {
        date: date ? new Date(date) : null,
        level: level || "unknown",
        message: message || "",
        context,
        toString({ hide = [] } = {}) {
            return [
                !hide.includes("date") ? (this.date ? this.date.toISOString().split("T")[0] + " " + this.date.toTimeString().split(" ")[0] : "no-date") : "",
                !hide.includes("level") ? `[${this.level}]` : "",
                this.message
            ].filter(Boolean).join(" ");
        },
        toJSON() {
            return { date: this.date, level: this.level, message: this.message, context: this.context };
        }
    };
}

const parsers = {
    Syslog: {
        regex: /^\[([^\]]+)\] \[([^:]+):([^\]]+)\] (.*)$/,
        parse: ([, dateStr, module, level, rest]) => {
            const [message, ...contextParts] = rest.split(" ").reduce((acc, part) => (
                part.includes(":") ? acc.push(part) : (acc[0] += " " + part), acc
            ), [""]);
            return createEntry({ date: dateStr, level, message: message.trim(), context: { module, details: contextParts.join(" ") } });
        }
    },
    Apache: {
        regex: /^(\d+\.\d+\.\d+\.\d+) - - \[([^\]]+)\] "([^"]+)" (\d+) (\d+) "([^"]*)" "([^"]*)"/,
        parse: ([, ip, dateStr, request, status, size, referer, userAgent]) =>
            createEntry({
                date: dateStr.replace(/:/, " "),
                level: status.startsWith("4") || status.startsWith("5") ? "error" : "info",
                message: `${request} -> ${status}`,
                context: { ip, referer, userAgent, size: parseInt(size) }
            })
    },
    Nginx: {
        regex: /^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}) \[([^\]]+)\] (\d+#\d+): (.*)$/,
        parse: ([, dateStr, level, pid, message]) =>
            createEntry({ date: dateStr.replace(/\//g, "-"), level, message, context: { pid } })
    },
    Json: {
        regex: /^\s*{.*}\s*$/,
        parse: line => {
            try {
                const data = JSON.parse(line);
                return createEntry({
                    date: data.time || data.date,
                    level: data.level,
                    message: data.msg || data.message || "",
                    context: { ...data, time: undefined, level: undefined, msg: undefined, message: undefined }
                });
            } catch {
                return createEntry({ message: "Invalid JSON", context: { raw: line } });
            }
        }
    },
    Systemd: {
        // Matched z.B.: "Mar 14 15:02:22 gcdn systemd[1]: nebula.service: Succeeded."
        regex: /^([A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+(\S+)\s+(\S+)\[(\d+)\]:\s+(.+)$/,
        parse: ([, dateStr, host, program, pid, message]) => {
            const date = new Date(new Date().getFullYear() + " " + dateStr);
            return createEntry({
                date,
                level: message.toLowerCase().includes('error') ? 'error' : 
                       message.toLowerCase().includes('failed') ? 'error' :
                       message.toLowerCase().includes('warn') ? 'warning' : 'info',
                message: message,
                context: { 
                    host,
                    program,
                    pid
                }
            });
        }
    },
    PythonLog: {
        // Matched z.B.: "2025-03-14 03:43:47,987:DEBUG:certbot._internal.main:Discovered plugins: PluginsRegistry(...)"
        regex: /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2},\d{3}):([^:]+):([^:]+):(.+)$/,
        parse: ([, dateStr, level, module, message]) => {
            return createEntry({
                date: new Date(dateStr.replace(',', '.')),
                level: level.toLowerCase(),
                message: message.trim(),
                context: { 
                    module,
                    type: 'python'
                }
            });
        }
    }
};

const parseFallback = line => createEntry({ message: line });
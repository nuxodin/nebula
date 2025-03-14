export class LogParser {
    constructor(filePath) {
        this.filePath = filePath;
        this.format = "auto";
    }

    setFormat(format) {
        this.format = format;
        return this;
    }

    /**
     * Parst Logdateien und gibt Einträge basierend auf den Optionen zurück.
     * @param {Object} [options] - Konfigurationsoptionen
     * @param {'asc'|'desc'} [options.order='asc'] - Reihenfolge der Einträge
     * @param {number} [options.limit=Infinity] - Maximale Anzahl der Einträge
     * @param {string} [options.search=''] - Suchbegriff (case-insensitive)
     * @returns {Promise<Object[]>} Geparsede Logeinträge
     */
    async getEntries(options = {}) {
        const { order = 'asc', limit = Infinity, search = '' } = options;
        try {
            using file = await Deno.open(this.filePath);
            const decoder = new TextDecoder();
            let entries = [];
            let buffer = "";

            if (order === 'desc') {
                const stat = await file.stat();
                let position = stat.size;
                const chunkSize = 1024;

                while (position > 0 && entries.length < limit) {
                    const readSize = Math.min(chunkSize, position);
                    position -= readSize;
                    await file.seek(position, Deno.SeekMode.Start);
                    const chunk = new Uint8Array(readSize);
                    await file.read(chunk);
                    buffer = decoder.decode(chunk, { stream: true }) + buffer;
                    const lines = buffer.split("\n");
                    buffer = lines.shift();

                    for (let i = lines.length - 1; i >= 0 && entries.length < limit; i--) {
                        this.processLine(lines[i], search, entries, limit);
                    }
                }

                if (buffer.trim() && entries.length < limit) {
                    this.processLine(buffer, search, entries, limit);
                }
            } else {
                for await (const chunk of file.readable) {
                    buffer += decoder.decode(chunk, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop();

                    for (const line of lines) {
                        this.processLine(line, search, entries, limit);
                        if (entries.length >= limit) break;
                    }
                    if (entries.length >= limit) break;
                }

                if (buffer.trim() && entries.length < limit) {
                    this.processLine(buffer, search, entries, limit);
                }
            }

            return entries.slice(0, limit);
        } catch (error) {
            if (error instanceof Deno.errors.NotFound) {
                throw new Error(`Datei nicht gefunden: ${this.filePath}`);
            }
            throw new Error(`Fehler beim Lesen der Datei: ${error.message}`);
        }
    }

    processLine(line, search, entries, limit) {
        if (!line.trim()) return;
        const entry = this.parseLine(line);
        if (search && !entry.message.toLowerCase().includes(search.toLowerCase())) return;
        if (entries.length < limit) entries.push(entry);
    }

    parseLine(line) {
        const parserObj = this.format === "auto"
            ? this.detectFormat(line)
            : (parsers[this.format] || { parse: parseFallback });

        if (parserObj.regex) {
            const match = line.match(parserObj.regex);
            return match ? parserObj.parse(match) : parseFallback(line);
        }
        return parserObj.parse(line);
    }

    detectFormat(line) {
        for (const [name, parser] of Object.entries(parsers)) {
            if (parser.regex && parser.regex.test(line)) return parser;
        }
        return { parse: parseFallback };
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
            const parts = [];
            if (!hide.includes("date")) parts.push(this.date ? this.date.toISOString().split("T")[0] + " " + this.date.toTimeString().split(" ")[0] : "no-date");
            if (!hide.includes("level")) parts.push(`[${this.level}]`);
            parts.push(this.message);
            return parts.join(" ");
        },
        toJSON() {
            return { date: this.date, level: this.level, message: this.message, context: this.context };
        }
    };
}

const parsers = {
    Syslog: {
        regex: /^\[([^\]]+)\] \[([^:]+):([^\]]+)\] (.*)$/,
        parse(match) {
            const [, dateStr, module, level, rest] = match;
            const [message, ...contextParts] = rest.split(" ").reduce((acc, part) => {
                if (part.includes(":")) acc.push(part);
                else acc[0] += " " + part;
                return acc;
            }, [""]);
            return createEntry({
                date: dateStr,
                level,
                message: message.trim(),
                context: { module, details: contextParts.join(" ") }
            });
        }
    },
    Apache: {
        regex: /^(\d+\.\d+\.\d+\.\d+) - - \[([^\]]+)\] "([^"]+)" (\d+) (\d+) "([^"]*)" "([^"]*)"/,
        parse(match) {
            const [, ip, dateStr, request, status, size, referer, userAgent] = match;
            return createEntry({
                date: dateStr.replace(/:/, " "),
                level: status.startsWith("4") || status.startsWith("5") ? "error" : "info",
                message: `${request} -> ${status}`,
                context: { ip, referer, userAgent, size: parseInt(size) }
            });
        }
    },
    Nginx: {
        regex: /^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}) \[([^\]]+)\] (\d+#\d+): (.*)$/,
        parse(match) {
            const [, dateStr, level, pid, message] = match;
            return createEntry({
                date: dateStr.replace(/\//g, "-"),
                level,
                message,
                context: { pid }
            });
        }
    },
    Json: {
        regex: /^\s*{.*}\s*$/,
        parse(line) {
            try {
                const data = JSON.parse(line);
                return createEntry({
                    date: data.time || data.date,
                    level: data.level,
                    message: data.msg || data.message || "",
                    context: { ...data, time: undefined, level: undefined, msg: undefined, message: undefined }
                });
            } catch (e) {
                return createEntry({ message: "Invalid JSON", context: { raw: line } });
            }
        }
    }
};

const parseFallback = (line) => createEntry({ message: line });
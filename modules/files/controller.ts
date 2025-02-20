import { logInfo, logError } from "../../utils/logger.ts";
import { join } from "https://deno.land/std@0.208.0/path/mod.ts";
import { ensureDir } from "https://deno.land/std@0.208.0/fs/ensure_dir.ts";
import { renderTemplate } from "../../utils/template.ts";

interface FileOptions {
  rootPath: string;
  title?: string;
}

// Hilfsfunktion für Pfadvalidierung und -normalisierung
function normalizeAndValidatePath(path: string, rootPath: string): string {
  // Entferne führende Slashes und normalisiere Backslashes
  const normalizedPath = path.replace(/^[\/\\]+/, '').replace(/\//g, '\\');
  
  // Wenn es ein Windows-Laufwerkspfad ist, diesen direkt verwenden
  if (/^[A-Za-z]:\\/.test(normalizedPath)) {
    return normalizedPath;
  }
  
  // Ansonsten den rootPath als Basis verwenden
  return rootPath === "/" ? normalizedPath : join(rootPath, normalizedPath);
}

function validatePath(path: string, rootPath: string): boolean {
  if (rootPath === "/") return true;
  const normalizedPath = normalizeAndValidatePath(path, rootPath);
  return normalizedPath.startsWith(rootPath);
}

// View Controller
export const getFilesView = async (c, options: FileOptions) => {
  try {
    const content = await Deno.readTextFile("./modules/files/views/files.html");
    const scripts = await Deno.readTextFile("./modules/files/views/files-scripts.html");
    
    // Füge die Root-Path-Konfiguration dem Frontend hinzu
    const configScript = `<script>
      window.fileExplorerConfig = {
        rootPath: "${options.rootPath}",
        title: "${options.title || 'File Explorer'}"
      };
    </script>`;
    
    return c.html(await renderTemplate(options.title || "File Explorer", content, "", configScript + scripts));
  } catch (err) {
    logError("Error loading file explorer view", "Files", c, err);
    return c.text("Internal Server Error", 500);
  }
};

// List files and directories
export const getFiles = async (c, options: FileOptions) => {
  try {
    const { path = "/" } = c.req.query();
    const normalizedPath = normalizeAndValidatePath(path, options.rootPath);
    
    // Wenn ein Root-Pfad konfiguriert ist und wir im Root sind
    if ((path === "/" || path === options.rootPath) && options.rootPath !== "/") {
      try {
        // Standard Domain-Verzeichnisse
        const standardDirs = ["httpdocs", "conf", "logs", "private", "statistics"];
        const rootDirEntries = [];
        
        for (const dirName of standardDirs) {
          const dirPath = join(options.rootPath, dirName);
          try {
            const stat = await Deno.stat(dirPath);
            if (stat.isDirectory) {
              rootDirEntries.push({
                name: dirName + "/",
                path: dirPath,
                isDirectory: true,
                size: null,
                modified: stat.mtime?.toISOString()
              });
            }
          } catch {
            // Verzeichnis existiert noch nicht, erstelle es
            await ensureDir(dirPath);
            rootDirEntries.push({
              name: dirName + "/",
              path: dirPath,
              isDirectory: true,
              size: null,
              modified: new Date().toISOString()
            });
          }
        }
        return c.json(rootDirEntries);
      } catch (err) {
        return c.json({ error: "Root directory not accessible" }, 403);
      }
    }

    // Wenn kein Root-Pfad konfiguriert ist und wir im Root sind, zeige Laufwerke
    if (path === "/" && options.rootPath === "/") {
      const drives = ["C:", "D:", "E:", "F:"];
      const availableDrives = [];
      
      for (const drive of drives) {
        try {
          const stat = await Deno.stat(drive + "\\");
          if (stat.isDirectory) {
            availableDrives.push({
              name: drive + "/",
              path: drive + "\\",
              isDirectory: true,
              size: null,
              modified: null
            });
          }
        } catch {
          continue;
        }
      }
      
      return c.json(availableDrives);
    }

    // Prüfe ob der Pfad innerhalb des erlaubten Bereichs liegt
    if (!validatePath(normalizedPath, options.rootPath)) {
      return c.json({ error: "Access denied" }, 403);
    }

    // Liste Dateien und Ordner
    const files = [];
    try {
      const dirEntries = Deno.readDirSync(normalizedPath);
      for (const entry of dirEntries) {
        try {
          const entryPath = join(normalizedPath, entry.name);
          // Sicherheitscheck für den Pfad
          if (!validatePath(entryPath, options.rootPath)) {
            continue;
          }
          const stat = await Deno.stat(entryPath);
          files.push({
            name: entry.isDirectory ? entry.name + "/" : entry.name,
            size: entry.isFile ? stat.size : null,
            modified: stat.mtime?.toISOString(),
            isDirectory: entry.isDirectory,
            path: entryPath
          });
        } catch {
          continue;
        }
      }

      files.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

      return c.json(files);
    } catch (err) {
      logError(`Error accessing directory: ${normalizedPath}`, "Files", c, err);
      return c.json({ error: "Directory not accessible" }, 403);
    }
  } catch (err) {
    logError("Error listing files", "Files", c, err);
    return c.json({ error: err.message }, 500);
  }
};

// Create file or directory
export const createFile = async (c, options: FileOptions) => {
  try {
    const { path, type } = await c.req.json();
    
    if (!validatePath(path, options.rootPath)) {
      return c.json({ error: "Access denied" }, 403);
    }

    if (type === 'directory') {
      await ensureDir(path);
      logInfo(`Directory created: ${path}`, "Files", c);
    } else {
      const dir = path.split(/[\/\\]/).slice(0, -1).join('\\');
      await ensureDir(dir);
      await Deno.writeTextFile(path, '');
      logInfo(`File created: ${path}`, "Files", c);
    }

    return c.json({ message: `${type === 'directory' ? 'Directory' : 'File'} created` });
  } catch (err) {
    logError("Error creating file/directory", "Files", c, err);
    return c.json({ error: err.message }, 500);
  }
};

// Delete file or directory
export const deleteFile = async (c, options: FileOptions) => {
  try {
    const { path } = await c.req.json();
    
    if (!validatePath(path, options.rootPath)) {
      return c.json({ error: "Access denied" }, 403);
    }

    const stat = await Deno.stat(path);

    if (stat.isDirectory) {
      await Deno.remove(path, { recursive: true });
      logInfo(`Directory deleted: ${path}`, "Files", c);
    } else {
      await Deno.remove(path);
      logInfo(`File deleted: ${path}`, "Files", c);
    }

    return c.json({ message: "Item deleted" });
  } catch (err) {
    logError("Error deleting file/directory", "Files", c, err);
    return c.json({ error: err.message }, 500);
  }
};

// Rename file or directory
export const renameFile = async (c, options: FileOptions) => {
  try {
    const { oldPath, newPath } = await c.req.json();
    
    if (!validatePath(oldPath, options.rootPath) || !validatePath(newPath, options.rootPath)) {
      return c.json({ error: "Access denied" }, 403);
    }

    await Deno.rename(oldPath, newPath);
    logInfo(`Item renamed: ${oldPath} -> ${newPath}`, "Files", c);
    return c.json({ message: "Item renamed" });
  } catch (err) {
    logError("Error renaming file/directory", "Files", c, err);
    return c.json({ error: err.message }, 500);
  }
};

// Get file content
export const getFileContent = async (c, options: FileOptions) => {
  try {
    const { path } = c.req.query();
    if (!validatePath(path, options.rootPath)) {
      return c.json({ error: "Access denied" }, 403);
    }

    const stat = await Deno.stat(path);
    
    // Wenn es ein Download ist (Accept-Header prüfen)
    if (c.req.header("Accept")?.includes("text/html")) {
      const filename = path.split(/[\/\\]/).pop();
      c.header("Content-Disposition", `attachment; filename="${filename}"`);
      return c.body(await Deno.readFile(path));
    }

    // Für Text-Vorschau
    const content = await Deno.readTextFile(path);
    return c.text(content);
  } catch (err) {
    logError("Error reading file", "Files", c, err);
    return c.json({ error: err.message }, 500);
  }
};

// Update file content
export const updateFileContent = async (c, options: FileOptions) => {
  try {
    const { path, content } = await c.req.json();
    
    if (!validatePath(path, options.rootPath)) {
      return c.json({ error: "Access denied" }, 403);
    }

    await Deno.writeTextFile(path, content);
    logInfo(`File content updated: ${path}`, "Files", c);
    return c.json({ message: "File saved" });
  } catch (err) {
    logError("Error saving file", "Files", c, err);
    return c.json({ error: err.message }, 500);
  }
};

// Handle file uploads
export const uploadFile = async (c, options: FileOptions) => {
  try {
    const formData = await c.req.formData();
    const path = formData.get("path") || "";
    const files = formData.getAll("file");
    
    if (!validatePath(path, options.rootPath)) {
      return c.json({ error: "Access denied" }, 403);
    }

    await ensureDir(path);

    for (const file of files) {
      if (!(file instanceof File)) continue;
      const filePath = join(path, file.name);
      
      // Zusätzliche Sicherheitsprüfung für den finalen Dateipfad
      if (!validatePath(filePath, options.rootPath)) {
        continue;
      }

      const content = new Uint8Array(await file.arrayBuffer());
      await Deno.writeFile(filePath, content);
    }

    logInfo(`Files uploaded: ${files.length} files`, "Files", c);
    return c.json({ message: "Files uploaded" });
  } catch (err) {
    logError("Error uploading files", "Files", c, err);
    return c.json({ error: err.message }, 500);
  }
};
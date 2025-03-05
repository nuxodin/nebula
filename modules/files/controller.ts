import { join } from "https://deno.land/std@0.208.0/path/mod.ts";
import { ensureDir } from "https://deno.land/std@0.208.0/fs/ensure_dir.ts";
import { renderTemplate } from "../../utils/template.ts";
import { file } from 'https://esm.sh/jszip@3.5.0/index.d.ts';

// View Controller
export const getFilesView = async (c) => {
  const content = await Deno.readTextFile("./modules/files/views/content.html");
  const scripts = await Deno.readTextFile("./modules/files/views/scripts.html");
  return c.html(await renderTemplate('File Explorer', content, "", scripts));
};

// Convert mode to rwx format
function modeToRwx(mode: number): string {
  const modeStr = mode.toString(8).padStart(3, '0');
  let result = '';
  
  for (let i = 0; i < 3; i++) {
    const perm = parseInt(modeStr[i]);
    result += (perm & 4) ? 'r' : '-';
    result += (perm & 2) ? 'w' : '-';
    result += (perm & 1) ? 'x' : '-';
    if (i < 2) result += ' ';
  }
  
  return result;
}

export const list = async (c, {rootPath='/'}={}) => {
  const realPath = join(rootPath, c.req.query().path || "");
  const entries = [];
  // is file
  const isFile = await Deno.stat(realPath).then(stat => stat.isFile).catch(() => false);

  if (isFile) {
    const content = await Deno.readTextFile(realPath);
    return { content };
  }

  for await (const entry of Deno.readDir(realPath)) {
    try {
      const fullPath = join(realPath, entry.name);
      const fileInfo = await Deno.stat(fullPath);
      entry.mtime = fileInfo.mtime;
      entry.size = fileInfo.size;

      // Get permissions in rwx format
      if (fileInfo.mode !== undefined) {
        entry.permissions = modeToRwx(fileInfo.mode);
      } else {
        entry.permissions = Deno.build.os === "windows" ? "N/A" : "--- --- ---";
      }

      // Get owner and group info
      if (Deno.build.os !== "windows") {
        try {
          const { uid, gid } = fileInfo.uid !== undefined ? { uid: fileInfo.uid, gid: fileInfo.gid } : 
            (await Deno.lstat(fullPath));
          entry.owner = uid;
          entry.group = gid;
          
          // Try to resolve numeric IDs to names on Unix systems
          try {
            const ownerInfo = await Deno.readTextFile("/etc/passwd");
            const groupInfo = await Deno.readTextFile("/etc/group");
            
            const ownerMatch = ownerInfo.split('\n')
              .find(line => line.startsWith(`${uid}:`) || line.includes(`:${uid}:`));
            const groupMatch = groupInfo.split('\n')
              .find(line => line.startsWith(`${gid}:`) || line.includes(`:${gid}:`));
            
            if (ownerMatch) {
              entry.ownerName = ownerMatch.split(':')[0];
            }
            if (groupMatch) {
              entry.groupName = groupMatch.split(':')[0];
            }
          } catch {
            // Fallback to numeric IDs if name resolution fails
          }
        } catch {
          // Fallback if we can't get owner/group info
          entry.owner = "unknown";
          entry.group = "unknown";
        }
      }
    } catch (error) { /* console.error(error); */ }
    entries.push(entry);
  }
  return entries;
};

export const createFile = async (c, {rootPath='/'}={}) => {
  const { path, type, content = '' } = await c.req.json();
  const realPath = join(rootPath, path);
  if (type === 'directory') {
    await ensureDir(realPath);
  } else {
    // Ensure parent directory exists
    const parentDir = realPath.split('\\').slice(0, -1).join('\\');
    await ensureDir(parentDir);
    await Deno.writeTextFile(realPath, content);
  }
  
  return { success: true, path: realPath };
};

export const deleteFile = async (c, {rootPath='/'}={}) => {
  const { path } = await c.req.json();
  const realPath = join(rootPath, path);
  
  const stat = await Deno.stat(realPath);
  if (stat.isDirectory) {
    await Deno.remove(realPath, { recursive: true });
  } else {
    await Deno.remove(realPath);
  }
  
  return { success: true };
};

export const renameFile = async (c, {rootPath='/'}={}) => {
  const { oldPath, newPath } = await c.req.json();
  const realOldPath = join(rootPath, oldPath);
  const realNewPath = join(rootPath, newPath);
  
  await Deno.rename(realOldPath, realNewPath);
  
  return { success: true };
};

// Get file content
export const getFileContent = async (c, {rootPath='/'}={}) => {
  const path = c.req.query().path;
  const realPath = join(rootPath, path);
  
  const content = await Deno.readTextFile(realPath);
  return content;
};

// Update file content
export const updateFileContent = async (c, {rootPath='/'}={}) => {
  const { path, content } = await c.req.json();
  const realPath = join(rootPath, path);
  
  await Deno.writeTextFile(realPath, content);
  
  return { success: true };
};

// Handle file uploads
export const uploadFile = async (c, {rootPath='/'}={}) => {
  const formData = await c.req.formData();
  const uploadPath = formData.get('path') || '/';
  const files = formData.getAll('file');
  const realUploadPath = join(rootPath, uploadPath.toString());
  await ensureDir(realUploadPath);
  
  const results = [];
  for (const file of files) {
    if (!(file instanceof File)) continue;
    
    const fileName = file.name;
    const filePath = join(realUploadPath, fileName);
    // todo: check if file already exists?
    const fileArrayBuffer = await file.arrayBuffer();
    
    await Deno.writeFile(filePath, new Uint8Array(fileArrayBuffer));
    results.push({ name: fileName, size: file.size });
  }
  
  return { success: true, files: results };
};

// API-Objekt für objToRoutes
export const api = {
  list: list,
  post: createFile,
  delete: deleteFile,
  upload: { post: uploadFile },
  rename: { post: renameFile },
  content: {
    get: getFileContent,
    put: updateFileContent,
  }
};
import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth.ts";
import { getFiles, uploadFile, createFile, deleteFile, renameFile, getFileContent, updateFileContent, getFilesView } from "./controller.ts";

// Erstelle eine Factory-Funktion für die File-Routes
export function createFileRoutes(options = { rootPath: "/" }) {
  const filesRoutes = new Hono();
  
  // Entferne den globalen Auth-Middleware hier, da er bereits in der Parent-Route existiert
  // filesRoutes.use(authMiddleware);

  // View route
  filesRoutes.get("/", (c) => getFilesView(c, options));

  // API routes mit rootPath
  filesRoutes.get("/list", (c) => getFiles(c, options));
  filesRoutes.post("/upload", (c) => uploadFile(c, options));
  filesRoutes.post("/", (c) => createFile(c, options));
  filesRoutes.delete("/", (c) => deleteFile(c, options));
  filesRoutes.post("/rename", (c) => renameFile(c, options));
  filesRoutes.get("/content", (c) => getFileContent(c, options));
  filesRoutes.put("/content", (c) => updateFileContent(c, options));

  return filesRoutes;
}

// Exportiere Standard-Route für globalen Dateisystem-Zugriff
export default createFileRoutes();
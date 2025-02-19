import { logInfo, logError } from "../../utils/logger.ts";

interface Settings {
  siteName: string;
  theme: "light" | "dark";
  language: string;
  notifications: boolean;
}

let currentSettings: Settings = {
  siteName: "Nebula",
  theme: "light",
  language: "de",
  notifications: true
};

export const getSettings = (c) => {
  try {
    return c.json(currentSettings);
  } catch (err) {
    logError("Error in getSettings:", err);
    return c.text("Internal Server Error", 500);
  }
};

export const updateSettings = async (c) => {
  try {
    logInfo("updateSettings started");
    const updates = await c.req.json();
    currentSettings = { ...currentSettings, ...updates };
    logInfo("Settings updated:", currentSettings);
    return c.json(currentSettings);
  } catch (err) {
    logError("Error in updateSettings:", err);
    return c.text("Internal Server Error", 500);
  }
};
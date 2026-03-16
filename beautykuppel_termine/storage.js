import fs from "node:fs";
import path from "node:path";

export function getDataDir() {
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  return dataDir;
}

export function readJson(fileName, fallback) {
  const filePath = path.join(getDataDir(), fileName);
  try {
    const text = fs.readFileSync(filePath, "utf8");
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export function writeJson(fileName, data) {
  const filePath = path.join(getDataDir(), fileName);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}


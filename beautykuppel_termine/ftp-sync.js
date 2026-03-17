import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Client } from "basic-ftp";

function toPosixPath(p) {
  return p.split(path.sep).join("/");
}

function sha256File(filePath) {
  const h = crypto.createHash("sha256");
  const buf = fs.readFileSync(filePath);
  h.update(buf);
  return h.digest("hex");
}

function listFilesRecursive(rootDir) {
  const out = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(full);
    }
  }
  walk(rootDir);
  return out;
}

export function computeManifest(rootDir, { excludeRelPaths = [] } = {}) {
  const files = listFilesRecursive(rootDir);
  const manifest = {};
  const excluded = new Set((excludeRelPaths || []).map((p) => String(p)));
  for (const filePath of files) {
    const rel = toPosixPath(path.relative(rootDir, filePath));
    if (excluded.has(rel)) continue;
    manifest[rel] = sha256File(filePath);
  }
  return manifest;
}

function normalizeRemoteDir(dir) {
  if (!dir) return "/";
  const norm = String(dir).replace(/\\/g, "/").replace(/\/+$/, "");
  return norm || "/";
}

function joinRemote(base, rel) {
  if (!rel || rel === ".") return base;
  if (base === "/") return `/${rel}`;
  return `${base}/${rel}`;
}

export async function ftpUploadChanged({
  localDir,
  remoteDir,
  connection,
  previousManifest,
  excludeRelPaths = [],
  keepAliveMs = 0,
  forceAll = false,
}) {
  const nextManifest = computeManifest(localDir, { excludeRelPaths });
  const changed = forceAll
    ? Object.keys(nextManifest)
    : Object.entries(nextManifest)
        .filter(([rel, hash]) => previousManifest?.[rel] !== hash)
        .map(([rel]) => rel);

  if (!changed.length) return { uploaded: [], manifest: nextManifest };

  const client = new Client();
  if (keepAliveMs > 0) client.ftp.verbose = false;

  const ensuredDirs = new Set();
  const ensureRemoteDir = async (dirPath, baseDir) => {
    const norm = String(dirPath).replace(/\/+$/, "") || "/";
    if (ensuredDirs.has(norm)) return;
    ensuredDirs.add(norm);
    await client.ensureDir(norm);
    if (baseDir) await client.cd(baseDir);
  };

  try {
    await client.access({
      host: connection.host,
      port: connection.port || 21,
      user: connection.user,
      password: connection.password,
      secure: !!connection.secure,
    });

    const base = normalizeRemoteDir(remoteDir || "/");
    await ensureRemoteDir(base, base);
    await client.cd(base);

    for (const rel of changed) {
      const localPath = path.join(localDir, rel.split("/").join(path.sep));
      const remoteParent = path.posix.dirname(rel);
      const remoteDirAbs = joinRemote(base, remoteParent);
      if (remoteParent && remoteParent !== ".") await ensureRemoteDir(remoteDirAbs, base);
      const remotePath = joinRemote(base, rel);
      await client.uploadFrom(localPath, remotePath);
    }

    return { uploaded: changed, manifest: nextManifest };
  } finally {
    client.close();
  }
}

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyDir(srcDir, destDir) {
  ensureDir(destDir);
  fs.cpSync(srcDir, destDir, { recursive: true, force: true });
}

function copyFileIfMissing(src, dest) {
  if (!fs.existsSync(src)) return false;
  if (fs.existsSync(dest)) return false;
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  return true;
}

function copyDirFiles(srcDir, destDir, { overwrite = false } = {}) {
  if (!fs.existsSync(srcDir)) return 0;
  ensureDir(destDir);
  let count = 0;
  for (const file of fs.readdirSync(srcDir)) {
    const src = path.join(srcDir, file);
    const dst = path.join(destDir, file);
    if (!fs.statSync(src).isFile()) continue;
    if (!overwrite && fs.existsSync(dst)) continue;
    fs.copyFileSync(src, dst);
    count++;
  }
  return count;
}

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function writeText(filePath, text) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, text, "utf8");
}

function escapeXml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

export function buildAppointmentsJson(results) {
  const updatedAt = results?.updatedAt || new Date().toISOString();
  const entries = Array.isArray(results?.entries) ? results.entries : [];
  return {
    success: true,
    appointments: entries,
    lastUpdated: updatedAt,
  };
}

export function buildRssXml(appointmentsJson, settings) {
  const appointments = appointmentsJson?.appointments || [];
  const emptyStateText =
    settings?.signage2?.emptyText != null
      ? settings.signage2.emptyText
      : settings?.emptyStateText != null
        ? settings.emptyStateText
        : settings?.appSettings?.emptyStateText != null
          ? settings.appSettings.emptyStateText
          : "Aktuell sind keine freien Termine vorhanden.";

  let rss = `<?xml version=\"1.0\" encoding=\"UTF-8\" ?>\n` +
    `<rss version=\"2.0\" xmlns:atom=\"http://www.w3.org/2005/Atom\">\n` +
    `<channel>\n` +
    `  <title>Beautykuppel Therme - Freie Termine</title>\n` +
    `  <link>https://shop.beautykuppel-therme-badaibling.de/</link>\n` +
    `  <description>Aktuelle freie Wellness-Termine in Bad Aibling</description>\n` +
    `  <language>de-de</language>\n` +
    `  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>\n`;

  if (appointments.length === 0) {
    rss +=
      `\n  <item>\n` +
      `    <title>${escapeXml(emptyStateText)}</title>\n` +
      `    <link>https://shop.beautykuppel-therme-badaibling.de/</link>\n` +
      `    <guid isPermaLink=\"false\">empty-state</guid>\n` +
      `    <pubDate>${new Date().toUTCString()}</pubDate>\n` +
      `  </item>`;
  } else {
    rss +=
      `\n  <item>\n` +
      `    <title>Heutige freie Termine</title>\n` +
      `    <link>https://shop.beautykuppel-therme-badaibling.de/</link>\n` +
      `    <guid isPermaLink=\"false\">separator-start</guid>\n` +
      `    <pubDate>${new Date().toUTCString()}</pubDate>\n` +
      `  </item>`;

    appointments.forEach((app, index) => {
      const guid = crypto
        .createHash("sha1")
        .update(`${app.date}-${app.time}-${app.treatment}`)
        .digest("hex");
      const timeFormatted = String(app.time || "").replace(":", ".");
      const rawPrice = String(app.price || "").trim();
      const priceWithoutCurrency = rawPrice
        .replace(/\u00a0/g, " ")
        .replace(/[^0-9,.-]/g, "")
        .trim();
      const priceDisplay = priceWithoutCurrency
        ? `\u20ac ${priceWithoutCurrency}`
        : "";

      rss +=
        `\n  <item>\n` +
        `    <title>${escapeXml(`${app.treatment} um ${timeFormatted} Uhr${priceDisplay ? ` f\u00fcr ${priceDisplay}` : ""}`)}</title>\n` +
        `    <link>${escapeXml(String(app.bookingUrl || ""))}</link>\n` +
        `    <guid isPermaLink=\"false\">${guid}</guid>\n` +
        `    <pubDate>${new Date().toUTCString()}</pubDate>\n` +
        `  </item>`;

      if ((index + 1) % 3 === 0) {
        rss +=
          `\n  <item>\n` +
          `    <title>Heutige freie Termine</title>\n` +
          `    <link>https://shop.beautykuppel-therme-badaibling.de/</link>\n` +
          `    <guid isPermaLink=\"false\">separator-${Math.floor(index / 3)}</guid>\n` +
          `    <pubDate>${new Date().toUTCString()}</pubDate>\n` +
          `  </item>`;
      }
    });
  }

  rss += `\n</channel>\n</rss>\n`;
  return rss;
}

export function buildStaticOut({
  dataDir,
  staticSrcDir,
  outDir,
  results,
  configDir,
}) {
  ensureDir(outDir);

  // Copy static page assets
  copyDir(staticSrcDir, outDir);

  // Ensure settings files exist in out root; prefer /config (HA) then data/ then defaults.
  const defaultSettingsPath = path.join(staticSrcDir, "settings.json");
  const defaultFooterSettingsPath = path.join(staticSrcDir, "footer", "footer-settings.json");
  const userSettingsPath = path.join(dataDir, "settings.json");
  const userFooterSettingsPath = path.join(dataDir, "footer-settings.json");
  const userFooterSettingsNestedPath = path.join(dataDir, "footer", "footer-settings.json");
  const configBaseDir = configDir ? path.join(configDir, "beautykuppel_termine") : null;
  const configSettingsPath = configBaseDir ? path.join(configBaseDir, "settings.json") : null;
  const configFooterSettingsPath = configBaseDir ? path.join(configBaseDir, "footer-settings.json") : null;
  const configFooterSettingsNestedPath = configBaseDir ? path.join(configBaseDir, "footer", "footer-settings.json") : null;
  const configMediaDir = configBaseDir ? path.join(configBaseDir, "media") : null;
  const settingsPath = path.join(outDir, "settings.json");
  const footerSettingsPath = path.join(outDir, "footer", "footer-settings.json");
  const footerSettingsRootPath = path.join(outDir, "footer-settings.json");

  if (configBaseDir) {
    ensureDir(configBaseDir);
    if (configSettingsPath) copyFileIfMissing(defaultSettingsPath, configSettingsPath);
    if (configFooterSettingsPath) copyFileIfMissing(defaultFooterSettingsPath, configFooterSettingsPath);
    if (configFooterSettingsNestedPath) copyFileIfMissing(defaultFooterSettingsPath, configFooterSettingsNestedPath);
    if (configMediaDir) {
      ensureDir(configMediaDir);
      copyDirFiles(path.join(staticSrcDir, "media"), configMediaDir, { overwrite: false });
    }
  }

  const preferredSettingsPath =
    (configSettingsPath && fs.existsSync(configSettingsPath) && configSettingsPath) ||
    (fs.existsSync(userSettingsPath) && userSettingsPath) ||
    defaultSettingsPath;
  const preferredFooterSettingsPath =
    (configFooterSettingsPath && fs.existsSync(configFooterSettingsPath) && configFooterSettingsPath) ||
    (configFooterSettingsNestedPath && fs.existsSync(configFooterSettingsNestedPath) && configFooterSettingsNestedPath) ||
    (fs.existsSync(userFooterSettingsPath) && userFooterSettingsPath) ||
    (fs.existsSync(userFooterSettingsNestedPath) && userFooterSettingsNestedPath) ||
    defaultFooterSettingsPath;

  if (preferredSettingsPath) fs.copyFileSync(preferredSettingsPath, settingsPath);
  if (preferredFooterSettingsPath) {
    ensureDir(path.dirname(footerSettingsPath));
    fs.copyFileSync(preferredFooterSettingsPath, footerSettingsPath);
    fs.copyFileSync(preferredFooterSettingsPath, footerSettingsRootPath);
  }

  // Compatibility: also place settings + media into /signage2/
  const signage2Dir = path.join(outDir, "signage2");
  ensureDir(signage2Dir);
  if (fs.existsSync(settingsPath)) {
    fs.copyFileSync(settingsPath, path.join(signage2Dir, "settings.json"));
  }
  const mediaDir = path.join(outDir, "media");
  if (configMediaDir && fs.existsSync(configMediaDir)) {
    copyDir(configMediaDir, mediaDir);
  }
  if (fs.existsSync(mediaDir)) {
    const signage2MediaDir = path.join(signage2Dir, "media");
    copyDir(mediaDir, signage2MediaDir);
  }

  // Write appointments.json (old naming) and also results.json (new naming)
  const appointmentsJson = buildAppointmentsJson(results);
  writeJson(path.join(outDir, "appointments.json"), appointmentsJson);
  writeJson(path.join(outDir, "results.json"), results || { updatedAt: null, entries: [] });

  // Generate RSS from appointments + settings
  const settings = readJsonIfExists(settingsPath) || {};
  const rss = buildRssXml(appointmentsJson, settings);
  writeText(path.join(outDir, "rss.xml"), rss);

  return { outDir, appointmentsJson, settings, settingsSource: preferredSettingsPath, footerSettingsSource: preferredFooterSettingsPath, configBaseDir };
}

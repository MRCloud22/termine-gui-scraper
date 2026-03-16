import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyDir(srcDir, destDir) {
  ensureDir(destDir);
  fs.cpSync(srcDir, destDir, { recursive: true });
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
    settings?.signage2?.emptyText ||
    settings?.emptyStateText ||
    settings?.appSettings?.emptyStateText ||
    "Aktuell sind keine freien Termine vorhanden.";

  let rss = `<?xml version="1.0" encoding="UTF-8" ?>\n` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n` +
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
      `    <guid isPermaLink="false">empty-state</guid>\n` +
      `    <pubDate>${new Date().toUTCString()}</pubDate>\n` +
      `  </item>`;
  } else {
    rss +=
      `\n  <item>\n` +
      `    <title>Heutige freie Termine</title>\n` +
      `    <link>https://shop.beautykuppel-therme-badaibling.de/</link>\n` +
      `    <guid isPermaLink="false">separator-start</guid>\n` +
      `    <pubDate>${new Date().toUTCString()}</pubDate>\n` +
      `  </item>`;

    appointments.forEach((app, index) => {
      const guid = crypto
        .createHash("sha1")
        .update(`${app.date}-${app.time}-${app.treatment}`)
        .digest("hex");
      const timeFormatted = String(app.time || "").replace(":", ".");
      const priceFormatted = String(app.price || "").replace(/\.00\s*€?$/, "").replace(/€/, "").trim();
      const priceDisplay = priceFormatted ? `${priceFormatted} €` : "";

      rss +=
        `\n  <item>\n` +
        `    <title>${escapeXml(`${app.treatment} um ${timeFormatted} Uhr${priceDisplay ? ` fuer ${priceDisplay}` : ""}`)}</title>\n` +
        `    <link>${escapeXml(String(app.bookingUrl || ""))}</link>\n` +
        `    <guid isPermaLink="false">${guid}</guid>\n` +
        `    <pubDate>${new Date().toUTCString()}</pubDate>\n` +
        `  </item>`;

      if ((index + 1) % 3 === 0) {
        rss +=
          `\n  <item>\n` +
          `    <title>Heutige freie Termine</title>\n` +
          `    <link>https://shop.beautykuppel-therme-badaibling.de/</link>\n` +
          `    <guid isPermaLink="false">separator-${Math.floor(index / 3)}</guid>\n` +
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
}) {
  ensureDir(outDir);

  // Copy static page assets
  copyDir(staticSrcDir, outDir);

  // Ensure settings.json exists in out root; prefer user-edited data/settings.json if present.
  const userSettingsPath = path.join(dataDir, "settings.json");
  const settingsPath = path.join(outDir, "settings.json");
  if (fs.existsSync(userSettingsPath)) {
    fs.copyFileSync(userSettingsPath, settingsPath);
  } else if (!fs.existsSync(settingsPath)) {
    // static/settings.json is copied already; nothing to do
  }

  // Compatibility: also place settings + media into /signage2/
  const signage2Dir = path.join(outDir, "signage2");
  ensureDir(signage2Dir);
  if (fs.existsSync(settingsPath)) {
    fs.copyFileSync(settingsPath, path.join(signage2Dir, "settings.json"));
  }
  const mediaDir = path.join(outDir, "media");
  if (fs.existsSync(mediaDir)) {
    const signage2MediaDir = path.join(signage2Dir, "media");
    ensureDir(signage2MediaDir);
    for (const file of fs.readdirSync(mediaDir)) {
      const src = path.join(mediaDir, file);
      const dst = path.join(signage2MediaDir, file);
      if (fs.statSync(src).isFile()) fs.copyFileSync(src, dst);
    }
  }

  // Write appointments.json (old naming) and also results.json (new naming)
  const appointmentsJson = buildAppointmentsJson(results);
  writeJson(path.join(outDir, "appointments.json"), appointmentsJson);
  writeJson(path.join(outDir, "results.json"), results || { updatedAt: null, entries: [] });

  // Generate RSS from appointments + settings
  const settings = readJsonIfExists(settingsPath) || {};
  const rss = buildRssXml(appointmentsJson, settings);
  writeText(path.join(outDir, "rss.xml"), rss);

  return { outDir, appointmentsJson, settings };
}


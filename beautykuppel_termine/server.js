import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, writeJson } from "./storage.js";
import {
  buildBookingUrl,
  enumerateIsoDates,
  fetchAvailabilityPage,
  fetchAvailabilityForDay,
  fetchTreatmentsFromAllReservationCategories,
  formatDateDe,
  parseAvailabilitiesHtml,
  parseAvailabilityNextCursor,
} from "./scraper.js";
import { buildStaticOut } from "./static-site.js";
import { ftpUploadChanged } from "./ftp-sync.js";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_VERSION = (() => {
  try {
    const pkgPath = path.join(process.cwd(), "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    return pkg?.version || "unknown";
  } catch {
    return "unknown";
  }
})();

const PORT = Number(process.env.PORT || 8099);
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), "data");
const CONFIG_DIR = process.env.CONFIG_DIR ? path.resolve(process.env.CONFIG_DIR) : "/config";
const STATIC_SRC_DIR = path.join(process.cwd(), "static");
const STATIC_OUT_DIR = path.join(DATA_DIR, "out");

function formatLogTimestamp(date = new Date()) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${dd}-${mm}-${yyyy} ${hh}:${mi}:${ss}`;
}

function log(...args) {
  console.log(formatLogTimestamp(), ...args);
}

function resolveConfigDir() {
  try {
    return fs.existsSync(CONFIG_DIR) ? CONFIG_DIR : null;
  } catch {
    return null;
  }
}

function resolveConfigBaseDir() {
  const cfgDir = resolveConfigDir();
  return cfgDir ? path.join(cfgDir, "beautykuppel_termine") : null;
}

function resolvePreferredSettingsPath() {
  const configBaseDir = resolveConfigBaseDir();
  const configSettingsPath = configBaseDir ? path.join(configBaseDir, "settings.json") : null;
  const outSettingsPath = path.join(STATIC_OUT_DIR, "settings.json");
  const defaultSettingsPath = path.join(STATIC_SRC_DIR, "settings.json");
  if (configSettingsPath && fs.existsSync(configSettingsPath)) return configSettingsPath;
  if (fs.existsSync(outSettingsPath)) return outSettingsPath;
  return defaultSettingsPath;
}

function resolvePreferredMediaDir() {
  const configBaseDir = resolveConfigBaseDir();
  const configMediaDir = configBaseDir ? path.join(configBaseDir, "media") : null;
  if (configMediaDir && fs.existsSync(configMediaDir)) return configMediaDir;
  return path.join(STATIC_OUT_DIR, "media");
}


const app = express();
app.use(express.json({ limit: "1mb" }));

const CONFIG_FILE = "config.json";
const RESULTS_FILE = "results.json";
const STATUS_FILE = "status.json";

function defaultConfig() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const start = `${yyyy}-${mm}-${dd}`;
  const endIso = start;
  const startDateTime = `${start}T00:00`;
  const endDateTime = `${start}T23:59`;

  return {
    startDate: start,
    endDate: endIso,
    startDateTime,
    endDateTime,
    useTodayWindow: true,
    refreshMinutes: 5,
    templateIds: [],
    treatmentRules: {},
    staticExport: {
      enabled: true,
    },
    ftp: {
      enabled: false,
      host: "",
      port: 21,
      user: "",
      password: "",
      secure: false,
      remotePath: "/"
    },
  };
}

let treatmentsCache = null;
let categoriesCache = null;
let timer = null;
let runInProgress = false;
let publishInProgress = false;
let forceFullUploadOnce = true;
let ftpRetryTimer = null;
const FTP_RETRY_DELAY_MS = 30 * 1000;

function isFtpTimeoutError(msg) {
  const text = String(msg || "");
  return /timeout/i.test(text) && (/control socket/i.test(text) || /ftp/i.test(text));
}

function scheduleFtpRetry(cfg) {
  if (ftpRetryTimer) {
    log("FTP retry is already scheduled; skipping duplicate schedule");
    return;
  }
  const delaySec = Math.round(FTP_RETRY_DELAY_MS / 1000);
  log(`FTP timeout detected; scheduling retry in ${delaySec}s`);
  ftpRetryTimer = setTimeout(() => {
    ftpRetryTimer = null;
    const latestCfg = cfg || readConfig();
    log("FTP retry starting after timeout");
    publishStaticAndMaybeFtp(latestCfg).catch((err) => {
      const retryMsg = err?.message || String(err);
      log("FTP retry failed:", retryMsg);
    });
  }, FTP_RETRY_DELAY_MS);
}


function readHaOptions() {
  const optionsPath = path.join(DATA_DIR, "options.json");
  try {
    const text = fs.readFileSync(optionsPath, "utf8");
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function applyHaOptions(cfg, options, ctx = {}) {
  if (!options || typeof options !== "object") return cfg;

  const next = { ...cfg };
  const hasCfg = !!ctx.hasCfg;
  const override = options.overrideConfig === true || !hasCfg;

  if (override) {
    if (typeof options.refreshMinutes === "number") next.refreshMinutes = options.refreshMinutes;
    if (typeof options.useTodayWindow === "boolean") next.useTodayWindow = options.useTodayWindow;
    if (typeof options.startDateTime === "string" && options.startDateTime) next.startDateTime = options.startDateTime;
    if (typeof options.endDateTime === "string" && options.endDateTime) next.endDateTime = options.endDateTime;
  }

  if (typeof options.staticExportEnabled === "boolean") {
    next.staticExport = { ...(next.staticExport || {}), enabled: options.staticExportEnabled };
  }

  if (typeof options.ftpEnabled === "boolean") next.ftp = { ...(next.ftp || {}), enabled: options.ftpEnabled };
  if (typeof options.ftpHost === "string") next.ftp = { ...(next.ftp || {}), host: options.ftpHost };
  if (typeof options.ftpPort === "number") next.ftp = { ...(next.ftp || {}), port: options.ftpPort };
  if (typeof options.ftpUser === "string") next.ftp = { ...(next.ftp || {}), user: options.ftpUser };
  if (typeof options.ftpPassword === "string") next.ftp = { ...(next.ftp || {}), password: options.ftpPassword };
  if (typeof options.ftpSecure === "boolean") next.ftp = { ...(next.ftp || {}), secure: options.ftpSecure };
  if (typeof options.ftpRemotePath === "string") next.ftp = { ...(next.ftp || {}), remotePath: options.ftpRemotePath };

  return next;
}

function readConfig() {
  const defaults = defaultConfig();
  const cfg = readJson(CONFIG_FILE, null);
  const hasCfg = cfg && typeof cfg === "object";
  const merged = { ...defaults, ...(hasCfg ? cfg : {}) };
  return applyHaOptions(merged, readHaOptions(), { hasCfg });
}

function writeConfig(cfg) {
  writeJson(CONFIG_FILE, cfg);
}

function readStatus() {
  const defaults = {
    lastRunAt: null,
    nextRunAt: null,
    lastError: null,
    timerActive: false,
    running: false,
    runStartedAt: null,
    lastPublishAt: null,
    lastPublishError: null,
    lastFtpUploadAt: null,
    lastFtpUploadError: null,
    lastFtpUploadedCount: null,
  };
  const st = readJson(STATUS_FILE, defaults);
  return { ...defaults, ...(st && typeof st === "object" ? st : {}) };
}

function writeStatus(patch) {
  const cur = readStatus();
  writeJson(STATUS_FILE, { ...cur, ...patch });
}

function writeResults(entries) {
  writeJson(RESULTS_FILE, { updatedAt: new Date().toISOString(), entries });
}

function readResults() {
  return readJson(RESULTS_FILE, { updatedAt: null, entries: [] });
}

function readFtpManifest() {
  return readJson("ftp-manifest.json", {});
}

function writeFtpManifest(manifest) {
  writeJson("ftp-manifest.json", manifest || {});
}

async function publishStaticAndMaybeFtp(cfg) {
  if (publishInProgress) return;
  publishInProgress = true;
  try {
    if (ftpRetryTimer) {
      clearTimeout(ftpRetryTimer);
      ftpRetryTimer = null;
      log("Cleared pending FTP retry because publish started");
    }

    const results = readResults();
    const staticEnabled = !(cfg && cfg.staticExport && cfg.staticExport.enabled === false);
    if (!staticEnabled) return;

    // Build static output to DATA_DIR/out
    const built = buildStaticOut({
      dataDir: DATA_DIR,
      staticSrcDir: STATIC_SRC_DIR,
      outDir: STATIC_OUT_DIR,
      results,
      configDir: resolveConfigDir(),
    });
    if (built && built.settingsSource) log("Settings source:", built.settingsSource);
    if (built && built.configBaseDir) log("Config base dir:", built.configBaseDir);

    writeStatus({ lastPublishAt: new Date().toISOString(), lastPublishError: null });

    // Optional FTP delta upload
    const ftpCfg = cfg && cfg.ftp ? cfg.ftp : {};
    if (!ftpCfg.enabled) return;
    if (!ftpCfg.host) throw new Error("FTP enabled but ftp.host is empty");
    if (!ftpCfg.user) throw new Error("FTP enabled but ftp.user is empty");
    log("FTP base remote dir:", ftpCfg.remotePath || "/");
    log("FTP excluded files:", "results.json");

    const prev = readFtpManifest();
    const forceAll = forceFullUploadOnce === true;
    if (forceAll) {
      log("FTP upload: full sync on startup");
    }
    const { uploaded, manifest } = await ftpUploadChanged({
      localDir: built.outDir,
      remoteDir: ftpCfg.remotePath || "/",
      connection: {
        host: ftpCfg.host,
        port: ftpCfg.port || 21,
        user: ftpCfg.user,
        password: ftpCfg.password || "",
        secure: !!ftpCfg.secure,
      },
      previousManifest: prev,
      excludeRelPaths: ["results.json"],
      forceAll,
    });
    log("FTP manifest entries:", Object.keys(manifest || {}).length);
    if (uploaded.length) {
      log("FTP uploaded " + uploaded.length + " file(s):");
      for (const file of uploaded) log("FTP uploaded", file);
    } else {
      log("FTP upload: no changes");
    }
    forceFullUploadOnce = false;
    writeFtpManifest(manifest);
    writeStatus({
      lastFtpUploadAt: new Date().toISOString(),
      lastFtpUploadError: null,
      lastFtpUploadedCount: uploaded.length,
    });
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    writeStatus({ lastPublishError: msg, lastFtpUploadError: msg });
    log("Publish/FTP error:", msg);
    if (isFtpTimeoutError(msg)) scheduleFtpRetry(cfg);
  } finally {
    publishInProgress = false;
  }
}

async function getTreatments(force = false) {
  if (treatmentsCache && categoriesCache && !force) return { treatments: treatmentsCache, categories: categoriesCache };
  const throttleMs = Number(process.env.CATALOG_THROTTLE_MS || 150);
  const catalog = await fetchTreatmentsFromAllReservationCategories({ throttleMs });
  treatmentsCache = catalog.treatments;
  categoriesCache = catalog.categories;
  return { treatments: treatmentsCache, categories: categoriesCache };
}

function defaultRule() {
  return { enabled: true, maxResults: 2, minGapMinutes: 0 };
}

function normalizeRule(raw) {
  const enabled = raw?.enabled !== false;
  const maxResults = Math.max(0, Number(raw?.maxResults ?? 2) || 0);
  const minGapMinutes = Math.max(0, Number(raw?.minGapMinutes ?? 0) || 0);
  return { enabled, maxResults, minGapMinutes };
}

function getEnabledTemplateIdsAndRules(cfg) {
  // Backward compatibility: if templateIds exists but treatmentRules doesn't, synthesize it.
  const rules = typeof cfg.treatmentRules === "object" && cfg.treatmentRules ? cfg.treatmentRules : {};
  const legacyIds = Array.isArray(cfg.templateIds) ? cfg.templateIds.map(Number).filter(Number.isFinite) : [];

  const out = new Map();
  for (const id of legacyIds) {
    out.set(id, normalizeRule(rules[String(id)] || defaultRule()));
  }

  for (const [key, rawRule] of Object.entries(rules)) {
    const id = Number(key);
    if (!Number.isFinite(id)) continue;
    const rule = normalizeRule(rawRule);
    if (!rule.enabled) continue;
    out.set(id, rule);
  }

  // Only keep enabled rules with maxResults > 0
  for (const [id, rule] of out.entries()) {
    if (!rule.enabled || rule.maxResults <= 0) out.delete(id);
  }

  return out;
}

function isoTimeToEpochMs(isoDate, time) {
  const t = String(time || "").trim();
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = m[1].padStart(2, "0");
  const mm = m[2];
  const d = new Date(`${isoDate}T${hh}:${mm}:00`);
  const ts = d.getTime();
  return Number.isFinite(ts) ? ts : null;
}

function parseDateTimeLocal(value) {
  // expects "YYYY-MM-DDTHH:MM" (from <input type="datetime-local">)
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  const ts = Date.parse(v);
  return Number.isFinite(ts) ? ts : null;
}

function datePartFromDateTimeLocal(value) {
  if (typeof value !== "string") return null;
  const m = value.match(/^(\d{4}-\d{2}-\d{2})T/);
  return m ? m[1] : null;
}

async function runQueryOnce() {
  if (runInProgress) {
    log("Scrape skipped: previous run is still active");
    return;
  }
  runInProgress = true;
  const runStartMs = Date.now();
  const cfg = readConfig();
  const enabled = getEnabledTemplateIdsAndRules(cfg);
  if (!enabled.size) {
    writeResults([]);
    writeStatus({
      lastRunAt: new Date().toISOString(),
      lastError: null,
      running: false,
      runStartedAt: null,
    });
    log("Scrape run finished: no enabled treatments, results cleared");
    runInProgress = false;
    return;
  }

  let totalAvailabilityRequests = 0;
  let totalSlotsParsed = 0;
  let templatesWithHits = 0;

  try {
    writeStatus({ running: true, runStartedAt: new Date().toISOString(), lastError: null });

    const { treatments } = await getTreatments(false);
    const byId = new Map(treatments.map((t) => [t.templateId, t]));
    const useToday = cfg.useTodayWindow === true;
    let startDt = cfg.startDateTime || `${cfg.startDate}T00:00`;
    let endDt = cfg.endDateTime || `${cfg.endDate}T23:59`;
    if (useToday) {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const iso = `${yyyy}-${mm}-${dd}`;
      startDt = `${iso}T00:00`;
      endDt = `${iso}T23:59`;
    }
    const startTs = parseDateTimeLocal(startDt);
    const endTs = parseDateTimeLocal(endDt);
    const startDate = datePartFromDateTimeLocal(startDt) || cfg.startDate;
    const endDate = datePartFromDateTimeLocal(endDt) || cfg.endDate;
    const isoDates = enumerateIsoDates(startDate, endDate);
    const throttleMs = Math.max(0, Number(process.env.AVAILABILITY_THROTTLE_MS || 150) || 0);
    log(
      `Scrape run started: templates=${enabled.size}, dates=${isoDates.length}, range=${startDt}..${endDt}, throttleMs=${throttleMs}`,
    );

    const out = [];
    for (const [templateId, rule] of enabled.entries()) {
      const tInfo = byId.get(templateId) || { name: `Template ${templateId}`, imageUrl: "" };
      const selected = [];
      let lastSelectedTs = null;
      let templateRequests = 0;
      let templateSlotsParsed = 0;
      const maxPageRequestsPerDay = Math.max(
        1,
        Number(process.env.AVAILABILITY_MAX_PAGES_PER_DAY || 120) || 120,
      );

      for (const iso of isoDates) {
        const seenSlotTs = new Set();
        let nextCursor = null;
        let dayRequests = 0;

        while (dayRequests < maxPageRequestsPerDay) {
          const html = await fetchAvailabilityPage(templateId, iso, nextCursor);
          dayRequests += 1;
          templateRequests += 1;
          totalAvailabilityRequests += 1;

          const slots = parseAvailabilitiesHtml(html);
          templateSlotsParsed += slots.length;
          totalSlotsParsed += slots.length;

          for (const s of slots) {
            if (selected.length >= rule.maxResults) break;

            const slotTs = isoTimeToEpochMs(iso, s.time);
            if (slotTs == null) continue;
            if (seenSlotTs.has(slotTs)) continue;
            seenSlotTs.add(slotTs);

            if (startTs != null && slotTs < startTs) continue;
            if (endTs != null && slotTs > endTs) break;

            if (lastSelectedTs != null && rule.minGapMinutes > 0) {
              const minGapMs = rule.minGapMinutes * 60 * 1000;
              if (slotTs - lastSelectedTs < minGapMs) continue;
            }

            lastSelectedTs = slotTs;
            selected.push({
              __sortKey: slotTs,
              date: formatDateDe(iso),
              time: s.time,
              treatment: s.treatmentName || tInfo.name,
              price: s.price || "",
              originalPrice: s.originalPrice,
              bookingUrl: buildBookingUrl(templateId, iso, s.time),
              imageUrl: tInfo.imageUrl || "",
            });
          }

          if (selected.length >= rule.maxResults) break;

          // Nothing in first response for that day -> stop immediately.
          if (dayRequests === 1 && slots.length === 0) break;

          const nextFrom = parseAvailabilityNextCursor(html);
          if (!nextFrom || nextFrom === nextCursor) break;
          nextCursor = nextFrom;

          if (throttleMs > 0) {
            // eslint-disable-next-line no-await-in-loop
            await new Promise((r) => setTimeout(r, throttleMs));
          }
        }

        if (selected.length >= rule.maxResults) break;
      }

      if (selected.length > 0) templatesWithHits += 1;
      log(
        `Scrape template ${templateId} (${tInfo.name}): requests=${templateRequests}, slots=${templateSlotsParsed}, hits=${selected.length}, maxResults=${rule.maxResults}, minGapMinutes=${rule.minGapMinutes}`,
      );
      out.push(...selected);
    }

    out.sort((a, b) => {
      const aKey = Number.isFinite(a.__sortKey) ? a.__sortKey : Number.NaN;
      const bKey = Number.isFinite(b.__sortKey) ? b.__sortKey : Number.NaN;
      if (Number.isFinite(aKey) && Number.isFinite(bKey) && aKey !== bKey) return aKey - bKey;
      return String(a.treatment || "").localeCompare(String(b.treatment || ""), "de");
    });

    for (const e of out) delete e.__sortKey;
    const uniqueTreatments = new Set(
      out.map((entry) => String(entry.treatment || "").trim()).filter(Boolean),
    ).size;
    const durationSec = ((Date.now() - runStartMs) / 1000).toFixed(1);
    log(
      `Scrape run finished: requests=${totalAvailabilityRequests}, slots=${totalSlotsParsed}, appointments=${out.length}, treatmentsWithSlots=${uniqueTreatments}, templatesWithHits=${templatesWithHits}, durationSec=${durationSec}`,
    );
    writeResults(out);
    writeStatus({ lastRunAt: new Date().toISOString(), lastError: null, running: false, runStartedAt: null });
    // Build static files and optionally upload them (e.g. appointments.json, rss.xml, /list, /signage2)
    await publishStaticAndMaybeFtp(cfg);
  } catch (e) {
    const msg = e?.message || String(e);
    log("Scrape run error:", msg);
    writeStatus({ lastRunAt: new Date().toISOString(), lastError: msg, running: false, runStartedAt: null });
    throw e;
  } finally {
    runInProgress = false;
    writeStatus({ running: false, runStartedAt: null });
  }
}

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
  writeStatus({ timerActive: false, nextRunAt: null });
}

function startTimerFromConfig() {
  stopTimer();
  const cfg = readConfig();
  const minutes = Number(cfg.refreshMinutes) || 0;
  if (!minutes || minutes < 1) return;

  const ms = minutes * 60 * 1000;
  const computeNext = () => new Date(Date.now() + ms).toISOString();
  writeStatus({ timerActive: true, nextRunAt: computeNext() });
  timer = setInterval(async () => {
    try {
      writeStatus({ nextRunAt: computeNext() });
      await runQueryOnce();
    } catch (e) {
      writeStatus({ lastRunAt: new Date().toISOString(), lastError: e?.message || String(e) });
    }
  }, ms);
}

// Serve dynamic settings/media first so signage changes in /config are visible immediately.
app.get("/settings.json", (req, res) => {
  res.type("application/json").sendFile(resolvePreferredSettingsPath());
});
app.get("/signage2/settings.json", (req, res) => {
  res.type("application/json").sendFile(resolvePreferredSettingsPath());
});
app.use("/media", express.static(resolvePreferredMediaDir()));
app.use("/media", express.static(path.join(STATIC_OUT_DIR, "media")));
app.use("/signage2/media", express.static(resolvePreferredMediaDir()));
app.use("/signage2/media", express.static(path.join(STATIC_OUT_DIR, "media")));

// Serve generated static pages (also useful for local preview)
app.use("/list", express.static(path.join(STATIC_OUT_DIR, "list")));
app.use("/signage2", express.static(path.join(STATIC_OUT_DIR, "signage2")));
app.use(express.static(STATIC_OUT_DIR));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "ui.html"));
});

app.get("/ui.css", (req, res) => {
  res.type("text/css").sendFile(path.join(__dirname, "ui.css"));
});

app.get("/ui.js", (req, res) => {
  res.type("application/javascript").sendFile(path.join(__dirname, "ui.js"));
});

app.get("/api/config", (req, res) => {
  res.json(readConfig());
});

app.post("/api/config", (req, res) => {
  const prev = readConfig();
  const body = req.body || {};
  const useTodayWindow =
    typeof body.useTodayWindow === "boolean" ? body.useTodayWindow : prev.useTodayWindow || false;
  const startDateTime =
    typeof body.startDateTime === "string"
      ? body.startDateTime
      : prev.startDateTime || `${prev.startDate}T00:00`;
  const endDateTime =
    typeof body.endDateTime === "string"
      ? body.endDateTime
      : prev.endDateTime || `${prev.endDate}T23:59`;

  // minimal sanity: if range is inverted, swap
  const startTs = parseDateTimeLocal(startDateTime);
  const endTs = parseDateTimeLocal(endDateTime);
  const fixedStartDateTime =
    startTs != null && endTs != null && startTs > endTs ? endDateTime : startDateTime;
  const fixedEndDateTime =
    startTs != null && endTs != null && startTs > endTs ? startDateTime : endDateTime;

  // Keep legacy startDate/endDate in sync (date-part only).
  const startDate =
    datePartFromDateTimeLocal(fixedStartDateTime) || prev.startDate;
  const endDate =
    datePartFromDateTimeLocal(fixedEndDateTime) || prev.endDate;

  const cfg = {
    startDate,
    endDate,
    startDateTime: fixedStartDateTime,
    endDateTime: fixedEndDateTime,
    useTodayWindow,
    refreshMinutes: Number(body.refreshMinutes) || prev.refreshMinutes,
    templateIds: Array.isArray(body.templateIds) ? body.templateIds.map(Number) : prev.templateIds,
    treatmentRules:
      typeof body.treatmentRules === "object" && body.treatmentRules
        ? body.treatmentRules
        : prev.treatmentRules || {},
    staticExport:
      typeof body.staticExport === "object" && body.staticExport
        ? { ...prev.staticExport, ...body.staticExport }
        : prev.staticExport || { enabled: true },
    ftp:
      typeof body.ftp === "object" && body.ftp
        ? { ...prev.ftp, ...body.ftp }
        : prev.ftp || { enabled: false },
  };
  writeConfig(cfg);
  startTimerFromConfig();
  res.json({ ok: true });
});

app.get("/api/treatments", async (req, res) => {
  try {
    const force = String(req.query.force || "") === "1";
    const catalog = await getTreatments(force);
    res.json(catalog);
  } catch (e) {
    res.status(500).send(e?.message || String(e));
  }
});

app.get("/api/results", (req, res) => {
  res.json(readResults());
});

app.get("/api/status", (req, res) => {
  res.json({ ...readStatus(), appVersion: APP_VERSION });
});

app.get("/api/diagnostics", async (req, res) => {
  try {
    const cfg = readConfig();
    const enabled = getEnabledTemplateIdsAndRules(cfg);
    const queryId = Number(req.query.templateId);
    const templateId = Number.isFinite(queryId) && queryId > 0 ? queryId : Array.from(enabled.keys())[0];
    if (!templateId) {
      res.status(400).json({ error: "no templateId enabled" });
      return;
    }
    const dateParam = typeof req.query.date === "string" ? req.query.date : "";
    const isoDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : new Date().toISOString().slice(0, 10);
    const html = await fetchAvailabilityForDay(templateId, isoDate);
    const slots = parseAvailabilitiesHtml(html);
    res.json({
      templateId,
      isoDate,
      htmlLength: html.length,
      slotCount: slots.length,
      sample: slots.slice(0, 5),
    });
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

app.post("/api/run", async (req, res) => {
  try {
    await runQueryOnce();
    const cfg = readConfig();
    if ((cfg.refreshMinutes || 0) >= 1) startTimerFromConfig();
    res.json({ ok: true });
  } catch (e) {
    writeStatus({ lastRunAt: new Date().toISOString(), lastError: e?.message || String(e) });
    res.status(500).send(e?.message || String(e));
  }
});

app.post("/api/stop", (req, res) => {
  stopTimer();
  res.json({ ok: true });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  log(`Beautykuppel Termine running on http://localhost:${PORT}`);
  // Start one scrape immediately on app startup, then continue with configured interval.
  runQueryOnce()
    .catch((e) => {
      const msg = e?.message || String(e);
      log("Startup scrape failed:", msg);
      // ensure static pages exist even when startup scrape fails
      return publishStaticAndMaybeFtp(readConfig()).catch(() => {});
    })
    .finally(() => {
      // restore timer on restart
      startTimerFromConfig();
    });
});

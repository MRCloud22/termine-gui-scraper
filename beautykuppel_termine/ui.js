const $ = (id) => document.getElementById(id);

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toDatetimeLocalValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

function todayWindow() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 0, 0);
  return { start, end };
}

function normalizeDailyTime(value) {
  if (typeof value !== "string") return "";
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "";
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return "";
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function setAbfrageMode(enabled) {
  useTodayWindow = !!enabled;
  const startEl = $("startDateTime");
  const endEl = $("endDateTime");
  $("useTodayWindow").checked = useTodayWindow;

  if (useTodayWindow) {
    const w = todayWindow();
    startEl.value = toDatetimeLocalValue(w.start);
    endEl.value = toDatetimeLocalValue(w.end);
    startEl.disabled = true;
    endEl.disabled = true;
  } else {
    startEl.disabled = false;
    endEl.disabled = false;
  }
}

function addDaysIso(iso, days) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function api(path, options) {
  const res = await fetch(path, options);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${text ? `: ${text}` : ""}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

let treatmentsCache = [];
let categoriesCache = [];
let selectedTemplateIds = new Set();
let rulesByTemplateId = new Map();
let selectedCategoryId = "all";
let showSelectedOnly = false;
let useTodayWindow = true;

function defaultRule() {
  return { enabled: true, maxResults: 2, minGapMinutes: 60 };
}

function normalizeRule(rule) {
  const enabled = rule?.enabled !== false;
  const maxResults = Math.max(0, Number(rule?.maxResults ?? 2) || 0);
  const minGapMinutes = Math.max(0, Number(rule?.minGapMinutes ?? 60) || 0);
  return { enabled, maxResults, minGapMinutes };
}

function formatCategoryChip(t) {
  const cats = Array.isArray(t.categories) ? t.categories : [];
  if (!cats.length) return "";
  const first = cats[0]?.name || "";
  if (!first) return "";
  if (cats.length === 1) return first;
  return `${first} +${cats.length - 1}`;
}

function renderTreatments(list, filter = "") {
  const q = filter.trim().toLowerCase();
  const catFiltered =
    selectedCategoryId === "all"
      ? list
      : list.filter((t) =>
          (t.categories || []).some((c) => String(c.categoryId) === String(selectedCategoryId)),
        );
  const selectedOnlyFiltered = showSelectedOnly
    ? catFiltered.filter((t) => {
        const rule = normalizeRule(
          rulesByTemplateId.get(t.templateId) || { enabled: selectedTemplateIds.has(t.templateId) },
        );
        return rule.enabled && rule.maxResults > 0;
      })
    : catFiltered;
  const filtered = q
    ? selectedOnlyFiltered.filter(
        (t) => t.name.toLowerCase().includes(q) || String(t.templateId).includes(q),
      )
    : selectedOnlyFiltered;

  if (!filtered.length) {
    $("treatments").innerHTML = '<div class="meta">Keine Treffer.</div>';
    return;
  }

  $("treatments").innerHTML = filtered
    .map((t) => {
      const rule = normalizeRule(rulesByTemplateId.get(t.templateId) || { enabled: selectedTemplateIds.has(t.templateId) });
      const checked = rule.enabled ? "checked" : "";
      const categoryChip = formatCategoryChip(t);
      return `
        <div class="treatment">
          <div class="treatment__top">
            <img src="${escapeHtml(t.imageUrl || "")}" alt="" />
            <div>
              <div class="treatment__name">${escapeHtml(t.name)}</div>
              <div class="treatment__meta">
                <span class="chip">ID ${escapeHtml(t.templateId)}</span>
                <span class="chip">${escapeHtml(t.durationMinutes ? `${t.durationMinutes} Min` : "")}</span>
                <span class="chip">${escapeHtml(t.price || "")}</span>
                ${categoryChip ? `<span class="chip">${escapeHtml(categoryChip)}</span>` : ""}
              </div>
            </div>
          </div>
          <div class="treatment__pick">
            <label class="chip">
              <input type="checkbox" data-template-id="${escapeHtml(t.templateId)}" ${checked}/>
              nutzen
            </label>
            <a class="link" href="${escapeHtml(t.templateUrl)}" target="_blank" rel="noreferrer">Shop</a>
          </div>
          <div class="treatment__rules">
            <label>
              Max. Termine
              <input type="number" min="0" step="1" value="${escapeHtml(rule.maxResults)}" data-rule="maxResults" data-template-id="${escapeHtml(t.templateId)}" />
            </label>
            <label>
              Abstand (Min.)
              <input type="number" min="0" step="5" value="${escapeHtml(rule.minGapMinutes)}" data-rule="minGapMinutes" data-template-id="${escapeHtml(t.templateId)}" />
            </label>
          </div>
        </div>
      `;
    })
    .join("");

  $("treatments")
    .querySelectorAll("input[type=checkbox][data-template-id]")
    .forEach((el) => {
      el.addEventListener("change", (e) => {
        const id = Number(e.target.getAttribute("data-template-id"));
        const cur = normalizeRule(rulesByTemplateId.get(id) || defaultRule());
        cur.enabled = !!e.target.checked;
        rulesByTemplateId.set(id, cur);
        if (cur.enabled) selectedTemplateIds.add(id);
        else selectedTemplateIds.delete(id);
      });
    });

  $("treatments")
    .querySelectorAll("input[type=number][data-rule][data-template-id]")
    .forEach((el) => {
      el.addEventListener("input", (e) => {
        const id = Number(e.target.getAttribute("data-template-id"));
        const ruleKey = e.target.getAttribute("data-rule");
        const cur = normalizeRule(rulesByTemplateId.get(id) || defaultRule());
        if (ruleKey === "maxResults") cur.maxResults = Math.max(0, Number(e.target.value) || 0);
        if (ruleKey === "minGapMinutes") cur.minGapMinutes = Math.max(0, Number(e.target.value) || 0);
        rulesByTemplateId.set(id, cur);
      });
    });
}

function renderResults(entries) {
  if (!entries || !entries.length) {
    $("results").innerHTML =
      '<div class="meta" style="padding:12px">Keine Termine gefunden (oder noch nicht abgefragt).</div>';
    return;
  }

  $("results").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Datum</th>
          <th>Zeit</th>
          <th>Behandlung</th>
          <th>Preis</th>
          <th>Buchen</th>
        </tr>
      </thead>
      <tbody>
        ${entries
          .map((e) => {
            return `
              <tr>
                <td>${escapeHtml(e.date)}</td>
                <td>${escapeHtml(e.time)}</td>
                <td>${escapeHtml(e.treatment)}</td>
                <td>${escapeHtml(e.price)}</td>
                <td><a class="link" href="${escapeHtml(e.bookingUrl)}" target="_blank" rel="noreferrer">Link</a></td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

async function loadStatus() {
  const st = await api("/api/status");
  const last = st.lastRunAt ? new Date(st.lastRunAt).toLocaleString("de-DE") : "nie";
  const next = st.nextRunAt ? new Date(st.nextRunAt).toLocaleString("de-DE") : "-";
  const running = st.timerActive ? "aktiv" : "stopp";
  const nowRunning = st.running ? "RUNNING" : "idle";
  const version = st.appVersion ? ` | v${st.appVersion}` : "";
  $("statusLine").textContent = `Status: ${running} | ${nowRunning} | last: ${last} | next: ${next}${st.lastError ? ` | error: ${st.lastError}` : ""}${version}`;
}

async function loadConfig() {
  const cfg = await api("/api/config");
  if (typeof cfg.useTodayWindow === "boolean") useTodayWindow = cfg.useTodayWindow;
  else useTodayWindow = !(cfg.startDateTime && cfg.endDateTime);
  $("useTodayWindow").checked = useTodayWindow;
  if (useTodayWindow) {
    setAbfrageMode(true);
  } else {
    if (cfg.startDateTime) $("startDateTime").value = cfg.startDateTime;
    if (cfg.endDateTime) $("endDateTime").value = cfg.endDateTime;
    setAbfrageMode(false);
  }
  if (cfg.refreshMinutes) $("refreshMinutes").value = cfg.refreshMinutes;
  $("minLeadMinutes").value = Math.max(0, Number(cfg.minLeadMinutes) || 0);
  $("autoPauseFrom").value = normalizeDailyTime(cfg.autoPauseFrom);
  $("autoPauseTo").value = normalizeDailyTime(cfg.autoPauseTo);
  selectedTemplateIds = new Set((cfg.templateIds || []).map(Number));
  rulesByTemplateId = new Map();
  if (cfg.treatmentRules && typeof cfg.treatmentRules === "object") {
    for (const [k, v] of Object.entries(cfg.treatmentRules)) {
      const id = Number(k);
      if (!Number.isFinite(id)) continue;
      const rule = normalizeRule(v);
      rulesByTemplateId.set(id, rule);
      if (rule.enabled) selectedTemplateIds.add(id);
    }
  }

  // Backward compat: ensure every selected template has a rule object so it gets persisted on save.
  for (const id of selectedTemplateIds) {
    if (!rulesByTemplateId.has(id)) rulesByTemplateId.set(id, defaultRule());
  }
}

async function loadTreatments(force = false) {
  const catalog = await api(`/api/treatments${force ? "?force=1" : ""}`);
  categoriesCache = catalog.categories || [];
  treatmentsCache = catalog.treatments || [];
  renderCategoryFilter(categoriesCache);
  renderTreatments(treatmentsCache, $("treatmentFilter").value);
}

function renderCategoryFilter(categories) {
  const sel = $("categoryFilter");
  const prev = sel.value || "all";
  const options = [{ categoryId: "all", name: "Alle Kategorien" }, ...categories];
  sel.innerHTML = options
    .map(
      (c) =>
        `<option value="${escapeHtml(c.categoryId)}">${escapeHtml(c.name || String(c.categoryId))}</option>`,
    )
    .join("");
  sel.value = options.some((c) => String(c.categoryId) === String(prev)) ? prev : "all";
  selectedCategoryId = sel.value;
}

async function loadResults() {
  const res = await api("/api/results");
  $("resultsMeta").textContent = res.updatedAt
    ? `Stand: ${new Date(res.updatedAt).toLocaleString("de-DE")} | Eintraege: ${res.entries.length}`
    : "Noch keine Ergebnisse";
  renderResults(res.entries);
}

async function saveConfig() {
  for (const id of selectedTemplateIds) {
    if (!rulesByTemplateId.has(id)) rulesByTemplateId.set(id, defaultRule());
  }

  const treatmentRules = {};
  for (const [id, rule] of rulesByTemplateId.entries()) {
    treatmentRules[String(id)] = normalizeRule(rule);
  }

  let startDateTime = $("startDateTime").value;
  let endDateTime = $("endDateTime").value;
  if (useTodayWindow) {
    const w = todayWindow();
    startDateTime = toDatetimeLocalValue(w.start);
    endDateTime = toDatetimeLocalValue(w.end);
    setAbfrageMode(true);
  }

  const cfg = {
    useTodayWindow,
    startDateTime,
    endDateTime,
    refreshMinutes: Number($("refreshMinutes").value),
    minLeadMinutes: Math.max(0, Number($("minLeadMinutes").value) || 0),
    autoPauseFrom: normalizeDailyTime($("autoPauseFrom").value),
    autoPauseTo: normalizeDailyTime($("autoPauseTo").value),
    templateIds: Array.from(selectedTemplateIds),
    treatmentRules,
  };

  await api("/api/config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cfg),
  });
}

async function init() {
  setAbfrageMode(true);

  await loadConfig().catch(() => {});
  await loadTreatments(false);
  await loadResults().catch(() => {});
  await loadStatus().catch(() => {});

  $("useTodayWindow").addEventListener("change", () => {
    setAbfrageMode($("useTodayWindow").checked);
  });

  $("categoryFilter").addEventListener("change", () => {
    selectedCategoryId = $("categoryFilter").value;
    renderTreatments(treatmentsCache, $("treatmentFilter").value);
  });

  $("showSelectedOnly").addEventListener("change", () => {
    showSelectedOnly = $("showSelectedOnly").checked;
    renderTreatments(treatmentsCache, $("treatmentFilter").value);
  });

  $("treatmentFilter").addEventListener("input", () =>
    renderTreatments(treatmentsCache, $("treatmentFilter").value),
  );

  $("reloadTreatments").addEventListener("click", async () => {
    $("treatments").textContent = "Lade...";
    await loadTreatments(true);
  });

  $("refreshResults").addEventListener("click", async () => {
    await loadResults();
    await loadStatus();
  });

  const setButtonBusy = (button, busy, busyLabel) => {
    if (!button) return;
    if (busy) {
      button.dataset.prevLabel = button.textContent;
      button.textContent = busyLabel;
      button.disabled = true;
    } else {
      const prev = button.dataset.prevLabel;
      if (prev) button.textContent = prev;
      button.disabled = false;
    }
  };

  $("saveConfig").addEventListener("click", async () => {
    const btn = $("saveConfig");
    setButtonBusy(btn, true, "Speichere...");
    try {
      await saveConfig();
      await loadStatus();
    } finally {
      setButtonBusy(btn, false, "");
    }
  });

  $("runNow").addEventListener("click", async () => {
    const btn = $("runNow");
    setButtonBusy(btn, true, "Abruf laeuft...");
    $("saveConfig").disabled = true;
    try {
      await saveConfig();
      await loadStatus();
      await api("/api/run", { method: "POST" });
      await loadResults();
      await loadStatus();
    } finally {
      $("saveConfig").disabled = false;
      setButtonBusy(btn, false, "");
    }
  });

  $("stop").addEventListener("click", async () => {
    await api("/api/stop", { method: "POST" });
    await loadStatus();
  });

  setInterval(() => {
    loadStatus().catch(() => {});
  }, 5000);

  // If "Heute" is enabled and the day changes while the UI is open, refresh the shown window.
  let lastDay = new Date().toDateString();
  setInterval(() => {
    const cur = new Date().toDateString();
    if (useTodayWindow && cur !== lastDay) {
      lastDay = cur;
      setAbfrageMode(true);
    } else if (cur !== lastDay) {
      lastDay = cur;
    }
  }, 30000);
}

init().catch((e) => {
  $("statusLine").textContent = `Fehler: ${e.message}`;
});

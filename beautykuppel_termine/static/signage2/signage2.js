const REF_W = 1080;
const REF_H = 1920;
const VISIBLE_COUNT = 5;

function $(id) {
  return document.getElementById(id);
}

function fixText(value) {
  if (typeof value !== "string") return value;
  if (!value.includes("Ã") && !value.includes("Â")) return value;
  return value
    .replaceAll("Ã¼", "\u00fc")
    .replaceAll("Ãœ", "\u00dc")
    .replaceAll("Ã¤", "\u00e4")
    .replaceAll("Ã„", "\u00c4")
    .replaceAll("Ã¶", "\u00f6")
    .replaceAll("Ã–", "\u00d6")
    .replaceAll("ÃŸ", "\u00df")
    .replaceAll("Â", "");
}

function normalizeCustom(custom) {
  const out = { ...(custom || {}) };
  const keys = ["title", "subtitle", "listTitle", "emptyText", "qrLabel", "qrUrl", "noQrText"];
  for (const k of keys) out[k] = fixText(out[k]);
  if (out.promoConfig && typeof out.promoConfig === "object") {
    out.promoConfig = { ...out.promoConfig, text: fixText(out.promoConfig.text) };
  }
  if (out.noQrTextConfig && typeof out.noQrTextConfig === "object") {
    out.noQrTextConfig = { ...out.noQrTextConfig };
  }
  return out;
}

function applyImageBox(el, cfg, defaults) {
  const c = { ...defaults, ...(cfg || {}) };
  if (!el) return;
  el.style.width = `${c.size}px`;
  el.style.height = `${c.size}px`;
  if (c.top != null || c.right != null || c.bottom != null || c.left != null) {
    el.style.position = "absolute";
    el.style.top = c.top != null ? `${c.top}px` : "auto";
    el.style.right = c.right != null ? `${c.right}px` : "auto";
    el.style.bottom = c.bottom != null ? `${c.bottom}px` : "auto";
    el.style.left = c.left != null ? `${c.left}px` : "auto";
    el.style.zIndex = 20;
  }
}

function applyTagStyle(el, cfg, defaults) {
  const c = { ...defaults, ...(cfg || {}) };
  if (!el) return;
  if (c.show === false) {
    el.style.display = "none";
    return;
  }
  el.style.display = "block";
  el.style.position = "absolute";
  el.style.top = c.top != null ? `${c.top}px` : "auto";
  el.style.right = c.right != null ? `${c.right}px` : "auto";
  el.style.bottom = c.bottom != null ? `${c.bottom}px` : "auto";
  el.style.left = c.left != null ? `${c.left}px` : "auto";
  el.style.transform = "none";
  if (c.size != null) el.style.fontSize = `${c.size}px`;
  if (c.color) el.style.color = c.color;
  if (c.weight != null) el.style.fontWeight = String(c.weight);
}


function filterPastAppointments(appointments) {
  const now = new Date();
  return (appointments || []).filter((apt) => {
    try {
      const dateWithYear = String(apt.date || "").match(/(\d{2})\.(\d{2})\.(\d{4})/);
      let day;
      let month;
      let year;
      if (dateWithYear) {
        day = parseInt(dateWithYear[1], 10);
        month = parseInt(dateWithYear[2], 10) - 1;
        year = parseInt(dateWithYear[3], 10);
      } else {
        const dateParts = String(apt.date || "").match(/(\d{2})\.(\d{2})\./);
        if (!dateParts) return true;
        day = parseInt(dateParts[1], 10);
        month = parseInt(dateParts[2], 10) - 1;
        year = now.getFullYear();
        if (month < now.getMonth() - 6) year += 1;
      }

      const [hours, minutes] = String(apt.time || "0:0").split(":").map(Number);
      const dt = new Date();
      dt.setFullYear(year);
      dt.setMonth(month);
      dt.setDate(day);
      dt.setHours(hours, minutes, 0, 0);
      return dt >= now;
    } catch {
      return true;
    }
  });
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function applyBoxStyle(el, cfg, defaults) {
  const c = { ...defaults, ...(cfg || {}) };
  el.style.width = `${c.size}px`;
  el.style.height = `${c.size}px`;
  el.style.top = "auto";
  el.style.right = "auto";
  el.style.bottom = "auto";
  el.style.left = "auto";
  if (c.top != null) el.style.top = `${c.top}px`;
  if (c.right != null) el.style.right = `${c.right}px`;
  if (c.bottom != null) el.style.bottom = `${c.bottom}px`;
  if (c.left != null) el.style.left = `${c.left}px`;
  if (c.color) el.style.backgroundColor = c.color;
}

function updateScale() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const scale = Math.min(vw / REF_W, vh / REF_H);
  const scaleEl = $("scale");
  scaleEl.style.transform = `scale(${scale})`;
  const scaledW = REF_W * scale;
  const scaledH = REF_H * scale;
  scaleEl.style.left = `${(vw - scaledW) / 2}px`;
  scaleEl.style.top = `${(vh - scaledH) / 2}px`;
}

function formatTime(date) {
  return date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(date) {
  return date.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
}

function buildPill(apt, fallbackImage) {
  const pill = document.createElement("div");
  pill.className = "appointmentPill";

  const imgWrap = document.createElement("div");
  imgWrap.className = "pillImage";
  const img = document.createElement("img");
  img.alt = "";
  img.src = apt.imageUrl || fallbackImage;
  imgWrap.appendChild(img);

  const content = document.createElement("div");
  content.className = "pillContent";
  const time = document.createElement("div");
  time.className = "time";
  const rawTime = apt.time || "";
  time.textContent = rawTime && rawTime.includes("Uhr") ? rawTime : rawTime ? `${rawTime} Uhr` : "";
  const treatment = document.createElement("div");
  treatment.className = "treatment";
  treatment.textContent = apt.treatment || "";
  content.appendChild(time);
  content.appendChild(treatment);

  const priceWrap = document.createElement("div");
  priceWrap.className = "priceContainer";
  const price = document.createElement("div");
  price.className = "price";
  price.textContent = apt.price || "";
  priceWrap.appendChild(price);
  if (apt.originalPrice) {
    const op = document.createElement("div");
    op.className = "originalPrice";
    op.textContent = apt.originalPrice;
    priceWrap.appendChild(op);
  }

  pill.appendChild(imgWrap);
  pill.appendChild(content);
  pill.appendChild(priceWrap);
  return pill;
}

async function main() {
  window.addEventListener("resize", updateScale);
  updateScale();

  const noQrMode = new URLSearchParams(window.location.search).has("noqr");

  let custom = {};
  let appSettings = {};
  let settingsSignature = "";

  async function loadSettingsSnapshot() {
    const settings = await fetchJson("../settings.json");
    const nextCustom = normalizeCustom(settings?.signage2 || settings || {});
    const nextAppSettings = settings?.appSettings || settings || {};
    const signature = JSON.stringify([nextCustom, nextAppSettings]);
    return { nextCustom, nextAppSettings, signature };
  }

  try {
    const snapshot = await loadSettingsSnapshot();
    custom = snapshot.nextCustom;
    appSettings = snapshot.nextAppSettings;
    settingsSignature = snapshot.signature;
  } catch {
    custom = {};
    appSettings = {};
    settingsSignature = "";
  }

  const mediaBase = "../media/";
  const container = $("container");
  if (custom.pillColor) {
    container.style.setProperty("--pill-bg", custom.pillColor);
  }
  const bg = custom.backgroundColor || "#F4F1E9";
  container.style.backgroundColor = bg;
  if (custom.backgroundImage && custom.backgroundImage !== "none") {
    container.style.backgroundImage = "url(" + mediaBase + custom.backgroundImage + ")";
    container.style.backgroundSize = "cover";
    container.style.backgroundPosition = "center";
    container.style.backgroundRepeat = "no-repeat";
  }
  if (custom.theme === "dark") container.classList.add("darkTheme");

  // Circles
  applyBoxStyle($("circleMain"), custom.circleMain, { size: 1200, top: 280, left: -280, color: "#5E7367" });
  applyBoxStyle($("circleAccent"), custom.circleAccent, { size: 520, bottom: -120, right: -120, color: "#D7E4D9" });

  // Images (hero + massage)
  applyBoxStyle($("heroCircle"), custom.heroCircle, { size: 300, top: 160, right: 50 });
  applyBoxStyle($("massageCircle"), custom.circleFooter, { size: 420, bottom: -80, left: -80 });

  $("heroImg").src = mediaBase + (custom.heroImage || "spa-hero.png");
  $("massageImg").src = mediaBase + (custom.massageImage || "massage.png");
  $("logoImg").src = mediaBase + (custom.logo || "logo.png");
  const logoCfg = custom.logoConfig || {};
  applyImageBox($("logoWrap"), logoCfg, { size: 90 });
  $("logoImg").style.width = "100%";
  $("logoImg").style.height = "100%";
  $("logoImg").style.objectFit = "contain";
  const logoTextEl = document.querySelector(".logoText");
  if (logoTextEl && (logoCfg.top != null || logoCfg.left != null || logoCfg.right != null || logoCfg.bottom != null)) {
    const offset = (logoCfg.size || 90) + 24;
    logoTextEl.style.marginLeft = offset + "px";
  }

  $("qrImg").src = mediaBase + (custom.qrCode || "qr-code.png");
  const qrCfg = custom.qrConfig || {};
  const qrWrap = $("qrWrap");
  if (qrWrap && qrCfg.size) {
    qrWrap.style.width = qrCfg.size + "px";
    qrWrap.style.height = qrCfg.size + "px";
  }
  const qrSection = document.querySelector(".qrSection");
  if (qrSection && (qrCfg.top != null || qrCfg.left != null || qrCfg.right != null || qrCfg.bottom != null)) {
    qrSection.style.position = "absolute";
    qrSection.style.top = qrCfg.top != null ? qrCfg.top + "px" : "auto";
    qrSection.style.right = qrCfg.right != null ? qrCfg.right + "px" : "auto";
    qrSection.style.bottom = qrCfg.bottom != null ? qrCfg.bottom + "px" : "auto";
    qrSection.style.left = qrCfg.left != null ? qrCfg.left + "px" : "auto";
  }
  $("qrImg").style.width = "100%";
  $("qrImg").style.height = "100%";
  $("qrImg").style.objectFit = "contain";

  const titleText = custom.title != null ? custom.title : "BEAUTYKUPPEL";
  const subtitleText = custom.subtitle != null ? custom.subtitle : "Therme Bad Aibling";
  const listTitle = custom.listTitle != null ? custom.listTitle : "FREIE TERMINE HEUTE";
  $("title").textContent = titleText;
  $("subtitle").textContent = subtitleText;
  $("listTitle").innerHTML = String(listTitle)
    .replaceAll("\\n", "<br/>")
    .replaceAll("\n", "<br/>");

  const contentCfg = custom.contentConfig || {};
  const mainEl = document.querySelector(".main");
  if (mainEl) {
    mainEl.style.paddingLeft = `${contentCfg.left ?? 50}px`;
    mainEl.style.paddingRight = `${contentCfg.right ?? 50}px`;
    if (contentCfg.top != null) {
      mainEl.style.transform = `translateY(${contentCfg.top}px)`;
    }
  }
  const listTitleEl = $("listTitle");
  if (listTitleEl) {
    listTitleEl.style.marginTop = `${contentCfg.titleMarginTop ?? 320}px`;
    listTitleEl.style.marginBottom = `${contentCfg.titleMarginBottom ?? 50}px`;
    if (contentCfg.titleSize != null) {
      listTitleEl.style.fontSize = `${contentCfg.titleSize}px`;
    }
  }
  const listElCfg = $("list");
  if (listElCfg) {
    listElCfg.style.maxWidth = `${contentCfg.listMaxWidth ?? 940}px`;
    listElCfg.style.gap = `${contentCfg.listGap ?? 22}px`;
  }
  container.style.setProperty("--time-treatment-gap", `${contentCfg.timeTreatmentGap ?? 2}px`);

  // Clock positioning
  const timeCfg = custom.timeConfig || {};
  const clockWrap = $("clockWrap");
  if (timeCfg.show === false) {
    clockWrap.style.display = "none";
  } else {
    clockWrap.style.display = "flex";
    clockWrap.style.fontSize = (timeCfg.size || 48) + "px";
    clockWrap.style.color = timeCfg.color || "#5E7367";
    clockWrap.style.top = (timeCfg.top ?? 40) + "px";
    clockWrap.style.right = (timeCfg.right ?? 60) + "px";
    if (timeCfg.left != null) clockWrap.style.left = timeCfg.left + "px";
    if (timeCfg.bottom != null) clockWrap.style.bottom = timeCfg.bottom + "px";
    if (timeCfg.left != null || timeCfg.bottom != null) {
      clockWrap.style.top = timeCfg.top != null ? timeCfg.top + "px" : "auto";
      clockWrap.style.right = timeCfg.right != null ? timeCfg.right + "px" : "auto";
    }
  }

  function tickClock() {
    const now = new Date();
    $("clockTime").textContent = `${formatTime(now)} Uhr`;
    $("clockDate").textContent = formatDate(now);
  }
  tickClock();
  setInterval(tickClock, 1000);

  // Footer/QR text
  const qrLabel = custom.qrLabel != null ? custom.qrLabel : "Infos & Buchung unter";
  const qrUrl = custom.qrUrl != null ? custom.qrUrl : "beautykuppel.de/termine";
  const qrTextEl = $("qrText");
  const noQrTextEl = $("noQrText");
  const noQrText = custom.noQrText != null ? custom.noQrText : "In diesem Bereich sind keine Handys erlaubt.";
  const noQrTextCfg = custom.noQrTextConfig || {};
  if (noQrMode) {
    qrWrap.style.display = "none";
    qrTextEl.style.display = "none";
    noQrTextEl.style.display = "flex";
    noQrTextEl.innerHTML = String(noQrText)
      .replaceAll("\\n", "<br/>")
      .replaceAll("\n", "<br/>");
    noQrTextEl.style.fontSize = `${noQrTextCfg.fontSize ?? 28}px`;
    noQrTextEl.style.color = noQrTextCfg.color || "#5E7367";
    noQrTextEl.style.lineHeight = String(noQrTextCfg.lineHeight ?? 1.35);
    noQrTextEl.style.fontWeight = String(noQrTextCfg.fontWeight ?? 600);
    noQrTextEl.style.textAlign = noQrTextCfg.align || "right";
    noQrTextEl.style.justifyContent = (noQrTextCfg.align || "right") === "left" ? "flex-start" : (noQrTextCfg.align || "right") === "center" ? "center" : "flex-end";
    noQrTextEl.style.width = noQrTextCfg.width != null ? `${noQrTextCfg.width}px` : "auto";
    noQrTextEl.style.minHeight = `${noQrTextCfg.minHeight ?? qrCfg.size ?? 150}px`;
    noQrTextEl.style.maxWidth = `${noQrTextCfg.maxWidth ?? qrCfg.size ?? 150}px`;
    noQrTextEl.style.marginTop = `${noQrTextCfg.marginTop ?? 0}px`;
  } else {
    qrWrap.style.display = "block";
    qrTextEl.style.display = "block";
    noQrTextEl.style.display = "none";
    qrTextEl.innerHTML = `<span class="qrLabelText">${qrLabel}</span><strong class="qrUrlText">${qrUrl}</strong>`;
  }

  const emptyText = custom.emptyText != null ? custom.emptyText : "Aktuell sind keine freien Termine vorhanden.";

  const rotationIntervalSec = Number(custom.appointmentPageSeconds ?? appSettings.signageRotationInterval ?? custom.signageRotationInterval ?? 8) || 8;
  const promoEnabled = custom.promoConfig?.show !== false && !!custom.promoConfig?.text;
  const promoDurationSec = Number(custom.promoConfig?.duration ?? 8) || 8;

  let all = [];
  let visibleStart = 0;
  let showingPromo = false;

  async function fetchAppointments() {
    try {
      const data = await fetchJson("../appointments.json");
      if (data?.success) {
        all = filterPastAppointments(data.appointments || []);
        let updatedText = "";
        if (data.lastUpdated) {
          const parsed = new Date(data.lastUpdated);
          if (!Number.isNaN(parsed.getTime())) {
            updatedText = `Stand: ${parsed.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr`;
          } else {
            updatedText = `Stand: ${data.lastUpdated}`;
          }
        }
        $("updatedTag").textContent = updatedText;
        applyTagStyle($("updatedTag"), custom.lastUpdatedConfig, { show: !!updatedText, size: 20, bottom: 30, right: 40, color: "rgba(94, 115, 103, 0.7)" });
      }
    } catch {
      // ignore
    }
  }

  function render() {
    const listEl = $("list");
    const emptyEl = $("empty");
    const promoEl = $("promo");

    if (showingPromo) {
      listEl.style.display = "none";
      emptyEl.style.display = "none";
      promoEl.style.display = "flex";
      promoEl.style.color = custom.promoConfig?.color || "#5E7367";
      promoEl.style.fontSize = (custom.promoConfig?.fontSize || 38) + "px";
      const promoCfg = custom.promoConfig || {};
      promoEl.style.paddingTop = promoCfg.top != null ? `${60 + promoCfg.top}px` : "60px";
      promoEl.style.paddingBottom = promoCfg.bottom != null ? `${60 + promoCfg.bottom}px` : "60px";
      promoEl.style.paddingLeft = promoCfg.left != null ? `${80 + promoCfg.left}px` : "80px";
      promoEl.style.paddingRight = promoCfg.right != null ? `${80 + promoCfg.right}px` : "80px";
      promoEl.innerHTML = String(custom.promoConfig?.text || "")
        .replaceAll("\\n", "<br/>")
        .replaceAll("\n", "<br/>");
      return;
    }

    promoEl.style.display = "none";
    listEl.style.display = "flex";

    if (!all.length) {
      listEl.innerHTML = "";
      emptyEl.innerHTML = String(emptyText)
        .replaceAll("\\n", "<br/>")
        .replaceAll("\n", "<br/>");
      emptyEl.style.display = "block";
      return;
    }

    emptyEl.style.display = "none";
    listEl.innerHTML = "";
    const slice = all.slice(visibleStart, visibleStart + VISIBLE_COUNT);
    const fallbackImage = mediaBase + "facial.png";
    slice.forEach((apt, index) => {
      const pill = buildPill(apt, fallbackImage);
      pill.style.animationDelay = `${Math.max(0, index) * 0.12}s`;
      listEl.appendChild(pill);
    });
  }

  async function step() {
    if (showingPromo) return;
    await fetchAppointments();

    if (!all.length) {
      visibleStart = 0;
      render();
      return;
    }

    if (all.length <= VISIBLE_COUNT) {
      visibleStart = 0;
      render();
      if (promoEnabled) {
        showingPromo = true;
        render();
        setTimeout(() => {
          showingPromo = false;
          visibleStart = 0;
          render();
        }, promoDurationSec * 1000);
      }
      return;
    }

    if (visibleStart >= all.length) visibleStart = 0;
    const nextStart = visibleStart + VISIBLE_COUNT;
    if (nextStart >= all.length) {
      if (promoEnabled) {
        showingPromo = true;
        render();
        setTimeout(() => {
          showingPromo = false;
          visibleStart = 0;
          render();
        }, promoDurationSec * 1000);
        return;
      }
      visibleStart = 0;
      render();
      return;
    }

    visibleStart = nextStart;
    render();
  }

  await fetchAppointments();
  container.classList.add("ready");
  render();

  setInterval(step, rotationIntervalSec * 1000);
  setInterval(fetchAppointments, 60000);
  setInterval(async () => {
    try {
      const snapshot = await loadSettingsSnapshot();
      if (snapshot.signature !== settingsSignature) {
        window.location.reload();
      }
    } catch {
      // ignore
    }
  }, 15000);
}

main().catch(() => {});







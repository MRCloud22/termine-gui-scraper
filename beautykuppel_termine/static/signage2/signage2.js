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
  const keys = ["title", "subtitle", "listTitle", "emptyText", "qrLabel", "qrUrl"];
  for (const k of keys) out[k] = fixText(out[k]);
  if (out.promoConfig && typeof out.promoConfig === "object") {
    out.promoConfig = { ...out.promoConfig, text: fixText(out.promoConfig.text) };
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
  if (c.size != null) el.style.fontSize = `${c.size}px`;
  if (c.color) el.style.color = c.color;
  if (c.top != null || c.right != null || c.bottom != null || c.left != null) {
    el.style.position = "absolute";
    el.style.top = c.top != null ? `${c.top}px` : "auto";
    el.style.right = c.right != null ? `${c.right}px` : "auto";
    el.style.bottom = c.bottom != null ? `${c.bottom}px` : "auto";
    el.style.left = c.left != null ? `${c.left}px` : "auto";
    el.style.transform = "none";
  }
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
  time.textContent = apt.time || "";
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

  let custom = {};
  let appSettings = {};
  try {
    const settings = await fetchJson("../settings.json");
    custom = settings?.signage2 || settings || {};
    custom = normalizeCustom(custom);
    appSettings = settings?.appSettings || settings || {};
  } catch {
    custom = {};
    appSettings = {};
  }

  const container = $("container");
  if (custom.pillColor) {
    container.style.setProperty("--pill-bg", custom.pillColor);
  }
  const bg = custom.backgroundColor || "#F4F1E9";
  container.style.backgroundColor = bg;
  if (custom.backgroundImage && custom.backgroundImage !== "none") {
    container.style.backgroundImage = `url(${mediaBase + custom.backgroundImage})`;
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

  const mediaBase = "../media/";
  $("heroImg").src = mediaBase + (custom.heroImage || "spa-hero.png");
  $("massageImg").src = mediaBase + (custom.massageImage || "massage.png");
  $("logoImg").src = mediaBase + (custom.logo || "logo.png");
  const logoCfg = custom.logoConfig || {};
  applyImageBox($("logoWrap"), logoCfg, { size: 90 });
  $("logoImg").style.width = "100%";
  $("logoImg").style.height = "100%";
  $("logoImg").style.objectFit = "contain";

  $("qrImg").src = mediaBase + (custom.qrCode || "qr-code.png");
  const qrCfg = custom.qrConfig || {};
  applyImageBox($("qrWrap"), qrCfg, { size: 150 });
  $("qrImg").style.width = "100%";
  $("qrImg").style.height = "100%";
  $("qrImg").style.objectFit = "contain";

  $("title").textContent = custom.title || "BEAUTYKUPPEL";
  $("subtitle").textContent = custom.subtitle || "Therme Bad Aibling";
  $("listTitle").textContent = custom.listTitle || "FREIE TERMINE HEUTE";

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
    $("clockTime").textContent = formatTime(now);
    $("clockDate").textContent = formatDate(now);
  }
  tickClock();
  setInterval(tickClock, 1000);

  // Footer/QR text
  const qrLabel = custom.qrLabel || "Infos & Buchung unter";
  const qrUrl = custom.qrUrl || "beautykuppel.de/termine";
  $("qrText").textContent = `${qrLabel}\n${qrUrl}`;
  $("qrText").style.whiteSpace = "pre-line";

  const emptyText = custom.emptyText || "Aktuell sind keine freien Termine vorhanden.";

  const rotationIntervalSec = Number(appSettings.signageRotationInterval || custom.signageRotationInterval || 8) || 8;
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
        $("updatedTag").textContent = data.lastUpdated ? `last updated: ${data.lastUpdated}` : "";
        applyTagStyle($("updatedTag"), custom.lastUpdatedConfig, { show: true, size: 11, bottom: 5, left: 40, color: "rgba(0, 0, 0, 0.3)" });
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
      promoEl.style.whiteSpace = "pre-line";
      promoEl.textContent = String(custom.promoConfig?.text || "").replaceAll("\\n", "\n");
      return;
    }

    promoEl.style.display = "none";
    listEl.style.display = "flex";

    if (!all.length) {
      listEl.innerHTML = "";
      emptyEl.textContent = emptyText;
      emptyEl.style.display = "block";
      return;
    }

    emptyEl.style.display = "none";
    listEl.innerHTML = "";
    const slice = all.slice(visibleStart, visibleStart + VISIBLE_COUNT);
    const fallbackImage = mediaBase + "facial.png";
    for (const apt of slice) listEl.appendChild(buildPill(apt, fallbackImage));
  }

  async function step() {
    await fetchAppointments();
    render();

    if (all.length <= VISIBLE_COUNT) {
      visibleStart = 0;
      return;
    }

    visibleStart += VISIBLE_COUNT;
    if (visibleStart >= all.length) visibleStart = 0;

    if (promoEnabled) {
      showingPromo = true;
      render();
      setTimeout(() => {
        showingPromo = false;
        render();
      }, promoDurationSec * 1000);
    }
  }

  await fetchAppointments();
  container.classList.add("ready");
  render();

  setInterval(step, rotationIntervalSec * 1000);
  setInterval(fetchAppointments, 60000);
}

main().catch(() => {});







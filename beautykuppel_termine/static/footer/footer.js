const DEFAULTS = {
  height: 200,
  title: "WEITERE TERMINE (TICKER):",
  showArrow: true,
  backgroundColor: "#F4F1E9",
  borderColor: "rgba(94, 115, 103, 0.26)",
  labelColor: "#6b5540",
  textColor: "#222",
  cardBackground: "#f8f6f1",
  cardBorderColor: "rgba(0, 0, 0, 0.08)",
  priceColor: "#222",
  oldPriceColor: "#d32f2f",
  itemGap: 26,
  cardHeight: 112,
  cardRadius: 50,
  cardMinWidth: 420,
  cardMaxWidth: 600,
  footerPaddingX: 24,
  footerPaddingY: 10,
  titleOffsetX: 0,
  labelFontSize: 36,
  arrowFontSize: 34,
  timeFontSize: 38,
  treatmentFontSize: 44,
  priceFontSize: 52,
  originalPriceFontSize: 42,
  emptyFontSize: 40,
  priceGap: 8,
  imageTextGap: 14,
  imageSize: 90,
  imageOffsetX: 0,
  scrollSpeedPxPerSec: 90,
  scrollDirection: "ltr",
  dataRefreshSeconds: 60,
  emptyText: "Aktuell sind keine weiteren Termine vorhanden.",
};

function $(id) {
  return document.getElementById(id);
}

function fixText(value) {
  if (typeof value !== "string") return value;
  if (!value.includes("\u00C3") && !value.includes("\u00C2")) return value;
  return value
    .replaceAll("\u00C3\u00BC", "\u00FC")
    .replaceAll("\u00C3\u009C", "\u00DC")
    .replaceAll("\u00C3\u00A4", "\u00E4")
    .replaceAll("\u00C3\u0084", "\u00C4")
    .replaceAll("\u00C3\u00B6", "\u00F6")
    .replaceAll("\u00C3\u0096", "\u00D6")
    .replaceAll("\u00C3\u009F", "\u00DF")
    .replaceAll("\u00C2", "");
}

function fixFooterTreatmentText(value) {
  return fixText(String(value || "")).replace(/(\d+)\s+Minuten\b/g, "$1\u00A0Minuten");
}

function formatMoney(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  const digits = value.replace(/\u00A0/g, " ").replace(/[^0-9,.-]/g, "").trim();
  return digits ? `\u20AC ${digits}` : value;
}

function getScrollDirection(cfg) {
  const value = String(cfg?.scrollDirection || DEFAULTS.scrollDirection).toLowerCase().trim();
  if (value === "rtl" || value === "right-to-left" || value === "right_to_left") return "rtl";
  return "ltr";
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

function buildCard(apt, fallbackImage, cfg) {
  const card = document.createElement("article");
  card.className = "tickerCard";
  const minWidth = Math.max(260, Number(cfg.cardMinWidth) || DEFAULTS.cardMinWidth);
  const maxWidth = Math.max(minWidth, Number(cfg.cardMaxWidth) || DEFAULTS.cardMaxWidth);
  card.style.minWidth = `${minWidth}px`;
  card.style.maxWidth = `${maxWidth}px`;

  const img = document.createElement("img");
  img.className = "tickerImage";
  img.alt = "";
  img.loading = "lazy";
  img.decoding = "async";
  img.src = apt.imageUrl || fallbackImage;

  const body = document.createElement("div");
  body.className = "tickerBody";

  const time = document.createElement("div");
  time.className = "tickerTime";
  time.textContent = apt.time ? `${String(apt.time).trim()} Uhr` : "";

  const treatment = document.createElement("div");
  treatment.className = "tickerTreatment";
  treatment.textContent = fixFooterTreatmentText(apt.treatment);

  body.append(time, treatment);

  const priceWrap = document.createElement("div");
  priceWrap.className = "tickerPriceWrap";

  const price = document.createElement("div");
  price.className = "tickerPrice";
  price.textContent = formatMoney(apt.price);
  priceWrap.appendChild(price);

  if (apt.originalPrice) {
    const originalPrice = document.createElement("div");
    originalPrice.className = "tickerOriginalPrice";
    originalPrice.textContent = formatMoney(apt.originalPrice);
    priceWrap.appendChild(originalPrice);
  }

  card.append(img, body, priceWrap);
  return card;
}

function buildEmptyCard(text, cfg) {
  const card = document.createElement("article");
  card.className = "tickerCard empty";
  const minWidth = Math.max(360, Number(cfg.cardMinWidth) || DEFAULTS.cardMinWidth);
  const maxWidth = Math.max(minWidth, Number(cfg.cardMaxWidth) || DEFAULTS.cardMaxWidth);
  card.style.minWidth = `${minWidth}px`;
  card.style.maxWidth = `${maxWidth}px`;

  const msg = document.createElement("div");
  msg.className = "tickerTreatment";
  msg.textContent = fixText(text);

  card.appendChild(msg);
  return card;
}

function settingsSignature(settings) {
  return JSON.stringify(settings || {});
}

async function main() {
  const footerRoot = $("footerRoot");
  const tickerLabel = $("tickerLabel");
  const tickerTrack = $("tickerTrack");
  const arrow = document.querySelector(".tickerArrow");

  let cfg = { ...DEFAULTS };
  let cfgSig = settingsSignature(cfg);
  let appointments = [];
  let appointmentsStamp = "";
  let appointmentsTimer = null;
  let resizeTimer = null;

  function applyTheme() {
    const requestedHeight = Math.max(120, Number(cfg.height) || DEFAULTS.height);
    const footerPaddingX = Math.max(0, Number(cfg.footerPaddingX) || DEFAULTS.footerPaddingX);
    const footerPaddingY = Math.max(0, Number(cfg.footerPaddingY) || DEFAULTS.footerPaddingY);
    const labelFontSize = Math.max(10, Number(cfg.labelFontSize) || DEFAULTS.labelFontSize);
    const arrowFontSize = Math.max(10, Number(cfg.arrowFontSize) || DEFAULTS.arrowFontSize);
    const requestedCardHeight = Math.max(56, Number(cfg.cardHeight) || DEFAULTS.cardHeight);
    const requestedImageSize = Math.max(24, Number(cfg.imageSize) || DEFAULTS.imageSize);
    const topRowRequested = Math.max(24, labelFontSize * 1.08, arrowFontSize * 1.08);
    const innerHeight = Math.max(40, requestedHeight - (footerPaddingY * 2) - 2);
    const topRowHeight = Math.min(topRowRequested, Math.max(24, innerHeight * 0.32));
    const availableCardHeight = Math.max(56, innerHeight - topRowHeight);
    const cardScale = Math.min(1, availableCardHeight / requestedCardHeight);
    const headerScale = Math.min(1, topRowHeight / topRowRequested);
    const effectiveCardHeight = Math.max(56, Math.round(requestedCardHeight * cardScale));
    const effectiveImageSize = Math.max(24, Math.min(effectiveCardHeight - 12, Math.round(requestedImageSize * cardScale)));
    const effectiveCardPaddingX = Math.max(10, Math.round(18 * cardScale));
    const effectiveCardPaddingY = Math.max(4, Math.round(10 * cardScale));
    const effectiveImageTextGap = Math.max(0, Math.round((Number(cfg.imageTextGap) || DEFAULTS.imageTextGap) * cardScale));
    const rawImageOffsetX = Number(cfg.imageOffsetX) || DEFAULTS.imageOffsetX;
    const effectiveImageOffsetX = Math.max(-(effectiveCardPaddingX - 2), Math.min(effectiveImageTextGap, Math.round(rawImageOffsetX * cardScale)));

    document.documentElement.style.setProperty("--footer-height", `${requestedHeight}px`);
    document.documentElement.style.setProperty("--footer-bg", cfg.backgroundColor || DEFAULTS.backgroundColor);
    document.documentElement.style.setProperty("--footer-border", cfg.borderColor || DEFAULTS.borderColor);
    document.documentElement.style.setProperty("--label-color", cfg.labelColor || DEFAULTS.labelColor);
    document.documentElement.style.setProperty("--text-color", cfg.textColor || DEFAULTS.textColor);
    document.documentElement.style.setProperty("--card-bg", cfg.cardBackground || DEFAULTS.cardBackground);
    document.documentElement.style.setProperty("--card-border", cfg.cardBorderColor || DEFAULTS.cardBorderColor);
    document.documentElement.style.setProperty("--price-color", cfg.priceColor || DEFAULTS.priceColor);
    document.documentElement.style.setProperty("--old-price-color", cfg.oldPriceColor || DEFAULTS.oldPriceColor);
    document.documentElement.style.setProperty("--item-gap", `${Math.max(8, Number(cfg.itemGap) || DEFAULTS.itemGap)}px`);
    document.documentElement.style.setProperty("--card-height", `${effectiveCardHeight}px`);
    document.documentElement.style.setProperty("--card-radius", `${Math.max(12, Math.round((Number(cfg.cardRadius) || DEFAULTS.cardRadius) * cardScale))}px`);
    document.documentElement.style.setProperty("--card-padding-x", `${effectiveCardPaddingX}px`);
    document.documentElement.style.setProperty("--card-padding-y", `${effectiveCardPaddingY}px`);
    document.documentElement.style.setProperty("--footer-padding-x", `${footerPaddingX}px`);
    document.documentElement.style.setProperty("--footer-padding-y", `${footerPaddingY}px`);
    document.documentElement.style.setProperty("--title-offset-x", `${Math.max(0, Number(cfg.titleOffsetX) || DEFAULTS.titleOffsetX)}px`);
    document.documentElement.style.setProperty("--top-row-height", `${Math.round(topRowHeight)}px`);
    document.documentElement.style.setProperty("--label-font-size", `${Math.max(10, Math.round(labelFontSize * headerScale))}px`);
    document.documentElement.style.setProperty("--arrow-font-size", `${Math.max(10, Math.round(arrowFontSize * headerScale))}px`);
    document.documentElement.style.setProperty("--time-font-size", `${Math.max(10, Math.round((Number(cfg.timeFontSize) || DEFAULTS.timeFontSize) * cardScale))}px`);
    document.documentElement.style.setProperty("--treatment-font-size", `${Math.max(10, Math.round((Number(cfg.treatmentFontSize) || DEFAULTS.treatmentFontSize) * cardScale))}px`);
    document.documentElement.style.setProperty("--price-font-size", `${Math.max(10, Math.round((Number(cfg.priceFontSize) || DEFAULTS.priceFontSize) * cardScale))}px`);
    document.documentElement.style.setProperty("--original-price-font-size", `${Math.max(10, Math.round((Number(cfg.originalPriceFontSize) || DEFAULTS.originalPriceFontSize) * cardScale))}px`);
    document.documentElement.style.setProperty("--empty-font-size", `${Math.max(10, Math.round((Number(cfg.emptyFontSize) || DEFAULTS.emptyFontSize) * cardScale))}px`);
    document.documentElement.style.setProperty("--price-gap", `${Math.max(0, Number(cfg.priceGap) || DEFAULTS.priceGap)}px`);
    document.documentElement.style.setProperty("--image-text-gap", `${effectiveImageTextGap}px`);
    document.documentElement.style.setProperty("--image-size", `${effectiveImageSize}px`);
    document.documentElement.style.setProperty("--image-offset-x", `${effectiveImageOffsetX}px`);

    tickerLabel.textContent = fixText(String(cfg.title || DEFAULTS.title));
    arrow.style.display = cfg.showArrow === false ? "none" : "block";
    footerRoot.style.height = `${requestedHeight}px`;
  }

  function restartAppointmentsTimer() {
    if (appointmentsTimer) clearInterval(appointmentsTimer);
    const sec = Math.max(10, Number(cfg.dataRefreshSeconds) || DEFAULTS.dataRefreshSeconds);
    appointmentsTimer = setInterval(async () => {
      await loadAppointments(false);
    }, sec * 1000);
  }

  async function loadSettings(initial = false) {
    try {
      const raw = await fetchJson(`./footer-settings.json?ts=${Date.now()}`);
      const next = { ...DEFAULTS, ...((raw && raw.footer) || raw || {}) };
      next.title = fixText(next.title);
      next.emptyText = fixText(next.emptyText);
      const nextSig = settingsSignature(next);
      if (initial || nextSig !== cfgSig) {
        cfg = next;
        cfgSig = nextSig;
        applyTheme();
        render();
        restartAppointmentsTimer();
        return true;
      }
    } catch {
      if (initial) {
        cfg = { ...DEFAULTS };
        cfgSig = settingsSignature(cfg);
        applyTheme();
      }
    }
    return false;
  }

  async function loadAppointments(forceRender = true) {
    try {
      const data = await fetchJson("../appointments.json");
      const rows = filterPastAppointments(data?.appointments || []);
      const nextStamp = `${data?.lastUpdated || ""}|${rows.length}`;
      appointments = rows;
      if (forceRender || nextStamp !== appointmentsStamp) {
        appointmentsStamp = nextStamp;
        render();
      }
    } catch {
      appointments = [];
      if (forceRender) render();
    }
  }

  function applyTrackAnimation(direction, durationSec, groupWidthPx) {
    tickerTrack.className = "tickerTrack";
    tickerTrack.style.setProperty("--group-width", `${groupWidthPx}px`);
    tickerTrack.style.setProperty("--marquee-duration", `${durationSec.toFixed(2)}s`);
    tickerTrack.classList.add("animate", direction === "rtl" ? "dir-rtl" : "dir-ltr");
  }

  function render() {
    tickerTrack.className = "tickerTrack";
    tickerTrack.innerHTML = "";

    const fallbackImage = "../media/facial.png";
    const group = document.createElement("div");
    group.className = "tickerGroup";
    const direction = getScrollDirection(cfg);

    if (!appointments.length) {
      group.appendChild(buildEmptyCard(cfg.emptyText || DEFAULTS.emptyText, cfg));
      const clone = group.cloneNode(true);
      tickerTrack.append(group, clone);
      applyTrackAnimation(direction, 28, 720);
      return;
    }

    for (const apt of appointments) {
      group.appendChild(buildCard(apt, fallbackImage, cfg));
    }

    const clone = group.cloneNode(true);
    tickerTrack.append(group, clone);

    requestAnimationFrame(() => {
      const width = Math.ceil(group.getBoundingClientRect().width || 0);
      const speed = Math.max(25, Number(cfg.scrollSpeedPxPerSec) || DEFAULTS.scrollSpeedPxPerSec);
      const groupGap = Math.max(8, Number(cfg.itemGap) || DEFAULTS.itemGap);
      const safeWidth = Math.max(320, width + groupGap);
      const durationSec = Math.max(8, safeWidth / speed);
      applyTrackAnimation(direction, durationSec, safeWidth);
    });
  }

  await loadSettings(true);
  await loadAppointments(true);
  restartAppointmentsTimer();

  setInterval(async () => {
    await loadSettings(false);
  }, 15000);

  window.addEventListener("resize", () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => render(), 120);
  });

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => render()).catch(() => {});
  }
}

main().catch(() => {});
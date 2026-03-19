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
  titleBottomGap: 0,
  globalScale: 1,
  titleFontSize: 36,
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
  const minWidth = Math.max(80, Number(cfg.cardMinWidth) || DEFAULTS.cardMinWidth);
  const maxWidth = Math.max(minWidth, Number(cfg.cardMaxWidth) || DEFAULTS.cardMaxWidth);
  card.style.minWidth = `${minWidth}px`;
  card.style.maxWidth = `${maxWidth}px`;
  card.style.width = `${maxWidth}px`;

  const img = document.createElement("img");
  img.className = "tickerImage";
  img.alt = "";
  img.loading = "eager";
  img.decoding = "auto";
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

function buildEmptyTickerText(text) {
  const msg = document.createElement("div");
  msg.className = "tickerEmptyText";
  msg.textContent = fixText(text);
  return msg;
}

function settingsSignature(settings) {
  return JSON.stringify(settings || {});
}

function measureTextWidth(text, sourceEl) {
  if (!text || !sourceEl) return 0;
  const style = getComputedStyle(sourceEl);
  const canvas = measureTextWidth.canvas || (measureTextWidth.canvas = document.createElement("canvas"));
  const ctx = canvas.getContext("2d");
  ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  return ctx.measureText(String(text)).width;
}

function getCardContentMinWidth(card) {
  const cardStyle = getComputedStyle(card);
  const image = card.querySelector(".tickerImage");
  const time = card.querySelector(".tickerTime");
  const treatment = card.querySelector(".tickerTreatment");
  const priceWrap = card.querySelector(".tickerPriceWrap");

  const paddingLeft = parseFloat(cardStyle.paddingLeft) || 0;
  const paddingRight = parseFloat(cardStyle.paddingRight) || 0;
  const imageStyle = image ? getComputedStyle(image) : null;
  const imageBlock = image
    ? (image.getBoundingClientRect().width || 0) + (parseFloat(imageStyle.marginLeft) || 0) + (parseFloat(imageStyle.marginRight) || 0)
    : 0;
  const priceBlock = priceWrap ? (priceWrap.getBoundingClientRect().width || 0) + (parseFloat(getComputedStyle(priceWrap).marginLeft) || 0) : 0;
  const timeWidth = time ? measureTextWidth(time.textContent, time) : 0;
  const words = String(treatment?.textContent || "").trim().split(/\s+/).filter(Boolean);
  const longestWordWidth = treatment && words.length ? Math.max(...words.map((word) => measureTextWidth(word, treatment))) : 0;
  const bodyMinWidth = Math.max(timeWidth, longestWordWidth, 28);

  return Math.ceil(paddingLeft + paddingRight + imageBlock + priceBlock + bodyMinWidth + 12);
}

function canShrinkCard(card) {
  const treatment = card.querySelector(".tickerTreatment");
  const body = card.querySelector(".tickerBody");
  const time = card.querySelector(".tickerTime");
  if (!treatment || !body) return true;

  const treatmentHeightOverflow = treatment.scrollHeight - treatment.clientHeight > 1;
  const treatmentWidthOverflow = treatment.scrollWidth - treatment.clientWidth > 1;
  const timeWidthOverflow = time ? time.scrollWidth - time.clientWidth > 1 : false;
  const bodyOverflow = body.scrollWidth - body.clientWidth > 1;
  const cardOverflow = card.scrollWidth - card.clientWidth > 1;
  return !treatmentHeightOverflow && !treatmentWidthOverflow && !timeWidthOverflow && !bodyOverflow && !cardOverflow;
}

function tightenCardWidths(group) {
  const cards = Array.from(group.querySelectorAll(".tickerCard:not(.empty)"));
  for (const card of cards) {
    const configuredMinWidth = Math.max(0, Math.round(parseFloat(card.style.minWidth) || card.getBoundingClientRect().width || 0));
    const contentMinWidth = getCardContentMinWidth(card);
    const minWidth = Math.max(configuredMinWidth, contentMinWidth);
    const maxWidth = Math.max(minWidth, Math.round(parseFloat(card.style.maxWidth) || card.getBoundingClientRect().width || minWidth));

    card.style.width = `${maxWidth}px`;
    let low = minWidth;
    let high = maxWidth;
    let best = maxWidth;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      card.style.width = `${mid}px`;
      if (canShrinkCard(card)) {
        best = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    card.style.width = `${best}px`;
  }
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
    const globalScale = Math.max(0.4, Number(cfg.globalScale) || DEFAULTS.globalScale);
    const layoutScale = (requestedHeight / DEFAULTS.height) * globalScale;
    const footerPaddingX = Math.max(0, Math.round((Number(cfg.footerPaddingX) || DEFAULTS.footerPaddingX) * layoutScale));
    const footerPaddingY = Math.max(0, Math.round((Number(cfg.footerPaddingY) || DEFAULTS.footerPaddingY) * layoutScale));
    const titleFontSizeBase = cfg.titleFontSize ?? cfg.labelFontSize ?? DEFAULTS.titleFontSize;
    const labelFontSize = Math.max(10, Math.round(Number(titleFontSizeBase) * layoutScale));
    const arrowFontSize = Math.max(10, Math.round((Number(cfg.arrowFontSize) || DEFAULTS.arrowFontSize) * layoutScale));
    const timeFontSize = Math.max(10, Math.round((Number(cfg.timeFontSize) || DEFAULTS.timeFontSize) * layoutScale));
    const treatmentFontSize = Math.max(10, Math.round((Number(cfg.treatmentFontSize) || DEFAULTS.treatmentFontSize) * layoutScale));
    const priceFontSize = Math.max(10, Math.round((Number(cfg.priceFontSize) || DEFAULTS.priceFontSize) * layoutScale));
    const originalPriceFontSize = Math.max(10, Math.round((Number(cfg.originalPriceFontSize) || DEFAULTS.originalPriceFontSize) * layoutScale));
    const emptyFontSize = Math.max(10, Math.round((Number(cfg.emptyFontSize) || DEFAULTS.emptyFontSize) * layoutScale));
    const requestedCardHeight = Math.max(56, Math.round((Number(cfg.cardHeight) || DEFAULTS.cardHeight) * layoutScale));
    const effectiveImageSize = Math.max(24, Math.min(requestedCardHeight - 12, Math.round((Number(cfg.imageSize) || DEFAULTS.imageSize) * layoutScale)));
    const effectiveCardPaddingX = Math.max(10, Math.round(18 * layoutScale));
    const effectiveCardPaddingY = Math.max(4, Math.round(10 * layoutScale));
    const effectiveImageTextGap = Math.max(0, Math.round((Number(cfg.imageTextGap) || DEFAULTS.imageTextGap) * layoutScale));
    const rawImageOffsetX = Number(cfg.imageOffsetX) || DEFAULTS.imageOffsetX;
    const effectiveImageOffsetX = Math.max(-(effectiveCardPaddingX - 2), Math.min(effectiveImageTextGap, Math.round(rawImageOffsetX * layoutScale)));
    const titleBottomGap = Math.max(0, Math.round((Number(cfg.titleBottomGap) || DEFAULTS.titleBottomGap) * layoutScale));
    const topRowHeight = Math.max(
      Math.round(28 * layoutScale),
      Math.round(labelFontSize * 1.08),
      Math.round(arrowFontSize * 1.08),
    );

    document.documentElement.style.setProperty("--footer-height", `${requestedHeight}px`);
    document.documentElement.style.setProperty("--footer-bg", cfg.backgroundColor || DEFAULTS.backgroundColor);
    document.documentElement.style.setProperty("--footer-border", cfg.borderColor || DEFAULTS.borderColor);
    document.documentElement.style.setProperty("--label-color", cfg.labelColor || DEFAULTS.labelColor);
    document.documentElement.style.setProperty("--text-color", cfg.textColor || DEFAULTS.textColor);
    document.documentElement.style.setProperty("--card-bg", cfg.cardBackground || DEFAULTS.cardBackground);
    document.documentElement.style.setProperty("--card-border", cfg.cardBorderColor || DEFAULTS.cardBorderColor);
    document.documentElement.style.setProperty("--price-color", cfg.priceColor || DEFAULTS.priceColor);
    document.documentElement.style.setProperty("--old-price-color", cfg.oldPriceColor || DEFAULTS.oldPriceColor);
    document.documentElement.style.setProperty("--item-gap", `${Math.max(8, Math.round((Number(cfg.itemGap) || DEFAULTS.itemGap) * layoutScale))}px`);
    document.documentElement.style.setProperty("--card-height", `${requestedCardHeight}px`);
    document.documentElement.style.setProperty("--card-radius", `${Math.max(12, Math.round((Number(cfg.cardRadius) || DEFAULTS.cardRadius) * layoutScale))}px`);
    document.documentElement.style.setProperty("--card-padding-x", `${effectiveCardPaddingX}px`);
    document.documentElement.style.setProperty("--card-padding-y", `${effectiveCardPaddingY}px`);
    document.documentElement.style.setProperty("--footer-padding-x", `${footerPaddingX}px`);
    document.documentElement.style.setProperty("--footer-padding-y", `${footerPaddingY}px`);
    document.documentElement.style.setProperty("--title-offset-x", `${Math.max(0, Math.round((Number(cfg.titleOffsetX) || DEFAULTS.titleOffsetX) * layoutScale))}px`);
    document.documentElement.style.setProperty("--title-bottom-gap", `${titleBottomGap}px`);
    document.documentElement.style.setProperty("--top-row-height", `${topRowHeight}px`);
    document.documentElement.style.setProperty("--label-font-size", `${labelFontSize}px`);
    document.documentElement.style.setProperty("--arrow-font-size", `${arrowFontSize}px`);
    document.documentElement.style.setProperty("--time-font-size", `${timeFontSize}px`);
    document.documentElement.style.setProperty("--treatment-font-size", `${treatmentFontSize}px`);
    document.documentElement.style.setProperty("--price-font-size", `${priceFontSize}px`);
    document.documentElement.style.setProperty("--original-price-font-size", `${originalPriceFontSize}px`);
    document.documentElement.style.setProperty("--empty-font-size", `${emptyFontSize}px`);
    document.documentElement.style.setProperty("--price-gap", `${Math.max(0, Math.round((Number(cfg.priceGap) || DEFAULTS.priceGap) * layoutScale))}px`);
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
      group.appendChild(buildEmptyTickerText(cfg.emptyText || DEFAULTS.emptyText));
      tickerTrack.append(group);

      requestAnimationFrame(() => {
        const clone = group.cloneNode(true);
        tickerTrack.append(clone);

        const width = Math.ceil(group.getBoundingClientRect().width || 0);
        const speed = Math.max(25, Number(cfg.scrollSpeedPxPerSec) || DEFAULTS.scrollSpeedPxPerSec);
        const groupGap = Math.max(8, Number(cfg.itemGap) || DEFAULTS.itemGap);
        const safeWidth = Math.max(320, width + groupGap);
        const durationSec = Math.max(8, safeWidth / speed);
        applyTrackAnimation(direction, durationSec, safeWidth);
      });
      return;
    }

    for (const apt of appointments) {
      group.appendChild(buildCard(apt, fallbackImage, cfg));
    }

    tickerTrack.append(group);

    requestAnimationFrame(() => {
      tightenCardWidths(group);
      const clone = group.cloneNode(true);
      tickerTrack.append(clone);
      tightenCardWidths(clone);

      const width = Math.ceil(group.getBoundingClientRect().width || 0);
      const speed = Math.max(25, Number(cfg.scrollSpeedPxPerSec) || DEFAULTS.scrollSpeedPxPerSec);
      const groupGap = Math.max(8, Number(cfg.itemGap) || DEFAULTS.itemGap);
      const safeWidth = Math.max(320, width + groupGap);
      const durationSec = Math.max(8, safeWidth / speed);
      applyTrackAnimation(direction, durationSec, safeWidth);
    });
  }

  await loadSettings(true);
  if (document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch {}
  }
  await loadAppointments(true);
  restartAppointmentsTimer();

  setInterval(async () => {
    await loadSettings(false);
  }, 15000);

  window.addEventListener("resize", () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => render(), 120);
  });
}

main().catch(() => {});
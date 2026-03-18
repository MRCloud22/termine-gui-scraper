const BASE = "https://shop.beautykuppel-therme-badaibling.de";
const EURO = "\u20AC";

function stripTags(html) {
  return html.replace(/<[^>]*>/g, " ");
}

function decodeBasicEntities(text) {
  return text
    .replaceAll("&nbsp;", " ")
    .replaceAll("&euro;", EURO)
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#039;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

function toTwo(n) {
  return String(n).padStart(2, "0");
}

function weekdayDe(date) {
  const names = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  return names[date.getDay()];
}

function parseReservationCategoriesFromCategoryPage(html, baseUrl) {
  const categories = [];

  // Only take links from the left "Kategorien" nav (Reservierungen).
  const navMatch = html.match(
    /<nav class="category" aria-label="Kategorien">([\s\S]*?)<\/nav>/,
  );
  if (!navMatch) return categories;

  const navHtml = navMatch[1];
  const itemRe =
    /<a href="([^"]+)">\s*<div class="category__categories__category[\s\S]*?>\s*([\s\S]*?)\s*<\/div>\s*<\/a>/g;

  for (const m of navHtml.matchAll(itemRe)) {
    const href = m[1];
    const name = normalizeWhitespace(decodeBasicEntities(stripTags(m[2])));

    let url;
    try {
      url = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }

    const idMatch = url.match(/\/reservations\/category\/(\d+)\//);
    const categoryId = idMatch ? Number(idMatch[1]) : null;
    if (!categoryId || !Number.isFinite(categoryId)) continue;

    categories.push({ categoryId, name, url });
  }

  // De-dupe by id
  const byId = new Map();
  for (const c of categories) byId.set(c.categoryId, c);
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, "de"));
}

export async function fetchReservationCategories() {
  // This URL typically redirects to /reservations/category/<id>/; we use res.url to resolve relative links.
  const res = await fetch(`${BASE}/reservations/category/`, {
    headers: { "user-agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error(`categories: HTTP ${res.status}`);
  const html = await res.text();
  const baseUrl = res.url || `${BASE}/reservations/category/`;
  const categories = parseReservationCategoriesFromCategoryPage(html, baseUrl);
  if (!categories.length) {
    throw new Error("categories: could not parse left navigation (Kategorien)");
  }
  return categories;
}

export function formatDateDe(isoDate) {
  const d = new Date(`${isoDate}T00:00:00`);
  const dd = toTwo(d.getDate());
  const mm = toTwo(d.getMonth() + 1);
  const yyyy = d.getFullYear();
  return `${weekdayDe(d)}, ${dd}.${mm}.${yyyy}`;
}

export function enumerateIsoDates(startIso, endIso) {
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  const out = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear();
    const m = toTwo(d.getMonth() + 1);
    const day = toTwo(d.getDate());
    out.push(`${y}-${m}-${day}`);
  }
  return out;
}

function parseTreatmentsFromCategoryPage(html, category) {
  const treatments = [];
  const liRe =
    /<li class="article-wrapper[\s\S]*?data-ra-template-id="(\d+)"[\s\S]*?>([\s\S]*?)<\/li>/g;

  for (const match of html.matchAll(liRe)) {
    const templateId = Number(match[1]);
    const block = match[2];

    const href =
      block.match(/href="([^"]*\/reservations\/template\/\d+\/\?[^"]*)"/)?.[1] || "";
    const nameRaw = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] || "";
    const name = normalizeWhitespace(decodeBasicEntities(stripTags(nameRaw)));

    const durationMinutes = Number(
      normalizeWhitespace(
        stripTags(
          block.match(/<span class="duration__minutes[^"]*">([\s\S]*?)<\/span>/)?.[1] || "",
        ),
      ),
    );

    const priceNumber = normalizeWhitespace(
      decodeBasicEntities(
        stripTags(block.match(/<span class="article-price">([\s\S]*?)<\/span>/)?.[1] || ""),
      ),
    );
    const price = priceNumber ? `${EURO} ${priceNumber.replace(/[^0-9.,]/g, "").trim()}` : "";

    const imgSrc = block.match(/<img[^>]*src="([^"]+)"[^>]*>/)?.[1] || "";
    const imageUrl = imgSrc ? (imgSrc.startsWith("http") ? imgSrc : `${BASE}${imgSrc}`) : "";

    treatments.push({
      templateId,
      name,
      durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : null,
      price,
      imageUrl,
      templateUrl: href
        ? href.startsWith("http")
          ? href
          : `${BASE}${href}`
        : `${BASE}/reservations/template/${templateId}/`,
      categories: category ? [category] : [],
    });
  }

  return treatments;
}

export async function fetchTreatmentsFromAllReservationCategories({ throttleMs = 0 } = {}) {
  const categories = await fetchReservationCategories();

  const byTemplateId = new Map();
  for (const category of categories) {
    const res = await fetch(category.url, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`category ${category.categoryId}: HTTP ${res.status}`);
    const html = await res.text();

    const t = parseTreatmentsFromCategoryPage(html, category);
    for (const item of t) {
      const existing = byTemplateId.get(item.templateId);
      if (!existing) {
        byTemplateId.set(item.templateId, item);
        continue;
      }

      // Merge categories and prefer first non-empty image/price/duration.
      const mergedCats = [...(existing.categories || []), ...(item.categories || [])];
      const catById = new Map(mergedCats.map((c) => [c.categoryId, c]));
      existing.categories = Array.from(catById.values()).sort((a, b) =>
        a.name.localeCompare(b.name, "de"),
      );

      if (!existing.imageUrl && item.imageUrl) existing.imageUrl = item.imageUrl;
      if (!existing.price && item.price) existing.price = item.price;
      if (!existing.durationMinutes && item.durationMinutes) existing.durationMinutes = item.durationMinutes;
    }

    if (throttleMs > 0) {
      // Be gentle to the shop server when iterating categories.
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, throttleMs));
    }
  }

  const treatments = Array.from(byTemplateId.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "de"),
  );
  return { categories, treatments };
}

export async function fetchAvailabilityForDay(templateId, isoDate) {
  return fetchAvailabilityPage(templateId, isoDate, null);
}

export async function fetchAvailabilityPage(templateId, isoDate, nextCursorIso = null) {
  const d = new Date(`${isoDate}T00:00:00`);
  const params = new URLSearchParams({
    day: String(d.getDate()),
    month: String(d.getMonth() + 1),
    year: String(d.getFullYear()),
  });

  if (nextCursorIso) {
    const m = String(nextCursorIso).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (m) {
      params.set("day", String(Number(m[3])));
      params.set("month", String(Number(m[2])));
      params.set("year", m[1]);
      params.set("from", `${m[4]}:${m[5]}`);
      params.set("next", "1");
    }
  }

  const url = `${BASE}/reservations/template/${templateId}/availability/?${params.toString()}`;
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`availability ${templateId} ${isoDate}: HTTP ${res.status}`);
  return res.text();
}

export function parseAvailabilityNextCursor(html) {
  return (
    html.match(
      /reservation-availabilities__buttons__next[\s\S]*?data-time="([^"]+)"/,
    )?.[1] || null
  );
}

export function parseAvailabilitiesHtml(html) {
  const entries = [];
  const parts = html.split('<div class="divider"></div>');
  for (const part of parts) {
    if (!part.includes('class="availability')) continue;

    const from = part.match(/<div class="from h3">([^<]+)<\/div>/)?.[1]?.trim() || "";
    if (!from) continue;

    const nameRaw =
      part.match(/<div class="name[^"]*">[\s\S]*?<div>\s*([\s\S]*?)\s*<\/div>/)?.[1] || "";
    const name = normalizeWhitespace(decodeBasicEntities(stripTags(nameRaw)));

    const normalizePriceNumber = (raw) => {
      const value = String(raw || "").trim();
      if (!value) return "";
      return value.includes(",") ? value : value.replace(".", ",");
    };

    const hotDealPriceNumber =
      part.match(/class="[^"]*prices__new[^"]*"[^>]*>\s*(?:\u20AC|&euro;)\s*(?:&nbsp;|\u00a0)?\s*([0-9.,]+)/)?.[1] || "";
    const fallbackPriceNumber =
      part.match(/(?:\u20AC|&euro;)\s*(?:&nbsp;|\u00a0)?\s*([0-9.,]+)/)?.[1] || "";
    const priceNumber = hotDealPriceNumber || fallbackPriceNumber;
    const price = priceNumber ? `${EURO} ${normalizePriceNumber(priceNumber)}` : "";

    const originalPriceNumber =
      part.match(/class="[^"]*(?:prices__old|original-price)[^"]*"[^>]*>\s*(?:\u20AC|&euro;)\s*(?:&nbsp;|\u00a0)?\s*([0-9.,]+)/)?.[1] ||
      part.match(/<del[^>]*>\s*(?:\u20AC|&euro;)\s*(?:&nbsp;|\u00a0)?\s*([0-9.,]+)/)?.[1] ||
      null;
    const originalPrice = originalPriceNumber
      ? `${EURO} ${normalizePriceNumber(originalPriceNumber)}`
      : null;

    entries.push({
      time: from,
      treatmentName: name,
      price,
      originalPrice,
    });
  }
  return entries;
}

export function buildBookingUrl(templateId, isoDate, time) {
  const [hh, mm] = time.split(":").map((x) => x.trim());
  const d = new Date(`${isoDate}T00:00:00`);
  const day = toTwo(d.getDate());
  const month = toTwo(d.getMonth() + 1);
  const year = String(d.getFullYear());
  const hour = toTwo(Number(hh));
  const minute = toTwo(Number(mm));

  const params = new URLSearchParams({
    day,
    month,
    year,
    hour,
    minute,
    check: "1",
  });
  return `${BASE}/reservations/template/${templateId}/?${params.toString()}`;
}

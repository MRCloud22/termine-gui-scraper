const ITEMS_PER_PAGE = 6;

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

async function loadSettings() {
  try {
    const data = await fetchJson("../settings.json");
    return data?.list || data?.signage2 || data || {};
  } catch {
    return {};
  }
}

async function loadAppointments() {
  const data = await fetchJson("../appointments.json");
  if (!data?.success) throw new Error(data?.error || "Fehler beim Laden");
  return data.appointments || [];
}

function renderRows(rowsEl, appointments) {
  rowsEl.innerHTML = appointments
    .map((apt, idx) => {
      const key = `${apt.date}-${apt.time}-${idx}`;
      return `
        <div class="row" data-key="${escapeHtml(key)}">
          <div class="cell">${escapeHtml(apt.date || "")}</div>
          <div class="cell">${escapeHtml(apt.time || "")}</div>
          <div class="cell treatment">${escapeHtml(apt.treatment || "")}</div>
          <div class="cell priceContainer">
            <div class="price">${escapeHtml(apt.price || "")}</div>
            ${apt.originalPrice ? `<div class="originalPrice">${escapeHtml(apt.originalPrice)}</div>` : ""}
          </div>
          <div class="action">
            <a class="bookButton" href="${escapeHtml(apt.bookingUrl || "#")}" target="_blank" rel="noopener noreferrer">
              Buchen <span aria-hidden="true">›</span>
            </a>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderPagination(paginationEl, state) {
  const { totalPages, currentPage } = state;
  if (totalPages <= 1) {
    paginationEl.style.display = "none";
    paginationEl.innerHTML = "";
    return;
  }

  const buttons = [];
  buttons.push(
    `<button class="pageButton" data-page="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""} title="Vorherige Seite">‹</button>`,
  );
  for (let i = 1; i <= totalPages; i += 1) {
    buttons.push(
      `<button class="pageButton ${i === currentPage ? "activePage" : ""}" data-page="${i}">${i}</button>`,
    );
  }
  buttons.push(
    `<button class="pageButton" data-page="${currentPage + 1}" ${currentPage === totalPages ? "disabled" : ""} title="Naechste Seite">›</button>`,
  );

  paginationEl.style.display = "flex";
  paginationEl.innerHTML = buttons.join("");
}

function parseBoolParam(name) {
  const v = new URLSearchParams(window.location.search).get(name);
  return v === "true" || v === "1" || v === "yes";
}

async function main() {
  const hideTitle = parseBoolParam("noTitle");
  if (hideTitle) $("title").style.display = "none";

  const emptyEl = $("empty");
  const errorEl = $("error");
  const rowsEl = $("rows");
  const paginationEl = $("pagination");

  let settings = await loadSettings();
  let currentPage = 1;

  async function refresh() {
    try {
      errorEl.style.display = "none";
      emptyEl.style.display = "none";
      const appointments = await loadAppointments();
      const future = filterPastAppointments(appointments);

      const totalPages = Math.ceil(future.length / ITEMS_PER_PAGE) || 1;
      if (currentPage > totalPages) currentPage = 1;

      const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
      const visible = future.slice(startIndex, startIndex + ITEMS_PER_PAGE);

      if (!future.length) {
        emptyEl.textContent =
          settings.emptyStateText || settings.emptyText || "Aktuell sind keine freien Termine vorhanden.";
        emptyEl.style.display = "block";
      }

      renderRows(rowsEl, visible);
      renderPagination(paginationEl, { totalPages, currentPage });
    } catch (e) {
      errorEl.textContent = e?.message || "Verbindung fehlgeschlagen";
      errorEl.style.display = "block";
      rowsEl.innerHTML = "";
      paginationEl.style.display = "none";
    }
  }

  paginationEl.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-page]");
    if (!btn) return;
    const p = Number(btn.getAttribute("data-page"));
    if (!Number.isFinite(p) || p < 1) return;
    currentPage = p;
    window.scrollTo({ top: 0, behavior: "smooth" });
    refresh();
  });

  await refresh();
  setInterval(refresh, 60000);
  setInterval(async () => {
    settings = await loadSettings();
  }, 60000);
}

main().catch(() => {});


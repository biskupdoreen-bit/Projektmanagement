"use strict";

/* ---------- Konstanten ---------- */

const STORAGE_KEY = "pm-dashboard-state-v1";

const PROGRAM_ORDER = [
  "Programm NEUE ARBEIT",
  "Programm BETRIEBSKULTUR",
  "Programm SOUVERÄNE ORGANISATION",
  "Programm EXTERN KOMMUNIZIEREN",
  "SONSTIGES"
];

const STATUS_OPTIONS = ["⚪", "🟢", "🟡", "🔴", "✅"];
const STATUS_LABEL = {
  "⚪": "Nicht gestartet", "🟢": "Im Plan", "🟡": "Beobachtung",
  "🔴": "Kritisch", "✅": "Abgeschlossen"
};
const STATUS_COLOR = {
  "⚪": "var(--status-muted)", "🟢": "var(--status-good)", "🟡": "var(--status-warning)",
  "🔴": "var(--status-critical)", "✅": "var(--status-done)"
};
const PHASE_OPTIONS = ["", "Planung", "Implementierung", "HyperCare", "Abschluss", "Regelbetrieb"];
const BR_OPTIONS = ["Offen", "Ja", "Nein"];
const BR_STATUS_OPTIONS = ["–", "Informiert", "Beratung läuft", "Abgeschlossen"];
const RISK_OPTIONS = ["", "H", "M", "N"];
const BEREICH_SUGGESTIONS = [
  "GF", "GWI", "Inland", "IZ", "Kommunikation", "Organisation und Wissen",
  "Personal", "Stab Digitalisierung", "Studienwerk", "VS", "Finanzen und zentrale Dienste"
];

const TL_LABEL = { active: "durchgeführt", planned: "geplant", ongoing: "Daueraufgabe" };

const PROGRAM_SHORT = {
  "Programm NEUE ARBEIT": "Neue Arbeit",
  "Programm BETRIEBSKULTUR": "Betriebskultur",
  "Programm SOUVERÄNE ORGANISATION": "Souveräne Org.",
  "Programm EXTERN KOMMUNIZIEREN": "Extern Komm.",
  "SONSTIGES": "Sonstiges"
};

const SHEET_HEADERS = [
  "Programm", "Projektname", "Bereich", "Verantwortlich", "Status", "Phase",
  "Budget geplant", "Budget verbraucht", "PT Stab geplant", "PT Stab ist", "Externe PT",
  "BR-pflichtig", "BR-Status", "Risiko", "Meilenstein", "Meilenstein-Datum"
];

/* ---------- State ---------- */

let state = loadState();

function loadState() {
  let s;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    s = raw ? JSON.parse(raw) : structuredClone(SEED_DATA);
  } catch (e) {
    s = structuredClone(SEED_DATA);
  }
  s.meta.sheetUrl = s.meta.sheetUrl || "";
  s.meta.lastSync = s.meta.lastSync || "";
  return s;
}

function saveState() {
  state.meta.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function nextId(prefix, list) {
  let n = list.length + 1;
  while (list.some(x => x.id === `${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}

/* ---------- Google-Sheet-Anbindung (nur lesend) ---------- */

function slugify(s) {
  return (s || "").toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function parseCSV(text) {
  // Einfacher CSV-Parser mit Unterstuetzung fuer "..."-Felder (auch mit Kommas/Zeilenumbruechen).
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else if (c === '"') { inQuotes = true; }
    else if (c === ',') { row.push(field); field = ""; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === '\r') { /* ignore */ }
    else { field += c; }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).filter(r => r.some(v => v.trim() !== "")).map(r => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = (r[i] || "").trim());
    return obj;
  });
}

function normalizeProgram(raw) {
  const v = (raw || "").trim();
  const hit = PROGRAM_ORDER.find(p => p === v || p.toLowerCase() === v.toLowerCase());
  if (hit) return hit;
  const short = Object.entries(PROGRAM_SHORT).find(([, s]) => s.toLowerCase() === v.toLowerCase());
  if (short) return short[0];
  return PROGRAM_ORDER.includes(v) ? v : (v || "SONSTIGES");
}

function normalizeStatus(raw) {
  const v = (raw || "").trim();
  if (STATUS_OPTIONS.includes(v)) return v;
  const hit = Object.entries(STATUS_LABEL).find(([, label]) => label.toLowerCase() === v.toLowerCase());
  return hit ? hit[0] : "⚪";
}

function parseGermanNumber(raw) {
  const v = (raw || "").trim().replace(/[€\s]/g, "");
  if (v === "") return null;
  const normalized = v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
  const n = Number(normalized);
  return isNaN(n) ? null : n;
}

function normalizeBR(raw) {
  const v = (raw || "").trim();
  return BR_OPTIONS.includes(v) ? v : "Offen";
}
function normalizeBRStatus(raw) {
  const v = (raw || "").trim();
  return BR_STATUS_OPTIONS.includes(v) ? v : "–";
}
function normalizeRisk(raw) {
  const v = (raw || "").trim().toUpperCase();
  return RISK_OPTIONS.includes(v) ? v : "";
}

function rowsToProjects(rows) {
  const existingById = new Map(state.projects.map(p => [p.id, p]));
  return rows.map(r => {
    const name = r["Projektname"] || "";
    const id = slugify(name) || nextId("projekt", []);
    const prev = existingById.get(id);
    return {
      id,
      program: normalizeProgram(r["Programm"]),
      name,
      bereich: r["Bereich"] || "",
      verantwortlich: r["Verantwortlich"] || "",
      status: normalizeStatus(r["Status"]),
      phase: PHASE_OPTIONS.includes(r["Phase"]) ? r["Phase"] : "",
      budgetPlanned: parseGermanNumber(r["Budget geplant"]),
      budgetUsed: parseGermanNumber(r["Budget verbraucht"]),
      ptPlanned: parseGermanNumber(r["PT Stab geplant"]),
      ptActual: parseGermanNumber(r["PT Stab ist"]),
      externalPT: parseGermanNumber(r["Externe PT"]),
      brRequired: normalizeBR(r["BR-pflichtig"]),
      brStatus: normalizeBRStatus(r["BR-Status"]),
      risk: normalizeRisk(r["Risiko"]),
      milestone: r["Meilenstein"] || "",
      milestoneDate: r["Meilenstein-Datum"] || "",
      planStatus: prev ? prev.planStatus : "",
      timeline: prev ? prev.timeline : new Array(state.quarters.length).fill(null)
    };
  });
}

let sheetSyncError = "";

async function syncFromSheet(url, { silent } = {}) {
  const statusEl = document.getElementById("sheetSyncStatus");
  try {
    if (!silent && statusEl) statusEl.textContent = "Lade …";
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const rows = parseCSV(text);
    if (!rows.length) throw new Error("Keine Datenzeilen gefunden");
    state.projects = rowsToProjects(rows);
    state.meta.sheetUrl = url;
    state.meta.lastSync = new Date().toISOString();
    sheetSyncError = "";
    saveState();
    populateFilterOptions();
    renderAll();
    renderSheetPanel();
  } catch (err) {
    sheetSyncError = err.message || String(err);
    renderSheetPanel();
  }
}

function renderSheetPanel() {
  const statusEl = document.getElementById("sheetSyncStatus");
  const urlInput = document.getElementById("sheetUrlInput");
  if (!statusEl || !urlInput) return;
  urlInput.value = state.meta.sheetUrl || "";
  if (sheetSyncError) {
    statusEl.textContent = "Fehler: " + sheetSyncError;
    statusEl.style.color = "var(--status-critical)";
  } else if (state.meta.sheetUrl && state.meta.lastSync) {
    statusEl.textContent = "Zuletzt synchronisiert: " + new Date(state.meta.lastSync).toLocaleString("de-DE");
    statusEl.style.color = "var(--text-secondary)";
  } else {
    statusEl.textContent = "Nicht verbunden – Projekte sind lokal editierbar.";
    statusEl.style.color = "var(--text-secondary)";
  }
  document.getElementById("btnAddProject").disabled = !!state.meta.sheetUrl;
  document.getElementById("btnDisconnectSheet").hidden = !state.meta.sheetUrl;
}

document.getElementById("btnConnectSheet").addEventListener("click", () => {
  const url = document.getElementById("sheetUrlInput").value.trim();
  if (!url) { alert("Bitte zuerst den CSV-Link des veröffentlichten Google Sheets eintragen."); return; }
  syncFromSheet(url);
});
document.getElementById("btnRefreshSheet").addEventListener("click", () => {
  if (state.meta.sheetUrl) syncFromSheet(state.meta.sheetUrl);
});
document.getElementById("btnDisconnectSheet").addEventListener("click", () => {
  if (confirm("Verbindung zum Google Sheet trennen? Die Projekte bleiben in ihrem letzten Stand erhalten und sind wieder lokal editierbar.")) {
    state.meta.sheetUrl = "";
    state.meta.lastSync = "";
    saveState();
    renderSheetPanel();
    renderAll();
  }
});

/* ---------- Filters ---------- */

let filters = { program: "", bereich: "", status: "", risk: "", search: "" };

function filteredProjects() {
  return state.projects.filter(p => {
    if (filters.program && p.program !== filters.program) return false;
    if (filters.bereich && p.bereich !== filters.bereich) return false;
    if (filters.status && p.status !== filters.status) return false;
    if (filters.risk && p.risk !== filters.risk) return false;
    if (filters.search && !p.name.toLowerCase().includes(filters.search.toLowerCase())) return false;
    return true;
  });
}

/* ---------- Tooltip ---------- */

const tooltipEl = document.getElementById("tooltip");
function showTooltip(evt, html) {
  tooltipEl.innerHTML = html;
  tooltipEl.hidden = false;
  moveTooltip(evt);
}
function moveTooltip(evt) {
  tooltipEl.style.left = evt.clientX + "px";
  tooltipEl.style.top = evt.clientY + "px";
}
function hideTooltip() { tooltipEl.hidden = true; }

/* ---------- Formatting ---------- */

const fmtEUR = n => (n === null || n === undefined || n === "" || isNaN(n))
  ? "–" : Number(n).toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const fmtNum = n => (n === null || n === undefined || n === "") ? "–" : Number(n).toLocaleString("de-DE");

/* ---------- Render: KPIs ---------- */

function renderKPIs() {
  const list = filteredProjects();
  const count = key => list.filter(p => p.status === key).length;
  const sum = key => list.reduce((a, p) => a + (Number(p[key]) || 0), 0);
  const budgetPlanned = sum("budgetPlanned");
  const budgetUsed = sum("budgetUsed");
  const brOpen = list.filter(p => p.brRequired === "Ja" && p.brStatus !== "Abgeschlossen").length;
  const riskHigh = list.filter(p => p.risk === "H").length;

  const tiles = [
    { label: "Projekte gesamt", value: list.length },
    { label: "🟢 Im Plan", value: count("🟢"), accent: "good" },
    { label: "🟡 Beobachtung", value: count("🟡"), accent: "warning" },
    { label: "🔴 Kritisch", value: count("🔴"), accent: "critical" },
    { label: "⚪ Nicht gestartet", value: count("⚪") },
    { label: "✅ Abgeschlossen", value: count("✅") },
    { label: "Budget geplant Σ", value: fmtEUR(budgetPlanned) },
    { label: "Budget verbraucht Σ", value: fmtEUR(budgetUsed) },
    { label: "Restbudget Σ", value: fmtEUR(budgetPlanned - budgetUsed) },
    { label: "Risiko Hoch (H)", value: riskHigh, accent: riskHigh ? "critical" : "" },
    { label: "BR-Klärung offen", value: brOpen, accent: brOpen ? "warning" : "" }
  ];

  document.getElementById("kpiGrid").innerHTML = tiles.map(t => `
    <div class="kpi-tile ${t.accent ? "accent-" + t.accent : ""}">
      <div class="kpi-value">${t.value}</div>
      <div class="kpi-label">${t.label}</div>
    </div>`).join("");
}

/* ---------- Render: Status donut ---------- */

function renderStatusDonut() {
  const list = filteredProjects();
  const segments = STATUS_OPTIONS.map(s => ({
    key: s, label: `${s} ${STATUS_LABEL[s]}`, value: list.filter(p => p.status === s).length,
    color: STATUS_COLOR[s]
  })).filter(s => s.value > 0);

  const total = list.length;
  const host = document.getElementById("chartStatus");
  const legend = document.getElementById("legendStatus");

  if (total === 0) {
    host.innerHTML = `<p class="hint">Keine Projekte im aktuellen Filter.</p>`;
    legend.innerHTML = "";
    return;
  }

  const R = 70, SW = 26, C = 2 * Math.PI * R, gap = 3; // gap in px of arc length
  let acc = 0;
  const cx = 90, cy = 90;
  const arcs = segments.map(s => {
    const len = Math.max((s.value / total) * C - gap, 0);
    const dasharray = `${len} ${C - len}`;
    const dashoffset = -acc;
    acc += (s.value / total) * C;
    return `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${s.color}"
      stroke-width="${SW}" stroke-linecap="round"
      stroke-dasharray="${dasharray}" stroke-dashoffset="${dashoffset}"
      transform="rotate(-90 ${cx} ${cy})" data-key="${s.key}" data-value="${s.value}" data-label="${s.label}"></circle>`;
  }).join("");

  host.innerHTML = `
    <svg viewBox="0 0 180 180" width="100%" style="max-width:220px">
      ${arcs}
      <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="26" font-weight="700" fill="var(--text-primary)">${total}</text>
      <text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="11" fill="var(--text-secondary)">Projekte</text>
    </svg>`;

  host.querySelectorAll("circle").forEach(c => {
    c.addEventListener("mousemove", e => showTooltip(e, `${c.dataset.label}: <b>${c.dataset.value}</b>`));
    c.addEventListener("mouseleave", hideTooltip);
  });

  legend.innerHTML = segments.map(s => `
    <span class="legend-item"><span class="legend-swatch" style="background:${s.color}"></span>${s.label} (${s.value})</span>
  `).join("");
}

/* ---------- Render: Budget bar chart ---------- */

function renderBudgetChart() {
  const list = filteredProjects();
  const host = document.getElementById("chartBudget");
  const legend = document.getElementById("legendBudget");

  const perProgram = PROGRAM_ORDER.map(prog => {
    const items = list.filter(p => p.program === prog);
    return {
      program: prog.replace(/^Programm\s+/, ""),
      programShort: PROGRAM_SHORT[prog] || prog,
      planned: items.reduce((a, p) => a + (Number(p.budgetPlanned) || 0), 0),
      used: items.reduce((a, p) => a + (Number(p.budgetUsed) || 0), 0)
    };
  });

  const maxVal = Math.max(1, ...perProgram.map(d => Math.max(d.planned, d.used)));
  const total = perProgram.reduce((a, d) => a + d.planned + d.used, 0);

  if (total === 0) {
    host.innerHTML = `<p class="hint">Noch keine Budgetdaten erfasst – bitte in der Tabelle unten ergänzen.</p>`;
    legend.innerHTML = "";
    return;
  }

  const W = 640, H = 260, padL = 60, padB = 60, padT = 14, padR = 10;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const bandW = plotW / perProgram.length;
  const barW = Math.min(30, bandW * 0.28);
  const yScale = v => plotH - (v / maxVal) * plotH;
  const niceStep = Math.ceil(maxVal / 4 / 1000) * 1000 || 1;

  let gridlines = "";
  for (let v = 0; v <= maxVal; v += niceStep) {
    const y = padT + yScale(v);
    gridlines += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--gridline)" stroke-width="1"/>
      <text x="${padL - 8}" y="${y + 3}" text-anchor="end" font-size="9" fill="var(--text-muted)">${(v/1000).toLocaleString("de-DE")}k</text>`;
  }

  let bars = "";
  perProgram.forEach((d, i) => {
    const bx = padL + i * bandW + bandW / 2;
    const hPlanned = (d.planned / maxVal) * plotH;
    const hUsed = (d.used / maxVal) * plotH;
    bars += `<rect x="${bx - barW - 2}" y="${padT + plotH - hPlanned}" width="${barW}" height="${hPlanned}" rx="4" fill="var(--series-1)"
      data-label="${d.program} – geplant" data-value="${d.planned}"></rect>`;
    bars += `<rect x="${bx + 2}" y="${padT + plotH - hUsed}" width="${barW}" height="${hUsed}" rx="4" fill="var(--series-2)"
      data-label="${d.program} – verbraucht" data-value="${d.used}"></rect>`;
    bars += `<text x="${bx}" y="${H - padB + 16}" text-anchor="end" font-size="10" fill="var(--text-secondary)"
      transform="rotate(-25 ${bx} ${H - padB + 16})">${d.programShort}</text>`;
  });

  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px">
    ${gridlines}
    <line x1="${padL}" y1="${padT + plotH}" x2="${W - padR}" y2="${padT + plotH}" stroke="var(--baseline)" stroke-width="1"/>
    ${bars}
  </svg>`;

  host.querySelectorAll("rect").forEach(r => {
    r.addEventListener("mousemove", e => showTooltip(e, `${r.dataset.label}: <b>${fmtEUR(r.dataset.value)}</b>`));
    r.addEventListener("mouseleave", hideTooltip);
  });

  legend.innerHTML = `
    <span class="legend-item"><span class="legend-swatch" style="background:var(--series-1)"></span>geplant</span>
    <span class="legend-item"><span class="legend-swatch" style="background:var(--series-2)"></span>verbraucht</span>`;
}

/* ---------- Render: Table ---------- */

function selectHtml(id, options, current, labelFn, disabled) {
  return `<select data-field="${id}" ${disabled ? "disabled" : ""}>` +
    options.map(o => `<option value="${o}" ${o === current ? "selected" : ""}>${labelFn ? labelFn(o) : (o || "–")}</option>`).join("") +
    `</select>`;
}

function renderTable() {
  const list = filteredProjects();
  const container = document.getElementById("tableContainer");
  const readOnly = !!state.meta.sheetUrl;
  const dis = readOnly ? "disabled" : "";

  let rows = "";
  PROGRAM_ORDER.forEach(prog => {
    const items = list.filter(p => p.program === prog);
    if (items.length === 0) return;
    rows += `<tr class="group-row"><td colspan="15">${prog}</td></tr>`;
    items.forEach(p => {
      const rest = (p.budgetPlanned !== null && p.budgetPlanned !== "" && p.budgetUsed !== null && p.budgetUsed !== "")
        ? Number(p.budgetPlanned) - Number(p.budgetUsed) : null;
      rows += `<tr data-id="${p.id}">
        <td>${p.name}</td>
        <td>
          <input type="text" data-field="bereich" value="${p.bereich || ""}" placeholder="Bereich" style="width:170px;margin-bottom:2px" ${dis}>
          <input type="text" data-field="verantwortlich" value="${p.verantwortlich || ""}" placeholder="Verantwortlich" style="width:170px" ${dis}>
        </td>
        <td>${selectHtml("status", STATUS_OPTIONS, p.status, null, readOnly)}</td>
        <td>${selectHtml("phase", PHASE_OPTIONS, p.phase, v => v || "–", readOnly)}</td>
        <td class="num"><input type="number" data-field="budgetPlanned" value="${p.budgetPlanned ?? ""}" style="width:90px" placeholder="€" ${dis}></td>
        <td class="num"><input type="number" data-field="budgetUsed" value="${p.budgetUsed ?? ""}" style="width:90px" placeholder="€" ${dis}></td>
        <td class="num">${fmtEUR(rest)}</td>
        <td class="num"><input type="number" data-field="ptPlanned" value="${p.ptPlanned ?? ""}" style="width:60px" ${dis}></td>
        <td class="num"><input type="number" data-field="ptActual" value="${p.ptActual ?? ""}" style="width:60px" ${dis}></td>
        <td class="num"><input type="number" data-field="externalPT" value="${p.externalPT ?? ""}" style="width:60px" ${dis}></td>
        <td>${selectHtml("brRequired", BR_OPTIONS, p.brRequired, null, readOnly)}</td>
        <td>${selectHtml("brStatus", BR_STATUS_OPTIONS, p.brStatus, null, readOnly)}</td>
        <td>${selectHtml("risk", RISK_OPTIONS, p.risk, v => v || "–", readOnly)}</td>
        <td>
          <input type="text" data-field="milestone" value="${p.milestone || ""}" placeholder="Meilenstein" style="width:130px;margin-bottom:2px" ${dis}>
          <input type="date" data-field="milestoneDate" value="${p.milestoneDate || ""}" style="width:130px" ${dis}>
        </td>
        <td class="row-actions">${readOnly ? "" : `<button data-action="delete" title="Projekt löschen">🗑</button>`}</td>
      </tr>`;
    });
  });

  container.innerHTML = `
    ${readOnly ? `<p class="hint">Diese Tabelle wird aus dem verknüpften Google Sheet geladen und ist hier nur lesbar. Bearbeitet die Werte im Sheet und klickt oben auf „Jetzt aktualisieren".</p>` : ""}
    <div class="table-scroll"><table>
    <thead><tr>
      <th>Projektname</th><th>Bereich / Verantwortlich</th><th>Status</th><th>Phase</th>
      <th>Budget geplant</th><th>Budget verbraucht</th><th>Restprognose</th>
      <th>PT Stab geplant</th><th>PT Stab ist</th><th>Externe PT</th>
      <th>BR-pflichtig</th><th>BR-Status</th><th>Risiko</th><th>Meilenstein</th><th></th>
    </tr></thead>
    <tbody>${rows || `<tr><td colspan="15" class="hint">Keine Projekte im aktuellen Filter.</td></tr>`}</tbody>
  </table></div>`;

  if (readOnly) return;

  container.querySelectorAll("tbody tr[data-id]").forEach(tr => {
    const id = tr.dataset.id;
    tr.querySelectorAll("[data-field]").forEach(input => {
      input.addEventListener("change", () => {
        const project = state.projects.find(p => p.id === id);
        let v = input.value;
        if (input.type === "number") v = v === "" ? null : Number(v);
        project[input.dataset.field] = v;
        saveState();
        // Defer: rebuilding the table synchronously inside a change/blur
        // handler on one of its own inputs throws a DOM removal error.
        setTimeout(renderAll, 0);
      });
    });
    tr.querySelector('[data-action="delete"]').addEventListener("click", () => {
      const project = state.projects.find(p => p.id === id);
      if (confirm(`Projekt "${project.name}" wirklich löschen?`)) {
        state.projects = state.projects.filter(p => p.id !== id);
        saveState();
        renderAll();
      }
    });
  });
}

/* ---------- Render: Gantt ---------- */

function renderGantt() {
  const list = filteredProjects();
  const container = document.getElementById("ganttContainer");
  const quarters = state.quarters;

  const years = [...new Set(quarters.map(q => q.split("-")[0]))];
  const yearHeader = years.map(y => `<th colspan="4">${y}</th>`).join("");
  const qHeader = quarters.map(q => `<th class="qtr">${q.split("-")[1]}</th>`).join("");

  let rows = "";
  PROGRAM_ORDER.forEach(prog => {
    const items = list.filter(p => p.program === prog);
    if (items.length === 0) return;
    rows += `<tr class="group-row"><td colspan="${quarters.length + 1}">${prog}</td></tr>`;
    items.forEach(p => {
      const cells = p.timeline.map(cellState => {
        const cls = cellState ? `cell-${cellState}` : "";
        const title = cellState ? TL_LABEL[cellState] : "";
        return `<td class="${cls}" data-title="${title ? p.name + ": " + title : ""}"></td>`;
      }).join("");
      rows += `<tr><td class="name-cell">${p.name}</td>${cells}</tr>`;
    });
  });

  container.innerHTML = `<table class="gantt-table">
    <thead>
      <tr><th></th>${yearHeader}</tr>
      <tr><th></th>${qHeader}</tr>
    </thead>
    <tbody>${rows || `<tr><td class="hint">Keine Projekte im aktuellen Filter.</td></tr>`}</tbody>
  </table>`;

  container.querySelectorAll("td[data-title]").forEach(td => {
    if (!td.dataset.title) return;
    td.addEventListener("mousemove", e => showTooltip(e, td.dataset.title));
    td.addEventListener("mouseleave", hideTooltip);
  });
}

/* ---------- Render: Changelog ---------- */

function renderChangelog() {
  const container = document.getElementById("changelogContainer");
  const sorted = [...state.changelog].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  container.innerHTML = sorted.map(c => `
    <div class="changelog-item">
      <div class="meta">${c.date ? new Date(c.date).toLocaleDateString("de-DE") : ""} · ${c.author}
        <button data-id="${c.id}" data-action="delete-change" style="float:right;background:none;border:none;color:var(--status-critical);cursor:pointer">löschen</button>
      </div>
      <div class="what">${c.what}</div>
      ${c.note ? `<div class="note">${c.note}</div>` : ""}
    </div>`).join("") || `<p class="hint">Noch keine Einträge.</p>`;

  container.querySelectorAll('[data-action="delete-change"]').forEach(btn => {
    btn.addEventListener("click", () => {
      state.changelog = state.changelog.filter(c => c.id !== btn.dataset.id);
      saveState();
      renderChangelog();
    });
  });
}

document.getElementById("changeForm").addEventListener("submit", e => {
  e.preventDefault();
  state.changelog.push({
    id: nextId("chg", state.changelog),
    date: document.getElementById("changeDate").value,
    author: document.getElementById("changeAuthor").value,
    what: document.getElementById("changeWhat").value,
    note: document.getElementById("changeNote").value
  });
  saveState();
  e.target.reset();
  renderChangelog();
});

/* ---------- Filter bar setup ---------- */

function populateFilterOptions() {
  const progSel = document.getElementById("filterProgram");
  progSel.innerHTML = `<option value="">Alle Programme</option>` +
    PROGRAM_ORDER.map(p => `<option value="${p}">${p}</option>`).join("");

  const bereiche = [...new Set(state.projects.map(p => p.bereich).filter(Boolean))].sort();
  document.getElementById("filterBereich").innerHTML = `<option value="">Alle Bereiche</option>` +
    bereiche.map(b => `<option value="${b}">${b}</option>`).join("");
}

document.getElementById("filterProgram").addEventListener("change", e => { filters.program = e.target.value; renderAll(); });
document.getElementById("filterBereich").addEventListener("change", e => { filters.bereich = e.target.value; renderAll(); });
document.getElementById("filterStatus").addEventListener("change", e => { filters.status = e.target.value; renderAll(); });
document.getElementById("filterRisk").addEventListener("change", e => { filters.risk = e.target.value; renderAll(); });
document.getElementById("filterSearch").addEventListener("input", e => { filters.search = e.target.value; renderAll(); });

/* ---------- Tabs ---------- */

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => { t.classList.remove("active"); t.setAttribute("aria-selected", "false"); });
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    tab.setAttribute("aria-selected", "true");
    document.getElementById("tab-" + tab.dataset.tab).classList.add("active");
  });
});

/* ---------- Header meta ---------- */

function renderMeta() {
  document.getElementById("dashTitle").textContent = state.meta.title || "Multiprojekt-Dashboard";
  document.getElementById("sourceText").textContent = state.meta.source || "";
  document.getElementById("dataDate").value = state.meta.dataDate || "";
}
document.getElementById("dataDate").addEventListener("change", e => {
  state.meta.dataDate = e.target.value;
  saveState();
});

/* ---------- Add project modal ---------- */

document.getElementById("btnAddProject").addEventListener("click", () => {
  const modalRoot = document.getElementById("modalRoot");
  modalRoot.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal">
        <h2>Neues Projekt anlegen</h2>
        <form id="addProjectForm">
          <div class="field-grid">
            <div class="field full">
              <label>Projektname *</label>
              <input type="text" name="name" required>
            </div>
            <div class="field full">
              <label>Programm *</label>
              <select name="program" required>${PROGRAM_ORDER.map(p => `<option value="${p}">${p}</option>`).join("")}</select>
            </div>
            <div class="field">
              <label>Bereich</label>
              <input type="text" name="bereich" list="bereichList">
              <datalist id="bereichList">${BEREICH_SUGGESTIONS.map(b => `<option value="${b}">`).join("")}</datalist>
            </div>
            <div class="field">
              <label>Verantwortliche Person</label>
              <input type="text" name="verantwortlich">
            </div>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn" id="cancelAdd">Abbrechen</button>
            <button type="submit" class="btn btn-primary">Anlegen</button>
          </div>
        </form>
      </div>
    </div>`;

  modalRoot.querySelector("#cancelAdd").addEventListener("click", () => modalRoot.innerHTML = "");
  modalRoot.querySelector(".modal-backdrop").addEventListener("click", e => { if (e.target.classList.contains("modal-backdrop")) modalRoot.innerHTML = ""; });
  modalRoot.querySelector("#addProjectForm").addEventListener("submit", e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const id = (fd.get("name") || "neu").toLowerCase().replace(/[^a-z0-9äöüß]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Date.now().toString(36);
    state.projects.push({
      id, program: fd.get("program"), name: fd.get("name"),
      bereich: fd.get("bereich") || "", verantwortlich: fd.get("verantwortlich") || "",
      status: "⚪", phase: "", budgetPlanned: null, budgetUsed: null,
      ptPlanned: null, ptActual: null, externalPT: null,
      brRequired: "Offen", brStatus: "–", risk: "", milestone: "", milestoneDate: "",
      planStatus: "", timeline: new Array(state.quarters.length).fill(null)
    });
    saveState();
    modalRoot.innerHTML = "";
    populateFilterOptions();
    renderAll();
  });
});

/* ---------- Export / Import / Reset ---------- */

document.getElementById("btnExport").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url; a.download = `projekt-dashboard-daten-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("btnImport").addEventListener("click", () => document.getElementById("fileImport").click());
document.getElementById("fileImport").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.projects || !Array.isArray(data.projects)) throw new Error("Ungültiges Format");
      if (confirm("Aktuelle Daten durch die importierte Datei ersetzen?")) {
        state = data;
        saveState();
        populateFilterOptions();
        renderAll();
      }
    } catch (err) {
      alert("Import fehlgeschlagen: " + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});

document.getElementById("btnReset").addEventListener("click", () => {
  if (confirm("Alle Änderungen verwerfen und auf die Vorlage aus der Excel-Datei zurücksetzen?")) {
    state = structuredClone(SEED_DATA);
    saveState();
    populateFilterOptions();
    renderAll();
  }
});

/* ---------- Init ---------- */

function renderAll() {
  renderKPIs();
  renderStatusDonut();
  renderBudgetChart();
  renderTable();
  renderGantt();
}

populateFilterOptions();
renderMeta();
renderAll();
renderChangelog();
renderSheetPanel();
document.getElementById("changeDate").value = new Date().toISOString().slice(0, 10);

if (state.meta.sheetUrl) {
  syncFromSheet(state.meta.sheetUrl, { silent: true });
  setInterval(() => { if (state.meta.sheetUrl) syncFromSheet(state.meta.sheetUrl, { silent: true }); }, 5 * 60 * 1000);
}

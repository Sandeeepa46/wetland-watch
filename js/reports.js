/* 
   reports.js — localStorage persistence, reports panel,
                CSV export, stat refresh
 */

const STORAGE_KEY = 'wetlandwatch_reports_v1';

//  CRUD //
function saveReport(report) {
  const all = getAllReports();
  // Avoid exact duplicates (same id) before pushing
  const exists = all.some(r => r.id === report.id);
  if (!exists) all.push(report);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

function getAllReports() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

function clearAllReports() {
  localStorage.removeItem(STORAGE_KEY);
}

//  Reports panel //
let activeFilter = 'all';

function openReportsPanel() {
  const panel = document.getElementById('reportsPanel');
  const drawer = document.getElementById('drawer');
  if (panel)  panel.classList.add('open');
  if (drawer) drawer.classList.remove('open');
  renderReportCards();
}

function closeReportsPanel() {
  const panel = document.getElementById('reportsPanel');
  if (panel) panel.classList.remove('open');
}

function setFilter(type) {
  activeFilter = type;
  document.querySelectorAll('.filter-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.filter === type);
  });
  renderReportCards();
}

function renderReportCards() {
  const body = document.getElementById('rp-body');
  if (!body) return;

  let reports = getAllReports();
  if (activeFilter !== 'all')
    reports = reports.filter(r => r.type === activeFilter);

  reports = reports.sort((a, b) => {
    // Newest first — prefer timestamp field; fall back to id
    const ta = new Date(a.timestamp || 0).getTime() || a.id || 0;
    const tb = new Date(b.timestamp || 0).getTime() || b.id || 0;
    return tb - ta;
  });

  if (reports.length === 0) {
    body.className = 'rp-body empty';
    body.innerHTML =
      '<div class="empty-icon">&#128235;</div>' +
      '<div>No reports yet</div>' +
      '<div style="font-size:12px;color:var(--dim2)">Click anywhere in Western Province to start.</div>';
    return;
  }

  body.className = 'rp-body';
  body.innerHTML = reports.map(r => {
    const color = (ENCROACH_COLORS && ENCROACH_COLORS[r.type]) || '#94a3b8';
    const dateStr = r.date || (r.timestamp ? r.timestamp.slice(0, 10) : '—');
    const onWetlandBadge = r.onWetland
      ? `<span style="font-size:10px;color:#4ade80;margin-left:4px">&#127807; on wetland</span>`
      : `<span style="font-size:10px;color:#fbbf24;margin-left:4px">&#128205; outside polygon</span>`;
    const sourceTag = r.source === 'sheet'
      ? `<span style="font-size:10px;color:#60a5fa;margin-left:4px">&#9729; live</span>`
      : '';

    return `<div class="report-card" onclick="focusReport('${r.id}')">
      <div class="rc-header">
        <div class="rc-dot" style="background:${color}"></div>
        <div style="flex:1">
          <div class="rc-title">${escHtml(r.name || 'Unnamed area')} ${onWetlandBadge} ${sourceTag}</div>
          <div class="rc-meta">${escHtml(r.gnDivision || 'Unknown GN')}</div>
        </div>
        <span class="rc-type-badge">${escHtml(r.type || '—')}</span>
      </div>
      ${r.description
        ? `<div class="rc-desc">${escHtml(r.description.slice(0, 100))}${r.description.length > 100 ? '…' : ''}</div>`
        : ''}
      <div class="rc-footer">
        <span class="rc-date">&#128197; ${escHtml(dateStr)}</span>
        ${r.lat
          ? `<span class="rc-locate" onclick="event.stopPropagation();flyToReport(${r.lat},${r.lng})">&#128205; Show on map</span>`
          : ''}
      </div>
    </div>`;
  }).join('');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function focusReport(id) {
  const report = getAllReports().find(r => String(r.id) === String(id));
  if (!report || !report.lat) return;
  flyToReport(report.lat, report.lng);
}

function flyToReport(lat, lng) {
  map.flyTo([lat, lng], 16, { duration: 1.2 });
  closeReportsPanel();
}

// ── Refresh all counters / badges ─────────────────
function refreshReportStats() {
  const all     = getAllReports();
  const total   = all.length;
  const wetland = all.filter(r => r.onWetland).length;
  const other   = all.filter(r => !r.onWetland).length;

  // Reports panel footer
  _setText('rp-total',   total);
  _setText('rp-wetland', wetland);
  _setText('rp-other',   other);

  // Sidebar stat pill
  _setText('reports-count-badge-sb', total);

  // Top-bar badge (red circle)
  _setText('reports-count-badge', total);

  // Layer toggle count
  _setText('reports-count-layer', total);

  // Re-render if panel is open
  const panel = document.getElementById('reportsPanel');
  if (panel && panel.classList.contains('open')) renderReportCards();
}

function _setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── Export CSV ────────────────────────────────────
function exportCSV() {
  const reports = getAllReports();
  if (!reports.length) { showToast('No reports to export yet', true); return; }

  const headers = [
    'ID','Name','GN Division','Encroachment Type',
    'Description','Date','Latitude','Longitude','On Wetland','Submitted At','Source'
  ];
  const rows = reports.map(r => [
    r.id,
    csvField(r.name),
    csvField(r.gnDivision),
    csvField(r.type),
    csvField(r.description),
    csvField(r.date),
    r.lat  || '',
    r.lng  || '',
    r.onWetland ? 'Yes' : 'No',
    csvField(r.timestamp),
    csvField(r.source)
  ]);

  const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
  const a   = document.createElement('a');
  a.href     = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = 'wetlandwatch_reports.csv';
  a.click();
  showToast('&#128229; Reports exported as CSV');
}

function csvField(v) {
  if (v == null) return '';
  const s = String(v).replace(/"/g, '""');
  return /[,"\n]/.test(s) ? `"${s}"` : s;
}

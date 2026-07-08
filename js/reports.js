/* 
   reports.js — localStorage persistence, reports panel
*/

const STORAGE_KEY = 'wetlandwatch_reports_v1';

// CRUD //
function saveReport(report) {
  const all = getAllReports();
  all.push(report);
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

// Restore markers on page load //
function restoreReportMarkers() {
  const reports = getAllReports();
  reports.forEach(r => addReportMarker(r));
  refreshReportStats();
}

//  Reports panel //
let activeFilter = 'all';

function openReportsPanel() {
  document.getElementById('reportsPanel').classList.add('open');
  document.getElementById('drawer').classList.remove('open');
  renderReportCards();
}

function closeReportsPanel() {
  document.getElementById('reportsPanel').classList.remove('open');
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
  let reports = getAllReports();

  if (activeFilter !== 'all')
    reports = reports.filter(r => r.type === activeFilter);

  // Sort newest first //
  reports = reports.sort((a, b) => b.id - a.id);

  if (reports.length === 0) {
    body.className = 'rp-body empty';
    body.innerHTML = '<div class="empty-icon">📭</div><div>No reports yet.</div><div style="font-size:11px;color:var(--dim2)">Click anywhere in Western Province on the map to start reporting.</div>';
    return;
  }

  body.className = 'rp-body';
  body.innerHTML = reports.map(r => {
    const color = ENCROACH_COLORS[r.type] || '#94a3b8';
    const dateStr = r.date || r.timestamp?.slice(0, 10) || '—';
    const onWetlandBadge = r.onWetland
      ? `<span style="font-size:10px;color:#4ade80;margin-left:4px">🌿 on wetland</span>`
      : `<span style="font-size:10px;color:#fbbf24;margin-left:4px">📍 outside polygon</span>`;

    return `<div class="report-card" onclick="focusReport(${r.id})">
      <div class="rc-header">
        <div class="rc-dot" style="background:${color}"></div>
        <div style="flex:1">
          <div class="rc-title">${r.name || 'Unnamed area'} ${onWetlandBadge}</div>
          <div class="rc-meta">${r.gnDivision || 'Unknown GN'}</div>
        </div>
        <span class="rc-type-badge">${r.type}</span>
      </div>
      ${r.description ? `<div class="rc-desc">${r.description}</div>` : ''}
      <div class="rc-footer">
        <span class="rc-date">📅 ${dateStr}</span>
        ${r.lat ? `<span class="rc-locate" onclick="event.stopPropagation();flyToReport(${r.lat},${r.lng})">📍 Show on map</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

function focusReport(id) {
  const report = getAllReports().find(r => r.id === id);
  if (!report || !report.lat) return;
  flyToReport(report.lat, report.lng);
  highlightReportOnPanel(id);
}

function flyToReport(lat, lng) {
  map.flyTo([lat, lng], 16, { duration: 1.2 });
  closeReportsPanel();
}

function highlightReportOnPanel(id) {
  document.querySelectorAll('.report-card').forEach((c, i) => {
    c.style.borderColor = '';
  });
}

function refreshReportStats() {
  const all = getAllReports();
  document.getElementById('rp-total').textContent = all.length;
  document.getElementById('rp-wetland').textContent = all.filter(r => r.onWetland).length;
  document.getElementById('rp-other').textContent = all.filter(r => !r.onWetland).length;
  // Update sidebar badge
  const badge = document.getElementById('reports-count-badge');
  if (badge) badge.textContent = all.length;
}

//  Export CSV //
function exportCSV() {
  const reports = getAllReports();
  if (!reports.length) { showToast('No reports to export yet', true); return; }
  const headers = ['ID', 'Name', 'GN Division', 'Encroachment Type', 'Description', 'Date', 'Latitude', 'Longitude', 'On Wetland', 'Submitted At'];
  const rows = reports.map(r => [
    r.id, r.name || '', r.gnDivision || '', r.type || '',
    (r.description || '').replace(/,/g, ';'),
    r.date || '', r.lat || '', r.lng || '',
    r.onWetland ? 'Yes' : 'No', r.timestamp || ''
  ]);
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = 'wetlandwatch_reports.csv';
  a.click();
  showToast('✅ Reports exported as CSV');
}

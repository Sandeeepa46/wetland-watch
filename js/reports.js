/* reports.js — Complete Unified Google Forms Synchronization Engine
*/

const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRMWIbtU1mZTUQI6OBVIPl_eAplNdDGbCCEUl1vYzV_6Ef-Ne325oh9e0CE20wKGWxHbEeA6uv7_NUa/pub?gid=773411622&single=true&output=csv";

let liveReportsDatabase = [];
let activeFilter = 'all';

function getAllReports() {
  return liveReportsDatabase;
}

/**
 * Streams, validates, and plots historical database rows from the Google Sheet
 */
async function restoreReportMarkers() {
  if (!GOOGLE_SHEET_CSV_URL) {
    console.warn("Google Sheet URL is unconfigured.");
    return;
  }

  try {
    const response = await fetch(GOOGLE_SHEET_CSV_URL);
    const csvData = await response.text();
    
    if (typeof reportMarkersLayer !== 'undefined' && reportMarkersLayer) {
      reportMarkersLayer.clearLayers();
    }
    liveReportsDatabase = [];

    const lines = csvData.split('\n');
    if (lines.length <= 1) return; 

    const rows = lines.slice(1);

    rows.forEach((row, index) => {
      if (!row.trim()) return;

      // Safe CSV regex parser
      const columns = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);

      const report = {
        id:          "sheet-" + (index + 1),
        timestamp:   columns[0] ? columns[0].replace(/"/g, '').trim() : '',
        name:        columns[1] ? columns[1].replace(/"/g, '').trim() : 'Unnamed area',
        gnDivision:  columns[2] ? columns[2].replace(/"/g, '').trim() : 'Unknown GN',
        coordsRaw:   columns[3] ? columns[3].replace(/"/g, '').trim() : '', 
        type:        columns[4] ? columns[4].replace(/"/g, '').trim() : 'Other',
        description: columns[5] ? columns[5].replace(/"/g, '').trim() : '',
        date:        columns[6] ? columns[6].replace(/"/g, '').trim() : ''
      };

      if (report.coordsRaw && report.coordsRaw.includes(',')) {
        const splitPair = report.coordsRaw.split(',');
        report.lat = parseFloat(splitPair[0]);
        report.lng = parseFloat(splitPair[1]);
      }

      if (report.lat && report.lng && !isNaN(report.lat) && !isNaN(report.lng)) {
        // Calculate point-in-polygon verification check
        const checkPoint = L.latLng(report.lat, report.lng);
        let pointIntersectsWetland = false;

        if (typeof wetlandLayer !== 'undefined' && wetlandLayer) {
          wetlandLayer.eachLayer(layer => {
            if (layer.getBounds() && layer.getBounds().contains(checkPoint)) {
              pointIntersectsWetland = true;
            }
          });
        }
        report.onWetland = pointIntersectsWetland;

        liveReportsDatabase.push(report);
        
        if (typeof addReportMarker === 'function') {
          addReportMarker(report);
        }
      }
    });

    refreshReportStats();
    if (document.getElementById('reportsPanel').classList.contains('open')) {
      renderReportCards();
    }

  } catch (error) {
    console.error("Critical error fetching live crowdsourced responses:", error);
  }
}

/**
 * NEW FUNCTION: Captures a fresh submission locally, processes polygon math,
 * and forces a node point marker directly onto the map instantly.
 */
function saveReport(newReport) {
  // Set a runtime dynamic id assignment 
  newReport.id = "local-" + Date.now();
  
  const checkPoint = L.latLng(newReport.lat, newReport.lng);
  let pointIntersectsWetland = false;

  if (typeof wetlandLayer !== 'undefined' && wetlandLayer) {
    wetlandLayer.eachLayer(layer => {
      if (layer.getBounds() && layer.getBounds().contains(checkPoint)) {
        pointIntersectsWetland = true;
      }
    });
  }
  newReport.onWetland = pointIntersectsWetland;

  // Insert instantly into user view layers
  liveReportsDatabase.push(newReport);
  
  if (typeof addReportMarker === 'function') {
    addReportMarker(newReport);
  }
  
  refreshReportStats();
  if (document.getElementById('reportsPanel').classList.contains('open')) {
    renderReportCards();
  }
}

// Reports view panel UI configurations //
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
  let reports = [...liveReportsDatabase];

  if (activeFilter !== 'all') {
    reports = reports.filter(r => r.type === activeFilter);
  }

  reports = reports.sort((a, b) => b.id - a.id);

  if (reports.length === 0) {
    body.className = 'rp-body empty';
    body.innerHTML = '<div class="empty-icon">📭</div><div>No reports yet.</div>';
    return;
  }

  body.className = 'rp-body';
  body.innerHTML = reports.map(r => {
    const color = (typeof ENCROACH_COLORS !== 'undefined' ? ENCROACH_COLORS[r.type] : null) || '#94a3b8';
    const dateStr = r.date || r.timestamp?.slice(0, 10) || '—';
    const onWetlandBadge = r.onWetland
      ? `<span style="font-size:10px;color:#4ade80;margin-left:4px">🌿 on wetland</span>`
      : `<span style="font-size:10px;color:#fbbf24;margin-left:4px">📍 outside polygon</span>`;

    return `<div class="report-card" onclick="focusReport('${r.id}')">
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
      </div>
    </div>`;
  }).join('');
}

function focusReport(id) {
  const report = liveReportsDatabase.find(r => r.id == id);
  if (!report || !report.lat) return;
  map.flyTo([report.lat, report.lng], 16, { duration: 1.2 });
  closeReportsPanel();
}

function refreshReportStats() {
  const all = liveReportsDatabase;
  
  const totalEl = document.getElementById('rp-total');
  const wetlandEl = document.getElementById('rp-wetland');
  const otherEl = document.getElementById('rp-other');
  
  if (totalEl) totalEl.textContent = all.length;
  if (wetlandEl) wetlandEl.textContent = all.filter(r => r.onWetland).length;
  if (otherEl) otherEl.textContent = all.filter(r => !r.onWetland).length;
  
  const badge = document.getElementById('reports-count-badge');
  if (badge) badge.textContent = all.length;
  
  const sbBadge = document.getElementById('reports-count-badge-sb');
  if (sbBadge) sbBadge.textContent = all.length;

  const layerCount = document.getElementById('reports-count-layer');
  if (layerCount) layerCount.textContent = all.length;
}

function exportCSV() {
  const reports = liveReportsDatabase;
  if (!reports.length) return;
  const headers = ['ID', 'Name', 'GN Division', 'Encroachment Type', 'Description', 'Date', 'Latitude', 'Longitude', 'On Wetland'];
  const rows = reports.map(r => [
    r.id, r.name || '', r.gnDivision || '', r.type || '',
    (r.description || '').replace(/,/g, ';'),
    r.date || '', r.lat || '', r.lng || '', r.onWetland ? 'Yes' : 'No'
  ]);
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = 'wetlandwatch_reports.csv';
  a.click();
}

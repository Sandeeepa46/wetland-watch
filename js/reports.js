/* reports.js — Live Google Sheet CSV Synchronization Engine
*/

// Live Database Link Provided
const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRMWIbtU1mZTUQI6OBVIPl_eAplNdDGbCCEUl1vYzV_6Ef-Ne325oh9e0CE20wKGWxHbEeA6uv7_NUa/pub?gid=773411622&single=true&output=csv";

// Global cache to maintain synced items
let liveReportsDatabase = [];
let activeFilter = 'all';

/**
 * Interface function used across other script layers to grab the cached reports list
 */
function getAllReports() {
  return liveReportsDatabase;
}

/**
 * Connects to your Google spreadsheet, parses rows, calculates vector overlaps, 
 * and draws the corresponding indicators onto the active Leaflet maps.
 */
async function restoreReportMarkers() {
  if (!GOOGLE_SHEET_CSV_URL) {
    console.warn("Google Sheet URL is unconfigured.");
    return;
  }

  try {
    const response = await fetch(GOOGLE_SHEET_CSV_URL);
    const csvData = await response.text();
    
    // Reset active indicators before drawing fresh spreadsheet values
    if (typeof reportMarkersLayer !== 'undefined' && reportMarkersLayer) {
      reportMarkersLayer.clearLayers();
    }
    liveReportsDatabase = [];

    const lines = csvData.split('\n');
    const rows = lines.slice(1); // Exclude Google Forms column header label

    rows.forEach((row, index) => {
      if (!row.trim()) return;

      // Safe splitter accounting for inner sentence commas inside quoted descriptions
      const columns = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);

      // Map spreadsheet column coordinates to fit your specific data index layout
      const report = {
        id:          index + 1,
        timestamp:   columns[0]?.replace(/"/g, '').trim(),
        name:        columns[1]?.replace(/"/g, '').trim() || 'Unnamed area',
        gnDivision:  columns[2]?.replace(/"/g, '').trim() || 'Unknown GN',
        coordsRaw:   columns[3]?.replace(/"/g, '').trim(), // e.g., "6.9271, 79.8612"
        type:        columns[4]?.replace(/"/g, '').trim() || 'Other',
        description: columns[5]?.replace(/"/g, '').trim() || '',
        date:        columns[6]?.replace(/"/g, '').trim() || ''
      };

      // Split coordinates from the unified string field
      if (report.coordsRaw) {
        const splitPair = report.coordsRaw.split(',');
        report.lat = parseFloat(splitPair[0]);
        report.lng = parseFloat(splitPair[1]);
      }

      // Check if coordinate numbers are valid before applying map overlays
      if (!isNaN(report.lat) && !isNaN(report.lng)) {
        const checkPoint = L.latLng(report.lat, report.lng);
        let pointIntersectsWetland = false;

        // Perform point-in-polygon verification check against active layers
        if (typeof wetlandLayer !== 'undefined' && wetlandLayer) {
          wetlandLayer.eachLayer(layer => {
            if (layer.getBounds().contains(checkPoint)) {
              pointIntersectsWetland = true;
            }
          });
        }
        report.onWetland = pointIntersectsWetland;

        liveReportsDatabase.push(report);
        
        // Calls the marker drawing utility located in map.js
        if (typeof addReportMarker === 'function') {
          addReportMarker(report);
        }
      }
    });

    // Update active sidebars, metrics, and labels
    refreshReportStats();
    if (document.getElementById('reportsPanel').classList.contains('open')) {
      renderReportCards();
    }

  } catch (error) {
    console.error("Critical error fetching live crowdsourced responses:", error);
    if (typeof showToast === 'function') {
      showToast("Could not sync live reports database", true);
    }
  }
}

// Reports view panel handlers //
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

  // Sort newest logged identifiers first
  reports = reports.sort((a, b) => b.id - a.id);

  if (reports.length === 0) {
    body.className = 'rp-body empty';
    body.innerHTML = '<div class="empty-icon">📭</div><div>No reports yet.</div><div style="font-size:11px;color:var(--dim2)">Click anywhere in Western Province on the map to start reporting.</div>';
    return;
  }

  body.className = 'rp-body';
  body.innerHTML = reports.map(r => {
    const color = (typeof ENCROACH_COLORS !== 'undefined' ? ENCROACH_COLORS[r.type] : null) || '#94a3b8';
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
  const report = liveReportsDatabase.find(r => r.id === id);
  if (!report || !report.lat) return;
  flyToReport(report.lat, report.lng);
  highlightReportOnPanel(id);
}

function flyToReport(lat, lng) {
  map.flyTo([lat, lng], 16, { duration: 1.2 });
  closeReportsPanel();
}

function highlightReportOnPanel(id) {
  document.querySelectorAll('.report-card').forEach((c) => {
    c.style.borderColor = '';
  });
}

function refreshReportStats() {
  const all = liveReportsDatabase;
  document.getElementById('rp-total').textContent = all.length;
  document.getElementById('rp-wetland').textContent = all.filter(r => r.onWetland).length;
  document.getElementById('rp-other').textContent = all.filter(r => !r.onWetland).length;
  
  // Dynamic header and sidebar badge update loops
  const badge = document.getElementById('reports-count-badge');
  if (badge) badge.textContent = all.length;
  
  const sbBadge = document.getElementById('reports-count-badge-sb');
  if (sbBadge) sbBadge.textContent = all.length;

  const layerCount = document.getElementById('reports-count-layer');
  if (layerCount) layerCount.textContent = all.length;
}

// Local Export Engine
function exportCSV() {
  const reports = liveReportsDatabase;
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

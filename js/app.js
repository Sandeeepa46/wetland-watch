/* 
   app.js  —  Bootstrap, search, locate, toast, status
              + Google Sheets live report fetching
 */

const SHEETS_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/' +
  '2PACX-1vRMWIbtU1mZTUQI6OBVIPl_eAplNdDGbCCEUl1vYzV_6Ef-Ne325oh9e0CE20wKGWxHbEeA6uv7_NUa' +
  '/pub?gid=773411622&single=true&output=csv';

//  Toast //
function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast' + (isError ? ' error' : '');
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), isError ? 4500 : 3800);
}

//  Status bar //
function setStatus(msg, mode = 'ok') {
  const el  = document.getElementById('statusText');
  const dot = document.getElementById('statusDot');
  if (el)  el.textContent  = msg;
  if (dot) dot.className   = 'pulsedot' +
    (mode === 'warn' ? ' warn' : mode === 'loading' ? ' loading' : '');
}

//  Sidebar toggle //
function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  if (sb) sb.classList.toggle('hidden');
  setTimeout(() => map.invalidateSize(), 300);
}

// ── Locate me ─────────────────────────────────────
let locMarker = null;
function locateMe() {
  if (!navigator.geolocation) {
    showToast('Geolocation not supported by your browser', true);
    return;
  }
  setStatus('Finding your location…', 'loading');
  navigator.geolocation.getCurrentPosition(
    pos => {
      const ll = [pos.coords.latitude, pos.coords.longitude];
      if (locMarker) map.removeLayer(locMarker);
      locMarker = L.circleMarker(ll, {
        radius: 9, color: '#ffd23f', fillColor: '#ffd23f',
        fillOpacity: 0.85, weight: 2
      }).addTo(map);
      locMarker.bindPopup('<b>Your location</b>').openPopup();
      map.setView(ll, 16);
      setStatus('Showing your current location');
    },
    () => setStatus('Could not get location — allow browser permission', 'warn')
  );
}

// ── Nominatim search ──────────────────────────────
let searchTimer   = null;
let provinceBounds = null;

function initSearch(bounds) {
  provinceBounds = bounds;
  const input = document.getElementById('searchInput');
  if (!input) return;
  input.addEventListener('input', function () {
    const q   = this.value.trim();
    const box = document.getElementById('searchResults');
    if (searchTimer) clearTimeout(searchTimer);
    if (q.length < 3) { if (box) box.classList.remove('show'); return; }
    searchTimer = setTimeout(() => doSearch(q), 400);
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-wrap')) {
      const box = document.getElementById('searchResults');
      if (box) box.classList.remove('show');
    }
  });
}

async function doSearch(q) {
  const box = document.getElementById('searchResults');
  if (!box || !provinceBounds) return;
  try {
    const B  = provinceBounds;
    const vb = `${B.getWest()},${B.getNorth()},${B.getEast()},${B.getSouth()}`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=6&viewbox=${vb}&bounded=1&q=${encodeURIComponent(q)}`;
    const data = await (await fetch(url, { headers: { 'Accept-Language': 'en' } })).json();
    box.innerHTML = '';
    if (!data.length) {
      const d = document.createElement('div');
      d.className  = 'sr-item';
      d.textContent = 'No results found';
      box.appendChild(d);
    } else {
      data.forEach(r => {
        const d = document.createElement('div');
        d.className  = 'sr-item';
        d.textContent = r.display_name.split(',').slice(0, 3).join(', ');
        d.addEventListener('click', () => {
          map.setView([+r.lat, +r.lon], 15);
          box.classList.remove('show');
          document.getElementById('searchInput').value = d.textContent;
        });
        box.appendChild(d);
      });
    }
    box.classList.add('show');
  } catch (e) { console.warn('Search error', e); }
}

// ── Robust CSV parser (handles quoted fields) ─────
function parseCSV(text) {
  const rows  = [];
  const lines = text.trim().split(/\r?\n/);
  for (const line of lines) {
    const cols = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        cols.push(cur.trim()); cur = '';
      } else {
        cur += ch;
      }
    }
    cols.push(cur.trim());
    rows.push(cols);
  }
  return rows;
}

// ── Extract [Coords: lat,lng] from description ────
function extractCoords(description) {
  if (!description) return null;
  const m = description.match(/\[Coords:\s*([-\d.]+),\s*([-\d.]+)\]/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  return null;
}

// ── Fetch live reports from Google Sheets CSV ─────
async function fetchSheetReports() {
  try {
    // Cache-bust so we always get the latest entries
    const resp = await fetch(SHEETS_CSV_URL + '&t=' + Date.now());
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const text = await resp.text();
    const rows = parseCSV(text);
    if (rows.length < 2) return [];   // only header row, nothing yet

    // Google Forms CSV column order:
    //  0: Timestamp  1: Wetland Name  2: GN Division
    //  3: Type       4: Description   5: Date
    const reports = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length < 2) continue;

      const timestamp  = (r[0] || '').trim();
      const name       = (r[1] || 'Unknown area').trim();
      const gn         = (r[2] || '').trim();
      const type       = (r[3] || '').trim();
      const desc       = (r[4] || '').trim();
      const date       = (r[5] || '').trim();

      const coords    = extractCoords(desc);
      const cleanDesc = desc.replace(/\s*\[Coords:[-\d.,\s]+\]/, '').trim();

      // Stable ID from timestamp string so we never duplicate
      const id = 'sheet_' + timestamp.replace(/\W+/g, '_');

      reports.push({
        id,
        name,
        gnDivision:  gn,
        type,
        description: cleanDesc,
        date,
        lat:         coords ? coords.lat : null,
        lng:         coords ? coords.lng : null,
        onWetland:   true,
        timestamp,
        source:      'sheet'
      });
    }
    console.log('[WetlandWatch] Loaded', reports.length, 'reports from Google Sheets');
    return reports;
  } catch (err) {
    console.warn('[WetlandWatch] Could not fetch Google Sheets:', err.message);
    return [];
  }
}

// ── Merge sheet + localStorage, deduplicate ────────
function mergeReports(sheetReports, localReports) {
  const seen   = new Set();
  const merged = [];

  // Sheet reports are the source of truth
  for (const r of sheetReports) {
    const key = (r.name + '||' + r.date + '||' + r.type).toLowerCase();
    if (!seen.has(key)) { seen.add(key); merged.push(r); }
  }

  // Add any local reports not yet visible in the sheet
  // (e.g. submitted seconds ago, sheet hasn't refreshed yet)
  for (const r of localReports) {
    const key = (r.name + '||' + r.date + '||' + r.type).toLowerCase();
    if (!seen.has(key)) { seen.add(key); merged.push({ ...r, source: 'local' }); }
  }

  return merged;
}

// ── Bootstrap ─────────────────────────────────────
window.addEventListener('load', async () => {
  setStatus('Loading boundary…', 'loading');

  try {
    // 1. Load spatial layers
    await loadBoundary();
    setStatus('Loading wetland polygons…', 'loading');
    const count = await loadWetlands();

    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'none';

    initSearch(boundaryLayer.getBounds());
    setStatus('Fetching community reports from server…', 'loading');

    // 2. Fetch all submitted reports from Google Sheets (live)
    const sheetReports = await fetchSheetReports();

    // 3. Get any reports already cached locally
    const localReports = getAllReports();

    // 4. Merge and deduplicate
    const allReports = mergeReports(sheetReports, localReports);

    // 5. Persist the merged set back to localStorage so next reload
    //    works even if Sheets is temporarily unreachable
    if (allReports.length > 0) {
      localStorage.setItem('wetlandwatch_reports_v1', JSON.stringify(allReports));
    }

    // 6. Add markers for every report on the map
    allReports.forEach(r => addReportMarker(r));

    // 7. Sync all counters and badges
    refreshReportStats();

    setStatus(
      `${count} wetland polygons · ${allReports.length} ` +
      `report${allReports.length !== 1 ? 's' : ''} — click anywhere in Western Province to report`
    );

  } catch (err) {
    console.error('[WetlandWatch] Bootstrap error:', err);
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'none';
    setStatus('Error loading data — check console', 'warn');
    showToast('Failed to load some map data', true);

    // Fallback: still show any locally cached reports
    const cached = getAllReports();
    cached.forEach(r => addReportMarker(r));
    refreshReportStats();
  }
});

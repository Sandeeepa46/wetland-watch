/* app.js — Core Bootstrap UI & Initialization Pipeline
*/

// Toast Notifications //
function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (isError ? ' error' : '');
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), isError ? 4500 : 3800);
}

// Status Bar Monitor //
function setStatus(msg, mode = 'ok') {
  document.getElementById('statusText').textContent = msg;
  const dot = document.getElementById('statusDot');
  dot.className = 'pulsedot' + (mode === 'warn' ? ' warn' : mode === 'loading' ? ' loading' : '');
}

// Navigation Sidebar Toggle Drawer //
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('hidden');
  setTimeout(() => map.invalidateSize(), 300);
}

// Geolocation GPS Hardware Tracker //
let locMarker = null;
function locateMe() {
  if (!navigator.geolocation) { showToast('Geolocation not supported by your browser', true); return; }
  setStatus('Finding your location…', 'loading');
  navigator.geolocation.getCurrentPosition(
    pos => {
      const ll = [pos.coords.latitude, pos.coords.longitude];
      if (locMarker) map.removeLayer(locMarker);
      locMarker = L.circleMarker(ll, {
        radius: 9, color: '#ffd23f', fillColor: '#ffd23f', fillOpacity: 0.85, weight: 2
      }).addTo(map);
      locMarker.bindPopup('<b>Your location</b>').openPopup();
      map.setView(ll, 16);
      setStatus('Showing your current location');
    },
    () => setStatus('Could not get location — allow browser permission', 'warn')
  );
}

// Nominatim Geocoding Search Box System //
let searchTimer = null;
let provinceBounds = null; 

function initSearch(bounds) {
  provinceBounds = bounds;
  const input = document.getElementById('searchInput');
  input.addEventListener('input', function () {
    const q = this.value.trim();
    const box = document.getElementById('searchResults');
    if (searchTimer) clearTimeout(searchTimer);
    if (q.length < 3) { box.classList.remove('show'); return; }
    searchTimer = setTimeout(() => doSearch(q), 400);
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-wrap'))
      document.getElementById('searchResults').classList.remove('show');
  });
}

async function doSearch(q) {
  const box = document.getElementById('searchResults');
  try {
    const B = provinceBounds;
    const vb = `${B.getWest()},${B.getNorth()},${B.getEast()},${B.getSouth()}`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=6&viewbox=${vb}&bounded=1&q=${encodeURIComponent(q)}`;
    const data = await (await fetch(url, { headers: { 'Accept-Language': 'en' } })).json();
    box.innerHTML = '';
    if (!data.length) {
      const d = document.createElement('div'); d.className = 'sr-item'; d.textContent = 'No results found';
      box.appendChild(d);
    } else {
      data.forEach(r => {
        const d = document.createElement('div'); d.className = 'sr-item';
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
  } catch (e) { console.warn('Search service error', e); }
}

// Synchronous System Bootstrap On Window Load //
window.addEventListener('load', async () => {
  setStatus('Loading province boundary…', 'loading');

  try {
    // 1. Ingest base provincial operational map limits
    await loadBoundary();
    
    // 2. Load classified wetland asset polygons
    setStatus('Loading wetland polygons…', 'loading');
    const count = await loadWetlands();

    // 3. Sync live database spreadsheet rows
    setStatus('Synchronizing live community database…', 'loading');
    await restoreReportMarkers();

    // Remove application loading curtains from UI view
    document.getElementById('loader').style.display = 'none';

    // Activate Nominatim text searching bounding parameters
    if (typeof boundaryLayer !== 'undefined' && boundaryLayer) {
      initSearch(boundaryLayer.getBounds());
    }

    setStatus(`${count} wetlands mapped — Click locations inside Western Province to file a live report.`);
  } catch (err) {
    console.error("Initialization sequence break:", err);
    document.getElementById('loader').style.display = 'none';
    setStatus('Error initializing active map parameters — see console logs', 'warn');
    showToast('Failed to connect to backend data networks', true);
  }
});

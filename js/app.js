/* app.js — Base Platform Initialization & Safe Form Submission Interception
*/

function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  if(!t) return;
  t.textContent = msg;
  t.className = 'toast' + (isError ? ' error' : '');
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), isError ? 4500 : 3800);
}

function setStatus(msg, mode = 'ok') {
  const sText = document.getElementById('statusText');
  const sDot = document.getElementById('statusDot');
  if(sText) sText.textContent = msg;
  if(sDot) sDot.className = 'pulsedot' + (mode === 'warn' ? ' warn' : mode === 'loading' ? ' loading' : '');
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('hidden');
  setTimeout(() => map.invalidateSize(), 300);
}

let locMarker = null;
function locateMe() {
  if (!navigator.geolocation) { showToast('Geolocation feature not supported by your browser', true); return; }
  setStatus('Tracking active hardware geolocation coordinates…', 'loading');
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
    () => setStatus('Could not read hardware location metrics', 'warn')
  );
}

// Nominatim Global Spatial Search Systems //
let searchTimer = null;
let provinceBounds = null; 

function initSearch(bounds) {
  provinceBounds = bounds;
  const input = document.getElementById('searchInput');
  if(!input) return;
  input.addEventListener('input', function () {
    const q = this.value.trim();
    const box = document.getElementById('searchResults');
    if (searchTimer) clearTimeout(searchTimer);
    if (q.length < 3) { if(box) box.classList.remove('show'); return; }
    searchTimer = setTimeout(() => doSearch(q), 400);
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-wrap')) {
      const box = document.getElementById('searchResults');
      if(box) box.classList.remove('show');
    }
  });
}

async function doSearch(q) {
  const box = document.getElementById('searchResults');
  if(!box) return;
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
  } catch (e) { console.warn('Search routing error:', e); }
}

/**
 * Intercepts active submissions to immediately plot pins on-screen, bypassing database sync delays
 */
function initFormSubmissionInterceptor() {
  const formElement = document.querySelector('#drawer form');
  if (!formElement) {
    console.warn("⚠️ Data collection submission form not found inside DOM layouts.");
    return;
  }

  formElement.addEventListener('submit', function(event) {
    const coordString = document.getElementById('f-coords')?.value || "";
    if (!coordString.includes(',')) return;
    
    const splitPair = coordString.split(',');
    const latNum = parseFloat(splitPair[0]);
    const lngNum = parseFloat(splitPair[1]);

    const simulatedReport = {
      name:        document.getElementById('f-name')?.value || 'Unnamed area',
      gnDivision:  document.getElementById('f-gn')?.value || 'Unknown GN',
      type:        document.getElementById('f-type')?.value || 'Other',
      description: document.getElementById('f-desc')?.value || '',
      date:        document.getElementById('f-date')?.value || new Date().toISOString().slice(0,10),
      lat:         latNum,
      lng:         lngNum,
      timestamp:   new Date().toLocaleString()
    };

    if (typeof saveReport === 'function') {
      saveReport(simulatedReport);
    }

    showToast('✅ Report successfully registered and dispatched');
    document.getElementById('drawer').classList.remove('open');
    
    // Smooth input element flush handling
    setTimeout(() => { formElement.reset(); }, 200);
  });
}

// Map Application Setup Bootstrapper Pipeline
window.addEventListener('load', async () => {
  setStatus('Loading province boundary vectors…', 'loading');

  try {
    await loadBoundary();
    
    setStatus('Loading environmental spatial assets…', 'loading');
    const count = await loadWetlands();

    setStatus('Synchronizing live community cloud records…', 'loading');
    await restoreReportMarkers();

    // Hook core browser interaction controllers
    initFormSubmissionInterceptor();

    const loaderEl = document.getElementById('loader');
    if (loaderEl) loaderEl.style.display = 'none';

    if (typeof boundaryLayer !== 'undefined' && boundaryLayer) {
      initSearch(boundaryLayer.getBounds());
    }

    setStatus(`${count} wetlands mapped — Click locations inside Western Province to file a live report.`);
  } catch (err) {
    console.error("Initialization sequence break:", err);
    const loaderEl = document.getElementById('loader');
    if (loaderEl) loaderEl.style.display = 'none';
    setStatus('Error initiating map parameters', 'warn');
    showToast('Failed to reach system data arrays', true);
  }
});

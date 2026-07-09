/* app.js — Core Bootstrap UI & Form Interception Pipeline
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

// Nominatim Geocoding System //
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
  } catch (e) { console.warn('Search service error', e); }
}

/**
 * INTERCEPTOR: Hooks into your form submit action. Maps a new node point marker
 * locally and asynchronously passes payload records over to Google Forms.
 */
function initFormSubmissionInterceptor() {
  const formElement = document.querySelector('#drawer form');
  if (!formElement) return;

  formElement.addEventListener('submit', function(event) {
    // Collect coordinates from the read-only form input fields
    const coordString = document.getElementById('f-coords')?.value || "";
    if (!coordString.includes(',')) return;
    
    const splitPair = coordString.split(',');
    const latNum = parseFloat(splitPair[0]);
    const lngNum = parseFloat(splitPair[1]);

    // Build immediate visual map report object
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

    // Plot node directly onto map canvas without making user wait
    if (typeof saveReport === 'function') {
      saveReport(simulatedReport);
    }

    showToast('✅ Report successfully registered and dispatched');
    document.getElementById('drawer').classList.remove('open');
    
    // Allow standard iframe routing target pipelines to complete standard logs 
    setTimeout(() => { formElement.reset(); }, 200);
  });
}

// Synchronous System Bootstrap On Page Initialization //
window.addEventListener('load', async () => {
  setStatus('Loading province boundary…', 'loading');

  try {
    await loadBoundary();
    
    setStatus('Loading wetland polygons…', 'loading');
    const count = await loadWetlands();

    setStatus('Synchronizing live community database…', 'loading');
    await restoreReportMarkers();

    // Activate interception hook layout engines
    initFormSubmissionInterceptor();

    document.getElementById('loader').style.display = 'none';

    if (typeof boundaryLayer !== 'undefined' && boundaryLayer) {
      initSearch(boundaryLayer.getBounds());
    }

    setStatus(`${count} wetlands mapped — Click locations inside Western Province to file a live report.`);
  } catch (err) {
    console.error("Initialization sequence break:", err);
    document.getElementById('loader').style.display = 'none';
    setStatus('Error initializing active map parameters', 'warn');
    showToast('Failed to connect to backend data networks', true);
  }
});

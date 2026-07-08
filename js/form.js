/*
   form.js — Report drawer, form handling, submission
 */

const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSflOdWU64IT_pjsg83j6lal0mV3cnp2N7zweiSJXsr1SMJwhA/formResponse';

const FORM_ENTRIES = {
  name:        'entry.1314308756',
  gnDivision:  'entry.1923769741',
  type:        'entry.1595492332',
  description: 'entry.1527863920',
  date:        'entry.515289982'
};

let currentLocation = null;
let currentOnWetland = false;
let chosenType = '';

//Open drawer//
function openReportDrawer({ latlng, onWetland, wetlandName, wetlandType, gnDivision }) {
  currentLocation = latlng;
  currentOnWetland = onWetland;
  chosenType = '';

  // Header badge //
  const dot = document.getElementById('loc-dot');
  const locLabel = document.getElementById('loc-label');
  const locSub = document.getElementById('loc-sub');

  if (onWetland) {
    dot.className = 'lbdot on-wetland';
    locLabel.textContent = 'Wetland polygon selected';
    locSub.textContent = wetlandType
      ? wetlandType.charAt(0).toUpperCase() + wetlandType.slice(1).replace(/_/g,' ') + ' · '
      : '';
    locSub.textContent += gnDivision ? `GN: ${gnDivision}` : 'GN unknown';
    document.getElementById('dr-eyebrow-txt').textContent = 'Wetland Encroachment';
    document.getElementById('dr-emoji').textContent = '🌿';
  } else {
    dot.className = 'lbdot off-wetland';
    locLabel.textContent = 'Location outside mapped wetland';
    locSub.textContent = gnDivision ? `GN Division: ${gnDivision}` : 'Click inside province to report';
    document.getElementById('dr-eyebrow-txt').textContent = 'Encroachment Report';
    document.getElementById('dr-emoji').textContent = '📍';
  }

  // Fill GN Division (autofill), clear rest //
  document.getElementById('fld-name').value = '';
  document.getElementById('fld-gn').value = gnDivision || '';
  document.getElementById('fld-desc').value = '';
  document.getElementById('fld-date').value = new Date().toISOString().split('T')[0];
  document.querySelectorAll('.type-card').forEach(c => c.classList.remove('sel'));

  // Coords display //
  document.getElementById('fld-coords').value =
    `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;

  // Show drawer //
  document.getElementById('drawer').classList.add('open');
  // Close reports panel if open
  document.getElementById('reportsPanel').classList.remove('open');

  setStatus(`Click captured at ${gnDivision || 'unknown GN'} — fill in the report`);
}

function closeDrawer() {
  document.getElementById('drawer').classList.remove('open');
  // Restore any highlighted wetland polygon //
  if (selectedWetlandLayer && selectedWetlandRestore) {
    selectedWetlandLayer.setStyle(selectedWetlandRestore);
    selectedWetlandLayer = null;
  }
  setStatus('Click anywhere in Western Province to file a report');
}

// Encroachment type cards //
function selType(el) {
  document.querySelectorAll('.type-card').forEach(c => c.classList.remove('sel'));
  el.classList.add('sel');
  chosenType = el.dataset.val;
}

// Submit //
function submitReport() {
  const name = document.getElementById('fld-name').value.trim();
  const gn   = document.getElementById('fld-gn').value.trim();
  const desc = document.getElementById('fld-desc').value.trim();
  const date = document.getElementById('fld-date').value;

  if (!name) { showToast('Please enter the wetland / area name', true); return; }
  if (!chosenType) { showToast('Please choose a type of encroachment', true); return; }
  if (!date) { showToast('Please select the date of observation', true); return; }

  // Submit to Google Form //
  const formData = {
    [FORM_ENTRIES.name]:        name,
    [FORM_ENTRIES.gnDivision]:  gn,
    [FORM_ENTRIES.type]:        chosenType,
    [FORM_ENTRIES.description]: desc + (currentLocation ? ` [Coords: ${currentLocation.lat.toFixed(5)},${currentLocation.lng.toFixed(5)}]` : ''),
    [FORM_ENTRIES.date]:        date
  };

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = FORM_URL;
  form.target = 'hf';
  Object.entries(formData).forEach(([k, v]) => {
    const i = document.createElement('input');
    i.type = 'hidden'; i.name = k; i.value = v;
    form.appendChild(i);
  });
  document.body.appendChild(form);
  form.submit();
  document.body.removeChild(form);

  // Save to localStorage //
  const report = {
    id:         Date.now(),
    name,
    gnDivision: gn,
    type:       chosenType,
    description: desc,
    date,
    lat:        currentLocation ? currentLocation.lat : null,
    lng:        currentLocation ? currentLocation.lng : null,
    onWetland:  currentOnWetland,
    timestamp:  new Date().toISOString()
  };
  saveReport(report);

  //  Add marker on map (always) //
  addReportMarker(report);

  //  Update reports panel stat //
  refreshReportStats();

  closeDrawer();
  showToast('✅ Report submitted — thank you for contributing!');
}

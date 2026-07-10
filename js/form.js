/* 
   form.js — Report drawer, form handling, submission
             to Google Forms + localStorage
 */

const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSflOdWU64IT_pjsg83j6lal0mV3cnp2N7zweiSJXsr1SMJwhA/formResponse';

const FORM_ENTRIES = {
  name:        'entry.1314308756',
  gnDivision:  'entry.1923769741',
  type:        'entry.1595492332',
  description: 'entry.1527863920',
  date:        'entry.515289982'
};

let currentLocation  = null;
let currentOnWetland = false;
let chosenType       = '';

// Open report drawer //
function openReportDrawer({ latlng, onWetland, wetlandName, wetlandType, gnDivision }) {
  currentLocation  = latlng;
  currentOnWetland = onWetland;
  chosenType       = '';

  const dot      = document.getElementById('loc-dot');
  const locLabel = document.getElementById('loc-label');
  const locSub   = document.getElementById('loc-sub');

  if (onWetland) {
    if (dot)      dot.className = 'lbdot on-wetland';
    if (locLabel) locLabel.textContent = 'Wetland polygon selected';
    if (locSub)   locSub.textContent =
      (wetlandType
        ? wetlandType.charAt(0).toUpperCase() + wetlandType.slice(1).replace(/_/g, ' ') + ' · '
        : '') +
      (gnDivision ? `GN: ${gnDivision}` : 'GN unknown');
    const eyebrow = document.getElementById('dr-eyebrow-txt');
    const emoji   = document.getElementById('dr-emoji');
    if (eyebrow) eyebrow.textContent = 'Wetland Encroachment';
    if (emoji)   emoji.textContent   = '🌿';
  } else {
    if (dot)      dot.className = 'lbdot off-wetland';
    if (locLabel) locLabel.textContent = 'Location outside mapped wetland';
    if (locSub)   locSub.textContent   = gnDivision
      ? `GN Division: ${gnDivision}`
      : 'GN unknown';
    const eyebrow = document.getElementById('dr-eyebrow-txt');
    const emoji   = document.getElementById('dr-emoji');
    if (eyebrow) eyebrow.textContent = 'Encroachment Report';
    if (emoji)   emoji.textContent   = '📍';
  }

  // Auto-fill fields
  const fName   = document.getElementById('fld-name');
  const fGN     = document.getElementById('fld-gn');
  const fCoords = document.getElementById('fld-coords');
  const fDesc   = document.getElementById('fld-desc');
  const fDate   = document.getElementById('fld-date');

  if (fName)   fName.value   = '';
  if (fGN)     fGN.value     = gnDivision || '';
  if (fCoords) fCoords.value = latlng
    ? `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`
    : '';
  if (fDesc)   fDesc.value   = '';
  if (fDate)   fDate.value   = new Date().toISOString().split('T')[0];

  // Reset type cards
  document.querySelectorAll('.type-card').forEach(c => c.classList.remove('sel'));
  chosenType = '';

  // Open drawer, close reports panel
  const drawer = document.getElementById('drawer');
  const panel  = document.getElementById('reportsPanel');
  if (drawer) drawer.classList.add('open');
  if (panel)  panel.classList.remove('open');

  setStatus(
    `Clicked at ${gnDivision || 'unknown GN'} — fill in the report and submit`
  );
}

// ── Close drawer ──────────────────────────────────
function closeDrawer() {
  const drawer = document.getElementById('drawer');
  if (drawer) drawer.classList.remove('open');

  // Restore any highlighted wetland polygon
  if (typeof selectedWetlandLayer !== 'undefined' &&
      selectedWetlandLayer && selectedWetlandRestore) {
    selectedWetlandLayer.setStyle(selectedWetlandRestore);
    selectedWetlandLayer  = null;
  }

  setStatus('Click anywhere in Western Province to file a report');
}

// ── Encroachment type cards ───────────────────────
function selType(el) {
  document.querySelectorAll('.type-card').forEach(c => c.classList.remove('sel'));
  el.classList.add('sel');
  chosenType = el.dataset.val;
}

// ── Submit report ─────────────────────────────────
function submitReport() {
  const nameEl = document.getElementById('fld-name');
  const gnEl   = document.getElementById('fld-gn');
  const descEl = document.getElementById('fld-desc');
  const dateEl = document.getElementById('fld-date');

  const name = nameEl ? nameEl.value.trim() : '';
  const gn   = gnEl   ? gnEl.value.trim()   : '';
  const desc = descEl ? descEl.value.trim()  : '';
  const date = dateEl ? dateEl.value         : '';

  // Validation
  if (!name)      { showToast('Please enter the wetland / area name', true);   return; }
  if (!chosenType){ showToast('Please choose a type of encroachment', true);   return; }
  if (!date)      { showToast('Please select the date of observation', true);  return; }

  // Append coordinates to description for Google Sheets storage
  const coordSuffix = currentLocation
    ? ` [Coords: ${currentLocation.lat.toFixed(5)},${currentLocation.lng.toFixed(5)}]`
    : '';

  // ── 1. POST to Google Forms via hidden iframe ──
  const formEl = document.createElement('form');
  formEl.method = 'POST';
  formEl.action = FORM_URL;
  formEl.target = 'hf';

  const fields = {
    [FORM_ENTRIES.name]:        name,
    [FORM_ENTRIES.gnDivision]:  gn,
    [FORM_ENTRIES.type]:        chosenType,
    [FORM_ENTRIES.description]: desc + coordSuffix,
    [FORM_ENTRIES.date]:        date
  };
  Object.entries(fields).forEach(([k, v]) => {
    const inp = document.createElement('input');
    inp.type  = 'hidden'; inp.name = k; inp.value = v;
    formEl.appendChild(inp);
  });
  document.body.appendChild(formEl);
  formEl.submit();
  document.body.removeChild(formEl);

  // ── 2. Build local report object ──
  const report = {
    id:          Date.now(),
    name,
    gnDivision:  gn,
    type:        chosenType,
    description: desc,
    date,
    lat:         currentLocation ? currentLocation.lat : null,
    lng:         currentLocation ? currentLocation.lng : null,
    onWetland:   currentOnWetland,
    timestamp:   new Date().toISOString(),
    source:      'local'
  };

  // ── 3. Save to localStorage immediately ──
  saveReport(report);

  // ── 4. Add marker to map immediately ──
  addReportMarker(report);

  // ── 5. Refresh all counters ──
  refreshReportStats();

  // ── 6. Close drawer and confirm ──
  closeDrawer();
  showToast('✅ Report submitted — thank you for contributing!');
}

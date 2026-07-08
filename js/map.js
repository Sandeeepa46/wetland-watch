/*
   map.js — Enhanced Map Init, Custom Basemaps, Boundaries, & Wetlands
*/

// Wetland sub-type colour palette //
const WETLAND_COLORS = {
  wetland:     '#22d3ee',
  marsh:       '#34d399',
  mangrove:    '#4ade80',
  bog:         '#a78bfa',
  swamp:       '#818cf8',
  reedbed:     '#6ee7b7',
  wet_meadow:  '#86efac',
  string_bog:  '#c4b5fd',
  water:       '#60a5fa',
  yes:         '#22d3ee',
  default:     '#22d3ee'
};

function getWetlandColor(props) {
  const sub = props.wetland || props.natural || 'default';
  return WETLAND_COLORS[sub] || WETLAND_COLORS.default;
}

// Map //
const map = L.map('map', { 
  zoomControl: false,
  fadeAnimation: true // Smooth transitions between premium styles //
});
L.control.zoom({ position: 'bottomleft' }).addTo(map);

// Create a dedicated overlay pane so our boundaries and shapes //
// always sit cleanly above any basemap labels or satellite pixels. //
map.createPane('overlayPane').style.zIndex = 400;

// ── Visually Interactive Basemaps (Fixed: No API Keys Required) ── //
const BASEMAPS = {
  // Option 1: CartoDB Dark Matter — High-performance sleek charcoal layout //
  street: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 20,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  }),
  
  // Option 2: Esri World Imagery (Satellite) with adjusted maxZoom for crisp zoom depths // 
  sat: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { 
    attribution: '&copy; Esri &mdash; DigitalGlobe, GeoEye, Earthstar Geographics', 
    maxZoom: 19 
  }),
  
  // Option 3: CartoDB Positron — Premium light/minimal architectural layout //
  topo: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 20
  })
};

// Default to Dark Matter view //
BASEMAPS.street.addTo(map);

function setBasemap(key) {
  Object.values(BASEMAPS).forEach(l => map.hasLayer(l) && map.removeLayer(l));
  BASEMAPS[key].addTo(map);
  
  // Dynamically optimize polygon styling depending on dark vs satellite vs light backgrounds // 
  updateDynamicLayerStyles(key);

  ['street', 'sat', 'topo'].forEach(id => {
    const el = document.getElementById('bm-' + id);
    if(el) el.classList.remove('active');
  });
  const activeEl = document.getElementById('bm-' + key);
  if(activeEl) activeEl.classList.add('active');
}

// Automatically tweaks vector aesthetics based on active basemap choice // 
function updateDynamicLayerStyles(activeBasemap) {
  if (!wetlandLayer || !boundaryLayer) return;

  if (activeBasemap === 'sat') {
    // Satellite needs slightly deeper strokes and vibrant fills to stay legible over trees/houses // 
    wetlandLayer.setStyle(f => ({ color: getWetlandColor(f.properties), weight: 3, fillOpacity: 0.55 }));
    boundaryLayer.setStyle({ color: 'rgba(255,255,255,0.9)', weight: 2, fillOpacity: 0.02 });
  } else if (activeBasemap === 'topo') {
    // Light Canvas map benefits from delicate outline colors and softer fills // 
    wetlandLayer.setStyle(f => ({ color: getWetlandColor(f.properties), weight: 1.5, fillOpacity: 0.45 }));
    boundaryLayer.setStyle({ color: 'rgba(14,165,233,0.4)', weight: 1.5, fillOpacity: 0.03 });
  } else {
    // Reset back to premium Dark Mode specs // 
    wetlandLayer.setStyle(f => ({ color: getWetlandColor(f.properties), weight: 2, fillOpacity: 0.65 }));
    boundaryLayer.setStyle({ color: 'rgba(147,197,253,0.6)', weight: 1.5, fillOpacity: 0.04 });
  }
}

//  Layer registry //
const LAYERS = {
  boundary: null,
  wetlands: null,
  reports:  null   
};

let userLocationMarker = null;

function toggleLayer(key, on) {
  const l = LAYERS[key];
  if (!l) return;
  on ? (!map.hasLayer(l) && map.addLayer(l)) : (map.hasLayer(l) && map.removeLayer(l));
  const cb = document.getElementById('cb-' + key);
  if (cb) {
    cb.textContent = on ? '✓' : '';
    cb.style.borderColor = on ? 'transparent' : 'rgba(255,255,255,0.10)';
  }
}

//  Load boundary //
let boundaryLayer = null;
let outerBoundaryLayer = null;

async function loadBoundary() {
  const [bRes, oRes] = await Promise.all([
    fetch('data/boundary.geojson'),
    fetch('data/outer_boundary.geojson')
  ]);
  const bData = await bRes.json();
  const oData = await oRes.json();

  boundaryLayer = L.geoJSON(bData, {
    pane: 'overlayPane',
    style: { color: 'rgba(147,197,253,0.6)', weight: 1.5, fillColor: '#0ea5e9', fillOpacity: 0.04, dashArray: '4,6' },
    onEachFeature(f, l) {
      if (f.properties && f.properties.ADM3_EN)
        l.bindTooltip(f.properties.ADM3_EN, { sticky: true, opacity: 0.9 });
    }
  }).addTo(map);
  LAYERS.boundary = boundaryLayer;

  L.geoJSON(oData, {
    pane: 'overlayPane',
    style: { color: 'transparent', weight: 0, fillColor: '#10b981', fillOpacity: 0.05 },
    interactive: false
  }).addTo(map);

  outerBoundaryLayer = L.geoJSON(oData, {
    pane: 'overlayPane',
    style: { color: '#4ade80', weight: 6, fillOpacity: 0, opacity: 0.85, className: 'province-glow' },
    interactive: false
  }).addTo(map);

  L.geoJSON(oData, {
    pane: 'overlayPane',
    style: { color: '#ffffff', weight: 1.5, fillOpacity: 0, opacity: 0.5 },
    interactive: false
  }).addTo(map);

  map.fitBounds(boundaryLayer.getBounds(), { padding: [10, 10] });
  return bData;
}

//  Load wetlands from GeoJSON file //
let wetlandLayer = null;
let selectedWetlandLayer = null;
let selectedWetlandRestore = null;

async function loadWetlands() {
  const res = await fetch('data/wetlands.geojson');
  const data = await res.json();

  let count = 0;
  const subtypeCounts = {};

  wetlandLayer = L.geoJSON(data, {
    pane: 'overlayPane',
    style: f => {
      const color = getWetlandColor(f.properties || {});
      return { color, weight: 2.0, fillColor: color, fillOpacity: 0.65 };
    },
    onEachFeature(feature, layer) {
      count++;
      const props = feature.properties || {};
      const sub = props.wetland || props.natural || 'wetland';
      subtypeCounts[sub] = (subtypeCounts[sub] || 0) + 1;
      const color = getWetlandColor(props);
      const name = props.name || null;

      const tipContent = `<b>${name || 'Wetland polygon'}</b><br><small style="opacity:.7">${sub.charAt(0).toUpperCase() + sub.slice(1)}</small>`;
      layer.bindTooltip(tipContent, { sticky: true, opacity: 0.95 });

      layer.on('mouseover', () => {
        if (layer !== selectedWetlandLayer)
          layer.setStyle({ fillOpacity: 0.85, weight: 3.0 });
      });
      layer.on('mouseout', () => {
        if (layer !== selectedWetlandLayer) {
          // Fallback to active dynamic style logic
          const activeBM = map.hasLayer(BASEMAPS.sat) ? 'sat' : (map.hasLayer(BASEMAPS.topo) ? 'topo' : 'street');
          if (activeBM === 'sat') layer.setStyle({ fillOpacity: 0.55, weight: 3.0 });
          else if (activeBM === 'topo') layer.setStyle({ fillOpacity: 0.45, weight: 1.5 });
          else layer.setStyle({ fillOpacity: 0.65, weight: 2.0 });
        }
      });
      layer.on('click', e => {
        L.DomEvent.stopPropagation(e); 
        onWetlandClick(feature, layer, e.latlng, color);
      });
    }
  }).addTo(map);

  LAYERS.wetlands = wetlandLayer;
  document.getElementById('cnt-wetlands').textContent = count;
  document.getElementById('total-count').textContent = count;

  buildWetlandLegend(subtypeCounts);
  return count;
}

function buildWetlandLegend(counts) {
  const el = document.getElementById('wetland-legend');
  el.innerHTML = '';
  Object.entries(counts).sort((a,b) => b[1]-a[1]).forEach(([sub, cnt]) => {
    const color = WETLAND_COLORS[sub] || WETLAND_COLORS.default;
    const label = sub.replace(/_/g, ' ');
    el.innerHTML += `
      <div class="legend-item">
        <div class="legend-dot" style="background:${color}"></div>
        <span style="flex:1;text-transform:capitalize">${label}</span>
        <span class="lcount">${cnt}</span>
      </div>`;
  });
}

//  Point-In-Polygon Check //
function pointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi))
      inside = !inside;
  }
  return inside;
}

//  GN Division / Boundary Verification //
function findGNDivision(latlng) {
  if (!boundaryLayer) return '';
  let found = '';
  
  boundaryLayer.eachLayer(layer => {
    if (found) return;
    if (!layer.getBounds().contains(latlng)) return;
    
    const geom = layer.feature.geometry;
    const pt = [latlng.lng, latlng.lat];
    let hit = false;
    
    if (geom.type === 'Polygon') {
      hit = pointInRing(pt, geom.coordinates[0]);
    } else if (geom.type === 'MultiPolygon') {
      hit = geom.coordinates.some(poly => pointInRing(pt, poly[0]));
    }
    
    if (hit) {
      found = layer.feature.properties.ADM3_EN || layer.feature.properties.GN_Name || 'Western Province Area';
    }
  });
  return found;
}

//  Wetland polygon click //
function onWetlandClick(feature, layer, latlng, color) {
  if (selectedWetlandLayer && selectedWetlandRestore)
    selectedWetlandLayer.setStyle(selectedWetlandRestore);

  selectedWetlandLayer = layer;
  
  // Cache the base properties for selection recovery //
  const activeBM = map.hasLayer(BASEMAPS.sat) ? 'sat' : (map.hasLayer(BASEMAPS.topo) ? 'topo' : 'street');
  let fallbackOpacity = 0.65, fallbackWeight = 2.0;
  if(activeBM === 'sat') { fallbackOpacity = 0.55; fallbackWeight = 3.0; }
  if(activeBM === 'topo') { fallbackOpacity = 0.45; fallbackWeight = 1.5; }

  selectedWetlandRestore = { color, weight: fallbackWeight, fillColor: color, fillOpacity: fallbackOpacity };
  layer.setStyle({ color: '#ffd23f', weight: 3.5, fillColor: '#ffd23f', fillOpacity: 0.85 });

  const props = feature.properties || {};
  const sub = props.wetland || props.natural || 'wetland';
  const gn = findGNDivision(latlng) || 'Auto-detected';

  openReportDrawer({
    latlng,
    onWetland: true,
    wetlandName: props.name || null,
    wetlandType: sub,
    gnDivision: gn
  });
}

//  Map click //

map.on('click', e => {
  const gn = findGNDivision(e.latlng);
  
  if (!gn) {
    showToast('⚠️ Please click within Western Province to report', true);
    return;
  }

  if (selectedWetlandLayer && selectedWetlandRestore) {
    selectedWetlandLayer.setStyle(selectedWetlandRestore);
    selectedWetlandLayer = null;
  }

  openReportDrawer({
    latlng: e.latlng,
    onWetland: false,
    wetlandName: null,
    wetlandType: null,
    gnDivision: gn
  });
});

//  Geolocation & Automatic Form Activation  //
function locateMe() {
  if (!navigator.geolocation) {
    showToast("⚠️ Geolocation is not supported by your browser");
    return;
  }
  showToast("Searching for your current position...");
  map.locate({ setView: true, maxZoom: 16 });
}

map.on('locationfound', e => {
  const gn = findGNDivision(e.latlng);

  if (!gn) {
    showToast('⚠️ Your current location is outside Western Province boundary', true);
    return;
  }

  showToast("📌 Location found! Loading data entry form...");

  if (userLocationMarker) {
    map.removeLayer(userLocationMarker);
  }

  userLocationMarker = L.marker(e.latlng, {
    icon: L.divIcon({
      html: `<div style="
        width: 16px; height: 16px; background: #3b82f6; 
        border: 3px solid #fff; border-radius: 50%;
        box-shadow: 0 0 10px rgba(59,130,246,0.8);
        animation: pulse 2s infinite;
      "></div>`,
      className: '',
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    })
  }).addTo(map);

  userLocationMarker.on('click', (ev) => {
    L.DomEvent.stopPropagation(ev);
    openReportDrawer({
      latlng: e.latlng,
      onWetland: false,
      wetlandName: "My Real-Time GPS Coordinates",
      wetlandType: null,
      gnDivision: gn
    });
  });

  openReportDrawer({
    latlng: e.latlng,
    onWetland: false,
    wetlandName: "My Real-Time GPS Coordinates",
    wetlandType: null,
    gnDivision: gn
  });
});

map.on('locationerror', () => {
  showToast("❌ Unable to retrieve your precise location.");
});

// ── Report markers layer ──────────────────────────
const reportMarkersLayer = L.layerGroup().addTo(map);
LAYERS.reports = reportMarkersLayer;

function addReportMarker(report) {
  if (!report.lat || !report.lng) return;

  const color = ENCROACH_COLORS[report.type] || '#fbbf24';
  const icon = L.divIcon({
    html: `<div style="
      width:22px;height:22px;border-radius:50%;
      background:${color};border:2.5px solid #fff;
      box-shadow:0 4px 12px rgba(0,0,0,0.4);
      display:flex;align-items:center;justify-content:center;
      font-size:9px;color:#000;font-weight:700;
    "></div>`,
    iconSize: [22, 22], iconAnchor: [11, 11], className: ''
  });

  const marker = L.marker([report.lat, report.lng], { icon });
  const onWetlandLabel = report.onWetland
    ? '<span style="color:#4ade80">On wetland polygon</span>'
    : '<span style="color:#fbbf24">Outside mapped wetland</span>';

  marker.bindPopup(`
    <b>${report.name || 'Unknown wetland'}</b><br>
    <small style="opacity:.7">${report.gnDivision || 'Unknown GN'} · ${report.date}</small><br>
    <span style="font-size:12px;color:#f87171">${report.type}</span><br>
    <small>${onWetlandLabel}</small>
    ${report.description ? `<br><small style="opacity:.7">${report.description.slice(0,80)}${report.description.length>80?'…':''}</small>` : ''}
  `);

  marker.on('click', () => { highlightReportOnPanel(report.id); });
  reportMarkersLayer.addLayer(marker);
  return marker;
}

const ENCROACH_COLORS = {
  'Housing':              '#f472b6',
  'Farming':              '#34d399',
  'Industrial Activity':  '#fb923c',
  'Illegal Waste Dumping':'#f87171',
  'Other':                '#94a3b8'
};

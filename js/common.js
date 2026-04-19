// ════════════════════════════════════════════════════════════
//  common.js  —  Firebase, konstanter, hjælpere, fanebladnavigation
// ════════════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore }   from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ── Firebase config ───────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyBOg3mFkYBZbhgW22GxK97z9rh3RCvPiV8",
  authDomain:        "cphforurening.firebaseapp.com",
  projectId:         "cphforurening",
  storageBucket:     "cphforurening.firebasestorage.app",
  messagingSenderId: "661594236126",
  appId:             "1:661594236126:web:28ad7c23471b55f3224e4f"
};

export let db = null;
try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  console.log('[Firebase] ✅ Firestore initialiseret.');
} catch (e) {
  console.error('[Firebase] ❌ Initialisering fejlede:', e.message);
}

// ── Constants ─────────────────────────────────────────────────
export const AIRPORT = { lat: 55.6180, lng: 12.6560 };

// 0-1.25 km = ansatzone (ingen beboere her — antages at være lufthavnsansatte)
export const EMPLOYEE_BAND = '0-1.25 km';
export const DIST_BANDS    = ['0-1.25 km','1.25-3 km','3-5 km','5-10 km','10-20 km','20+ km'];

// Midpunktsafstande (km) bruges i regressionsanalyse
export const BAND_MIDPOINTS = {
  '0-1.25 km':  0.625,
  '1.25-3 km':  2.125,
  '3-5 km':     4.0,
  '5-10 km':    7.5,
  '10-20 km':  15.0,
  '20+ km':    25.0,
};

export const DIRS8 = ['N','NØ','Ø','SØ','S','SV','V','NV'];
export const COL   = { stoj:'#2a4f8c', luft:'#c06010', psyko:'#5e3a8c', ansatte:'#155a2e' };

// t:'sym' = actual health symptom (used in Bradford Hill / dose-response calculations)
// t:'gen' = nuisance / behavioural impact (visualised separately, NOT used in RR/χ²/regression)
export const ALL_SYMS = [
  // ── Støj — symptomer ──────────────────────────────────────────
  {v:'Besvær med at falde i søvn pga. flystøj',                              k:'stoj', t:'sym'},
  {v:'Tidlig opvågning eller afbrudt søvn pga. flystøj',                     k:'stoj', t:'sym'},
  {v:'Vedvarende træthed som følge af dårlig søvn',                          k:'stoj', t:'sym'},
  {v:'Tinnitus eller vedvarende ringen/brummen i ørerne',                    k:'stoj', t:'sym'},
  {v:'Forhøjet stressniveau eller irritabilitet fra støjbelastning',         k:'stoj', t:'sym'},
  {v:'Hovedpine eller trykfornemmelse ved kraftig flystøj',                  k:'stoj', t:'sym'},
  {v:'Ubehag eller angstreaktioner ved kraftige flystøjshændelser',          k:'stoj', t:'sym'},
  // ── Støj — gener (adfærdspåvirkning) ─────────────────────────
  {v:'Koncentrationsbesvær i hjemmet (arbejde, lektier, samtale)',           k:'stoj', t:'gen'},
  {v:'Forhindret i at føre samtale indendørs eller udendørs',                k:'stoj', t:'gen'},
  // ── Luft — symptomer ──────────────────────────────────────────
  {v:'Vejrtrækningsbesvær eller åndenød i hjemmet eller haven',              k:'luft', t:'sym'},
  {v:'Vedvarende eller tilbagevendende hoste',                               k:'luft', t:'sym'},
  {v:'Irritation i øjne, næse eller svælg',                                  k:'luft', t:'sym'},
  {v:'Hyppige luftvejsinfektioner (3 eller flere pr. år)',                   k:'luft', t:'sym'},
  {v:'Kvalme eller utilpashed ved lugtgener fra lufthavnen',                 k:'luft', t:'sym'},
  {v:'Forværring af eksisterende luftvejssygdom ved lugt eller luftforurening', k:'luft', t:'sym'},
  // ── Luft — gener (adfærdspåvirkning) ─────────────────────────
  {v:'Lugt af jetbrændstof indendørs eller i haven',                         k:'luft', t:'gen'},
  {v:'Forhindret i at ventilere hjemmet pga. lugt eller luftkvalitet',       k:'luft', t:'gen'},
  {v:'Begrænser udendørs ophold pga. luftkvalitet',                          k:'luft', t:'gen'},
  // ── Psyko — symptomer ────────────────────────────────────────
  {v:'Tager sovemedicin, beroligende eller blodtryksmedicin — relateret til generne', k:'psyko', t:'sym'},
  // ── Psyko — gener (adfærdspåvirkning) ────────────────────────
  {v:'Nedsat livskvalitet som direkte følge af lufthavnens støj eller luft', k:'psyko', t:'gen'},
  {v:'Vedvarende bekymring for eget eller families helbred pga. lufthavnen', k:'psyko', t:'gen'},
  {v:'Søvnunderskud påvirker evnen til at arbejde eller studere',            k:'psyko', t:'gen'},
  {v:'Følelse af magtesløshed over for myndighedernes passivitet',           k:'psyko', t:'gen'},
  {v:'Seriøst overvejet at flytte pga. generne fra lufthavnen',              k:'psyko', t:'gen'},
];

// ── Helpers ───────────────────────────────────────────────────
export function haversineKm(a, b) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const x = Math.sin(dLat/2)**2 + Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}
export function bearingDeg(from, to) {
  const r = Math.PI / 180;
  const y = Math.sin((to.lng - from.lng)*r) * Math.cos(to.lat*r);
  const x = Math.cos(from.lat*r)*Math.sin(to.lat*r) - Math.sin(from.lat*r)*Math.cos(to.lat*r)*Math.cos((to.lng-from.lng)*r);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}
export function toDir8(deg)  { return DIRS8[Math.round(deg / 45) % 8]; }
export function toBand(km)   {
  if (km < 1.25) return '0-1.25 km';
  if (km < 3)    return '1.25-3 km';
  if (km < 5)    return '3-5 km';
  if (km < 10)   return '5-10 km';
  if (km < 20)   return '10-20 km';
  return '20+ km';
}
// Pre-computed set of nuisance values — anything NOT in this set is treated as a symptom
const _GEN_VALS = new Set(ALL_SYMS.filter(s => s.t === 'gen').map(s => s.v));

// Counts only health symptoms (Bradford Hill / dose-response calculations use this)
// Custom chips (user-typed, not in ALL_SYMS) are treated as symptoms by default
export function symCount(d) {
  return ['stoj','luft','psyko'].reduce((n, cat) =>
    n + (d[cat]||[]).filter(v => !_GEN_VALS.has(v)).length, 0);
}
// Counts only nuisances / behavioural impacts (separate visualisation only)
export function genCount(d) {
  return ['stoj','luft','psyko'].reduce((n, cat) =>
    n + (d[cat]||[]).filter(v => _GEN_VALS.has(v)).length, 0);
}
export function hasKronisk(d) { return d.kronisk?.length > 0 && !d.kronisk.every(v => v === 'Ingen relevante diagnoser at angive'); }
export function isEmployee(d) { return !!(d.is_employee || d.dist_band === EMPLOYEE_BAND); }

// ── Zone geometry helpers ─────────────────────────────────────
export const BAND_RADII = {
  '0-1.25 km':  [0,     1.25],
  '1.25-3 km':  [1.25,  3   ],
  '3-5 km':     [3,     5   ],
  '5-10 km':    [5,     10  ],
  '10-20 km':   [10,    20  ],
  '20+ km':     [20,    25  ],
};

export function destPoint(center, km, bearingDeg) {
  const R = 6371, d = km / R, b = bearingDeg * Math.PI / 180;
  const φ1 = center.lat * Math.PI / 180, λ1 = center.lng * Math.PI / 180;
  const φ2 = Math.asin(Math.sin(φ1)*Math.cos(d) + Math.cos(φ1)*Math.sin(d)*Math.cos(b));
  const λ2 = λ1 + Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(φ1), Math.cos(d)-Math.sin(φ1)*Math.sin(φ2));
  return [φ2*180/Math.PI, λ2*180/Math.PI];
}

export function sectorLatLngs(center, innerKm, outerKm, dirIndex, steps=24) {
  const s = dirIndex * 45 - 22.5, e = dirIndex * 45 + 22.5;
  const arc = (r, from, to) => {
    const pts = [];
    for (let i = 0; i <= steps; i++) pts.push(destPoint(center, r, from + (to-from)*i/steps));
    return pts;
  };
  return innerKm > 0.1
    ? [...arc(outerKm, s, e), ...arc(innerKm, e, s)]
    : [...arc(outerKm, s, e), [center.lat, center.lng]];
}

export function pointInPolygon(lat, lng, geojson) {
  const ring = geojson?.features?.[0]?.geometry?.coordinates?.[0];
  if (!ring) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]; // GeoJSON: [lng, lat]
    const xj = ring[j][0], yj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi))
      inside = !inside;
  }
  return inside;
}

export function addDirOverlay(map, labelKm, lineKm) {
  for (let i = 0; i < 8; i++) {
    /* jshint ignore:start */
    L.polyline([[AIRPORT.lat, AIRPORT.lng], destPoint(AIRPORT, lineKm, i * 45 + 22.5)],
      { color:'#5a6880', weight:.8, dashArray:'3 5', opacity:.45, interactive:false }).addTo(map);
    /* jshint ignore:end */
  }
  DIRS8.forEach((dir, i) => {
    const pos = destPoint(AIRPORT, labelKm, i * 45);
    L.marker(pos, {
      icon: L.divIcon({ html:`<div class="dir-label">${dir}</div>`, className:'', iconSize:[32,20], iconAnchor:[16,10] }),
      interactive: false
    }).addTo(map);
  });
}

// ── Airport polygon clipping (requires Turf.js loaded globally) ───────────
// Returns a GeoJSON Feature (Polygon/MultiPolygon) with the airport area
// subtracted, or null if turf is unavailable / sector fully inside airport.
// Use with L.geoJSON(result, { style:{...} }) instead of L.polygon().

let _airportGJ = null;
export async function loadAirportGeoJSON() {
  if (_airportGJ !== null) return _airportGJ;
  try {
    const r = await fetch('./airport.geojson');
    _airportGJ = await r.json();
  } catch(e) {
    console.warn('[Airport GeoJSON] Load failed:', e.message);
    _airportGJ = false;
  }
  return _airportGJ;
}

// ── Tab navigation ────────────────────────────────────────────
let _refreshResults = null;
export function registerResultsRefresh(fn) { _refreshResults = fn; }

window.showTab = tab => {
  console.log(`[Nav] Skifter til tab: "${tab}"`);
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('nav.tabs button').forEach((b, i) =>
    b.classList.toggle('active', ['survey','results','about'][i] === tab)
  );
  document.getElementById('tab-' + tab).classList.add('active');
  if (tab === 'results' && _refreshResults) {
    console.log('[Nav] Kalder refreshResults()');
    _refreshResults();
  }
};

// ── Airport polygon clipping (requires Turf.js loaded globally) ───────────
// Returns a GeoJSON Feature (Polygon/MultiPolygon) with the airport area
// subtracted, or null if turf is unavailable / sector is fully inside airport.
// Consume with L.geoJSON(result, { style:{...} }) instead of L.polygon().
export function clipSector(latLngs, airportGJ) {
  if (!airportGJ || typeof turf === 'undefined') return null;
  try {
    // Leaflet [lat,lng] → GeoJSON/Turf [lng,lat]
    const ring = latLngs.map(([la, lo]) => [lo, la]);
    ring.push(ring[0]); // close ring
    const sector  = turf.polygon([ring]);
    const airport = airportGJ.features?.[0];
    if (!airport) return null;
    return turf.difference(sector, airport); // null when sector ⊆ airport
  } catch(e) {
    console.warn('[clipSector]', e.message);
    return null;
  }
}

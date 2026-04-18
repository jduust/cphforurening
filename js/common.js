// ════════════════════════════════════════════════════════════
//  common.js  —  Firebase, constants, helpers, tab navigation
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
  console.log('[Firebase] ✅ Firestore initialiseret korrekt.');
} catch (e) {
  console.error('[Firebase] ❌ Initialisering fejlede:', e.message);
}

// ── Constants ─────────────────────────────────────────────────
export const AIRPORT    = { lat: 55.6180, lng: 12.6560 };
export const DIST_BANDS = ['0-1 km','1-3 km','3-5 km','5-10 km','10-20 km','20+ km'];
export const DIRS8      = ['N','NØ','Ø','SØ','S','SV','V','NV'];
export const COL        = { stoj: '#2a4f8c', luft: '#c06010', psyko: '#5e3a8c' };

export const ALL_SYMS = [
  {v:'Søvnbesvær / svært ved at falde i søvn',               k:'stoj'},
  {v:'Tidlig opvågning eller fragmenteret søvn pga. støj',   k:'stoj'},
  {v:'Konstant træthed pga. forstyrret søvn',                k:'stoj'},
  {v:'Koncentrationsbesvær (hjemmearbejde / lektier)',        k:'stoj'},
  {v:'Tinnitus / konstant ringen eller brummen i ørerne',    k:'stoj'},
  {v:'Hovedpine fra støj',                                   k:'stoj'},
  {v:'Stress og irritabilitet fra vedvarende støjniveau',    k:'stoj'},
  {v:'Vejtrækningsbesvær / åndenød',                         k:'luft'},
  {v:'Vedvarende eller tilbagevendende hoste',               k:'luft'},
  {v:'Irritation i øjne, næse eller svælg',                  k:'luft'},
  {v:'Løbende næse / hyppige forkølelseslignende symptomer', k:'luft'},
  {v:'Kvalme ved lugtgener fra jetbrændstof',                k:'luft'},
  {v:'Hovedpine fra luftforurening eller lugt',              k:'luft'},
  {v:'Kan ikke lufte hjemmet pga. lugtgener',                k:'luft'},
  {v:'Holder børn inde pga. dårlig udeluft',                 k:'luft'},
  {v:'Forværring af eksisterende luftvejssygdom ved lugtgener', k:'luft'},
  {v:'Betydelig forringelse af livskvalitet',                k:'psyko'},
  {v:'Magtesløshed ift. myndighedernes passivitet',          k:'psyko'},
  {v:'Bekymringer for min eller familiens langsigtede helbred', k:'psyko'},
  {v:'Søvnmanglen påvirker min arbejds- eller skoleevne',    k:'psyko'},
  {v:'Overvejer kraftigt at flytte alene pga. lufthavnen',   k:'psyko'},
  {v:'Kender naboer hvis hussalg er mislykket pga. støj eller lugt', k:'psyko'},
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
  if (km < 1)  return '0-1 km';
  if (km < 3)  return '1-3 km';
  if (km < 5)  return '3-5 km';
  if (km < 10) return '5-10 km';
  if (km < 20) return '10-20 km';
  return '20+ km';
}
export function symCount(d)    { return (d.stoj?.length||0) + (d.luft?.length||0) + (d.psyko?.length||0); }
export function hasKronisk(d)  { return d.kronisk?.length > 0 && !d.kronisk.every(v => v === 'Ingen af ovenstående'); }

// ── Tab navigation ────────────────────────────────────────────
// results.js injects refreshResults so we don't need a circular import
let _refreshResults = null;
export function registerResultsRefresh(fn) { _refreshResults = fn; }

window.showTab = tab => {
  console.log(`[Nav] Skifter til tab: "${tab}"`);
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('nav.tabs button').forEach((b, i) =>
    b.classList.toggle('active', ['survey','results','about'][i] === tab)
  );
  document.getElementById('tab-' + tab).classList.add('active');

  if (tab === 'results') {
    if (_refreshResults) {
      console.log('[Nav] Kalder _refreshResults() fra results.js');
      _refreshResults();
    } else {
      console.warn('[Nav] _refreshResults ikke registreret endnu');
    }
  }
};

// ════════════════════════════════════════════════════════════
//  survey.js  —  Spørgeskema: kort, formular, chips, indsendelse
// ════════════════════════════════════════════════════════════

import { db, AIRPORT, EMPLOYEE_BAND, haversineKm, bearingDeg, toDir8, toBand,
         destPoint, sectorLatLngs, BAND_RADII, loadAirportGeoJSON, addDirOverlay, DIRS8,
         pointInPolygon, clipSector } from './common.js';
import { collection, addDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

console.log('[Survey] Modul indlæst.');

// ── Survey map ────────────────────────────────────────────────
const sMap = L.map('map-picker').setView([AIRPORT.lat, AIRPORT.lng], 11);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  { attribution: '© OpenStreetMap', maxZoom: 17 }).addTo(sMap);
L.circleMarker([AIRPORT.lat, AIRPORT.lng],
  { radius: 9, color: '#e8a020', fillColor: '#e8a020', fillOpacity: 1, weight: 2 })
  .bindTooltip('✈ CPH Lufthavn', { permanent: false }).addTo(sMap);
[3,5,10,20].forEach(km =>
  L.circle([AIRPORT.lat, AIRPORT.lng],
    { radius: km * 1000, color: '#2a4f8c', weight: 1, fillOpacity: .02, dashArray: '4 5' })
    .addTo(sMap)
);
addDirOverlay(sMap, 12, 21);
let _airportGJData = null;
loadAirportGeoJSON().then(gj => {
  if (!gj) return;
  _airportGJData = gj;
  const airportPane = sMap.createPane('sAirportPane');
  airportPane.style.zIndex = 450;
  L.geoJSON(gj, { style:{ color:'#155a2e', weight:2, fillColor:'#155a2e', fillOpacity:.15 },
    pane:'sAirportPane' }).addTo(sMap);
});

let uMarker, _zoneHL;
sMap.on('click', e => {
  const { lat, lng } = e.latlng;
  const km  = haversineKm(AIRPORT, { lat, lng });
  const dir = toDir8(bearingDeg(AIRPORT, { lat, lng }));
  const isInsideAirport = _airportGJData ? pointInPolygon(lat, lng, _airportGJData) : km < 1.25;
  const band = isInsideAirport ? EMPLOYEE_BAND : (km < 1.25 ? '1.25-3 km' : toBand(km));
  const isEmp = band === EMPLOYEE_BAND;
  console.log(`[Survey] Klik: ${lat.toFixed(4)}, ${lng.toFixed(4)} → ${band}, ${dir}`);

  ['f-dist-band','f-dist-km','f-dir','f-lat-z','f-lng-z'].forEach((id, i) => {
    document.getElementById(id).value = [
      band, km.toFixed(2), dir,
      (Math.round(lat*100)/100).toFixed(2),
      (Math.round(lng*100)/100).toFixed(2)
    ][i];
  });

  const fb = document.getElementById('map-feedback');

  // Always show symptom sections; toggle nuisance subsections and extra cards
  document.getElementById('resident-sections').style.display = 'block';
  document.getElementById('employee-notice').style.display  = isEmp ? 'block' : 'none';
  document.getElementById('background-card').style.display  = isEmp ? 'none' : '';
  document.getElementById('timing-card').style.display      = isEmp ? 'none' : '';
  // Employees see symptom checkboxes only — hide nuisance subsections
  document.querySelectorAll('.gen-subsection').forEach(el =>
    el.style.display = isEmp ? 'none' : '');
  document.getElementById('kronisk-wrap').style.display     = isEmp ? 'block' : 'none';
  // For residents: kronisk gated by years (overrides above)
  if (!isEmp) {
    const YEARS_FOR_KRONISK = new Set(['2-5 år','5-10 år','Over 10 år']);
    document.getElementById('kronisk-wrap').style.display =
      YEARS_FOR_KRONISK.has(document.getElementById('f-years').value) ? 'block' : 'none';
  }

  if (isEmp) {
    fb.innerHTML = `✈️ <strong>Lufthavnsområdet valgt.</strong> Kun kroniske sygdomme og kræft er relevante for denne zone.`;
    fb.className = 'employee-notice';
  } else {
    fb.textContent = `📍 Det valgte område: ${band} · Retning ${dir} (${km.toFixed(1)} km fra lufthavnen)`;
    fb.className = 'ok';
  }

  if (_zoneHL) { _zoneHL.remove(); _zoneHL = null; }
  if (isEmp && _airportGJData) {
    _zoneHL = L.geoJSON(_airportGJData, {
      style:{ color:'#155a2e', weight:3, fillColor:'#155a2e', fillOpacity:.35, dashArray:'5 3' }
    }).addTo(sMap);
  } else {
    const [inner, outer] = BAND_RADII[band];
    const dirIdx = DIRS8.indexOf(dir);
    const latLngs = sectorLatLngs(AIRPORT, inner, outer, dirIdx);
    const clipped = _airportGJData ? clipSector(latLngs, _airportGJData) : null;
    if (clipped) {
      _zoneHL = L.geoJSON(clipped, {
        style:{ color:'#c0392b', weight:2, fillColor:'#c0392b', fillOpacity:.18, dashArray:'5 3' }
      }).addTo(sMap);
    } else {
      _zoneHL = L.polygon(latLngs, {
        color:'#c0392b', weight:2, fillColor:'#c0392b', fillOpacity:.18, dashArray:'5 3'
      }).addTo(sMap);
    }
  }

  if (uMarker) uMarker.remove();
  uMarker = L.circleMarker([lat, lng],
    { radius: 9, color: isEmp?'#155a2e':'#c0392b',
      fillColor: isEmp?'#155a2e':'#c0392b', fillOpacity: .9, weight: 2 })
    .bindTooltip(isEmp ? `✈️ Ansatzone · ${dir}` : `${band} · ${dir}`,
      { permanent: true, direction: 'top', offset: [0,-12] })
    .addTo(sMap);
});

// ── "Anden kræft" toggle ──────────────────────────────────────
document.querySelectorAll('input[name=kronisk]').forEach(cb => {
  if (cb.value === 'Anden kræfttype') {
    cb.addEventListener('change', e => {
      document.getElementById('andre-kraeft-wrap').style.display = e.target.checked ? 'block' : 'none';
    });
  }
});


// ── Kronisk-sektion: vis kun ved ≥2 år (beboere); altid for ansatte ──
const YEARS_FOR_KRONISK = new Set(['2-5 år','5-10 år','Over 10 år']);
document.getElementById('f-years')?.addEventListener('change', e => {
  // Only gate if resident (employee flow always shows kronisk-wrap on map click)
  const isEmpNow = document.getElementById('f-dist-band').value === EMPLOYEE_BAND;
  if (isEmpNow) return;
  const wrap = document.getElementById('kronisk-wrap');
  if (wrap) wrap.style.display = YEARS_FOR_KRONISK.has(e.target.value) ? 'block' : 'none';
});

// ── Duplicate check ───────────────────────────────────────────
if (localStorage.getItem('lh_v3_done')) {
  console.log('[Survey] Allerede besvaret (localStorage).');
  document.getElementById('notice-done').style.display = 'block';
  document.getElementById('form-wrap').style.display   = 'none';
}

// ── Submit ────────────────────────────────────────────────────
window.submitSurvey = async () => {
  if (!document.getElementById('f-dist-band').value) {
    alert('Klik venligst på kortet for at angive din placering'); return;
  }
  const _isEmpSubmit = document.getElementById('f-dist-band').value === EMPLOYEE_BAND;
  if (!_isEmpSubmit && !document.getElementById('f-years').value) {
    alert('Angiv venligst hvor længe du har boet på adressen'); return;
  }
  if (!_isEmpSubmit && !document.getElementById('f-onset').value) {
    alert('Angiv venligst hvornår du begyndte at mærke generne'); return;
  }
  if (!window._sliderTouched.stoj) {
    document.getElementById('stoj-sev-block')?.scrollIntoView({ behavior:'smooth', block:'center' });
    alert('Angiv venligst din samlede støjgene-vurdering (flyt slideren)'); return;
  }
  if (!window._sliderTouched.luft) {
    document.getElementById('luft-sev-block')?.scrollIntoView({ behavior:'smooth', block:'center' });
    alert('Angiv venligst din samlede luftkvalitetsvurdering (flyt slideren)'); return;
  }
  if (!db) { alert('Firebase ikke konfigureret endnu.'); return; }

  const btn = document.getElementById('btn-sub');
  btn.disabled = true; btn.textContent = 'Sender …';

  const dist_band   = document.getElementById('f-dist-band').value;
  const is_employee = dist_band === EMPLOYEE_BAND;

  const stoj    = Array.from(document.querySelectorAll('input[name=stoj]:checked')).map(c=>c.value)
                  .concat(window._chips.stoj);
  const luft    = Array.from(document.querySelectorAll('input[name=luft]:checked')).map(c=>c.value)
                  .concat(window._chips.luft);
  const psyko   = Array.from(document.querySelectorAll('input[name=psyko]:checked')).map(c=>c.value)
                  .concat(window._chips.psyko);
  const kronisk = Array.from(document.querySelectorAll('input[name=kronisk]:checked')).map(c=>c.value)
                  .concat(window._chips.kronisk);

  const cType = document.getElementById('f-cancer-type')?.value.trim();
  if (cType) { const i=kronisk.indexOf('Anden kræfttype — diagnosticeret efter flytning hertil'); if(i>-1) kronisk[i]+= ` (${cType})`; }

  console.log('[Survey] Indsender:', { is_employee, stoj, luft, psyko, kronisk });

  try {
    const ref = await addDoc(collection(db, 'responses'), {
      dist_band,
      dist_km:     parseFloat(document.getElementById('f-dist-km').value) || null,
      dir:         document.getElementById('f-dir').value,
      lat_z:       parseFloat(document.getElementById('f-lat-z').value)  || null,
      lng_z:       parseFloat(document.getElementById('f-lng-z').value)  || null,
      years:       document.getElementById('f-years').value,
      age:         document.getElementById('f-age').value      || null,
      smoking:     document.getElementById('f-smoking').value  || null,
      traffic:     document.getElementById('f-traffic').value  || null,
      is_employee,
      stoj, luft, psyko, kronisk,
      stoj_sev:    parseInt(document.getElementById('stoj-sev').value),
      luft_sev:    parseInt(document.getElementById('luft-sev').value),
      onset:       document.getElementById('f-onset').value,
      got_worse:   document.getElementById('f-got-worse').value  || null,
      ts:          serverTimestamp()
    });
    console.log('[Survey] ✅ Gemt med ID:', ref.id);
    localStorage.setItem('lh_v3_done', '1');
    document.getElementById('form-wrap').style.display    = 'none';
    document.getElementById('success-wrap').style.display = 'block';
  } catch (e) {
    console.error('[Survey] ❌ Fejl:', e);
    document.getElementById('err-msg').style.display = 'block';
    btn.disabled = false; btn.textContent = 'Send mit svar ›';
  }
};

// ── Custom symptom chips ──────────────────────────────────────
window._chips = { stoj:[], luft:[], psyko:[], kronisk:[], ansatte:[] };

// ── Slider touch tracking ─────────────────────────────────────
window._sliderTouched = { stoj: false, luft: false };
window.markSliderTouched = cat => {
  if (window._sliderTouched[cat]) return;
  window._sliderTouched[cat] = true;
  document.getElementById(`${cat}-sev-block`)?.classList.remove('untouched');
};

window.addCustomSym = cat => {
  const inp = document.getElementById(`custom-${cat}-input`);
  const val = inp.value.trim();
  if (!val || window._chips[cat].includes(val)) { inp.value=''; return; }
  window._chips[cat].push(val);
  inp.value = '';
  renderChips(cat);
};
function renderChips(cat) {
  const el = document.getElementById(`chips-${cat}`);
  if (!el) return;
  el.innerHTML = window._chips[cat].map((v,i) =>
    `<span class="chip">${v}<button title="Fjern" onclick="removeChip('${cat}',${i})">×</button></span>`
  ).join('');
}
window.removeChip = (cat, i) => { window._chips[cat].splice(i,1); renderChips(cat); };
['stoj','luft','psyko','kronisk','ansatte'].forEach(cat => {
  document.getElementById(`custom-${cat}-input`)?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); window.addCustomSym(cat); }
  });
});

// ════════════════════════════════════════════════════════════
//  survey.js  —  Spørgeskema: kort, formular, chips, indsendelse
// ════════════════════════════════════════════════════════════

import { db, AIRPORT, EMPLOYEE_BAND, haversineKm, bearingDeg, toDir8, toBand,
         destPoint, sectorLatLngs, BAND_RADII, loadAirportGeoJSON, addDirOverlay, DIRS8,
         pointInPolygon } from './common.js';
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

  if (isEmp) {
    fb.innerHTML = `✈️ <strong>Ansatzone (0–1,25 km).</strong> Du placerer dig i lufthavnens umiddelbare nærhed — denne zone antages at indeholde ansatte, ikke beboere. Din besvarelse behandles som <em>erhvervseksponering</em>, ikke som naboeksponering. Korrekt, hvis du arbejder i lufthavnen.`;
    fb.className = 'employee-notice';
    const empCb = document.getElementById('f-is-employee');
    if (empCb && !empCb.checked) {
      empCb.checked = true;
      empCb.dispatchEvent(new Event('change'));
    }
  } else {
    fb.textContent = `📍 ${band} fra lufthavnen · Retning: ${dir} (${km.toFixed(1)} km)`;
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
    _zoneHL = L.polygon(sectorLatLngs(AIRPORT, inner, outer, dirIdx), {
      color:'#c0392b', weight:2, fillColor:'#c0392b', fillOpacity:.18, dashArray:'5 3'
    }).addTo(sMap);
  }

  if (uMarker) uMarker.remove();
  uMarker = L.circleMarker([lat, lng],
    { radius: 9, color: isEmp?'#155a2e':'#c0392b',
      fillColor: isEmp?'#155a2e':'#c0392b', fillOpacity: .9, weight: 2 })
    .bindTooltip(isEmp ? `✈️ Ansatzone · ${dir}` : `${band} · ${dir}`,
      { permanent: true, direction: 'top', offset: [0,-12] })
    .addTo(sMap);
});

// ── Ansatte toggle ────────────────────────────────────────────
document.getElementById('f-is-employee')?.addEventListener('change', e => {
  const wrap = document.getElementById('ansatte-symp-wrap');
  if (wrap) wrap.style.display = e.target.checked ? 'block' : 'none';
});

// ── "Anden kræft" toggle ──────────────────────────────────────
document.querySelectorAll('input[name=kronisk]').forEach(cb => {
  if (cb.value === 'Anden kræfttype') {
    cb.addEventListener('change', e => {
      document.getElementById('andre-kraeft-wrap').style.display = e.target.checked ? 'block' : 'none';
    });
  }
});

// ── Severity toggles ──────────────────────────────────────────
['stoj','luft'].forEach(cat => {
  document.querySelectorAll(`input[name=${cat}]`).forEach(cb => {
    cb.addEventListener('change', () => {
      document.getElementById(`${cat}-sev-row`).style.display =
        document.querySelector(`input[name=${cat}]:checked`) ? 'flex' : 'none';
    });
  });
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
  if (!document.getElementById('f-onset').value) {
    alert('Angiv venligst hvornår du begyndte at mærke generne'); return;
  }
  if (!db) { alert('Firebase ikke konfigureret endnu.'); return; }

  const btn = document.getElementById('btn-sub');
  btn.disabled = true; btn.textContent = 'Sender …';

  const is_employee = !!(document.getElementById('f-is-employee')?.checked);

  const stoj    = Array.from(document.querySelectorAll('input[name=stoj]:checked')).map(c=>c.value)
                  .concat(window._chips.stoj);
  const luft    = Array.from(document.querySelectorAll('input[name=luft]:checked')).map(c=>c.value)
                  .concat(window._chips.luft);
  const psyko   = Array.from(document.querySelectorAll('input[name=psyko]:checked')).map(c=>c.value)
                  .concat(window._chips.psyko);
  const kronisk = Array.from(document.querySelectorAll('input[name=kronisk]:checked')).map(c=>c.value)
                  .concat(window._chips.kronisk);
  const ansatte = is_employee
    ? Array.from(document.querySelectorAll('input[name=ansatte]:checked')).map(c=>c.value)
      .concat(window._chips.ansatte)
    : [];

  const cType = document.getElementById('f-cancer-type').value.trim();
  if (cType) { const i=kronisk.indexOf('Anden kræfttype'); if(i>-1) kronisk[i]=`Anden kræft: ${cType}`; }

  console.log('[Survey] Indsender:', { is_employee, stoj, luft, psyko, kronisk, ansatte });

  try {
    const ref = await addDoc(collection(db, 'responses'), {
      dist_band: document.getElementById('f-dist-band').value,
      dist_km:   parseFloat(document.getElementById('f-dist-km').value) || null,
      dir:       document.getElementById('f-dir').value,
      lat_z:     parseFloat(document.getElementById('f-lat-z').value)  || null,
      lng_z:     parseFloat(document.getElementById('f-lng-z').value)  || null,
      years:     document.getElementById('f-years').value    || null,
      age:       document.getElementById('f-age').value      || null,
      kids:      document.getElementById('f-kids').value     || null,
      is_employee,
      stoj, luft, kronisk, psyko, ansatte,
      stoj_sev:  stoj.length  ? parseInt(document.getElementById('stoj-sev').value)  : null,
      luft_sev:  luft.length  ? parseInt(document.getElementById('luft-sev').value)  : null,
      onset:     document.getElementById('f-onset').value,
      wind_sens: document.getElementById('f-wind-sens').value || null,
      ts:        serverTimestamp()
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

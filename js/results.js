// ════════════════════════════════════════════════════════════
//  results.js  —  Live-listener, kort, grafer, statistisk analyse
// ════════════════════════════════════════════════════════════

import { db, AIRPORT, DIST_BANDS, BAND_MIDPOINTS, DIRS8, COL,
         ALL_SYMS, symCount, genCount, hasKronisk, isEmployee,
         EMPLOYEE_BAND, registerResultsRefresh,
         destPoint, sectorLatLngs, BAND_RADII, loadAirportGeoJSON, addDirOverlay }
  from './common.js';
import { collection, onSnapshot, query }
  from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

console.log('[Results] Modul indlæst.');

let _latestDocs = null;

// ── Results map ───────────────────────────────────────────────
let rMap = null;
function initResultsMap() {
  console.log('[Results] Initialiserer resultatkort…');
  rMap = L.map('map-results').setView([AIRPORT.lat, AIRPORT.lng], 10);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { attribution:'© OpenStreetMap', maxZoom:17 }).addTo(rMap);
  L.circleMarker([AIRPORT.lat, AIRPORT.lng],
    { radius:11, color:'#e8a020', fillColor:'#e8a020', fillOpacity:1, weight:2 })
    .bindTooltip('✈ CPH Lufthavn', { permanent:true, direction:'top', offset:[0,-14] })
    .addTo(rMap);
  [3,5,10,20].forEach(km =>
    L.circle([AIRPORT.lat, AIRPORT.lng],
      { radius:km*1000, color:'#2a4f8c', weight:1.5, fillOpacity:.02, dashArray:'4 6' })
      .addTo(rMap)
  );
  addDirOverlay(rMap, 21, 21.5);
  const airportPane = rMap.createPane('rAirportPane');
  airportPane.style.zIndex = 450;
  loadAirportGeoJSON().then(gj => {
    if (!gj) return;
    L.geoJSON(gj, { style:{ color:'#155a2e', weight:2, fillColor:'#155a2e', fillOpacity:.2 },
      pane:'rAirportPane' }).addTo(rMap);
  });
}

function updateResultsMap(docs) {
  if (!rMap) { console.warn('[Results] Kort ikke initialiseret endnu.'); return; }
  if (window._rMarkers) window._rMarkers.forEach(m => m.remove());
  window._rMarkers = [];

  const RES_BANDS = DIST_BANDS.filter(b => b !== EMPLOYEE_BAND);
  const zones = {};
  docs.forEach(d => {
    if (!d.dist_band || !d.dir || !RES_BANDS.includes(d.dist_band)) return;
    const k = `${d.dist_band}|${d.dir}`;
    if (!zones[k]) zones[k] = { band:d.dist_band, dir:d.dir, syms:[], n:0 };
    zones[k].syms.push(symCount(d));
    zones[k].n++;
  });

  Object.values(zones).forEach(z => {
    const avg    = z.syms.reduce((a,b)=>a+b,0) / z.n;
    const t      = Math.min(avg / 10, 1);
    const col    = `rgb(${Math.round(42+t*150)},${Math.round(79-t*36)},${Math.round(140-t*97)})`;
    const dirIdx = DIRS8.indexOf(z.dir);
    if (dirIdx < 0) return;
    const [inner, outer] = BAND_RADII[z.band] || [0, 3];
    const pct  = Math.round(z.syms.filter(s=>s>0).length / z.n * 100);
    const m = L.polygon(sectorLatLngs(AIRPORT, inner, outer, dirIdx), {
      color:'white', weight:1, fillColor:col, fillOpacity:.68
    }).bindPopup(
      `<b>${z.band}</b> &nbsp;·&nbsp; retning <b>${z.dir}</b><br>` +
      `${z.n} svar &nbsp;·&nbsp; gns. <b>${avg.toFixed(1)}</b> symptomer<br>` +
      `${pct}% med mindst ét symptom`
    ).addTo(rMap);
    window._rMarkers.push(m);
  });

  console.log(`[Results] Kort opdateret: ${Object.keys(zones).length} zoner.`);
}

// ── Charts ────────────────────────────────────────────────────
const ch  = {};
const del = id => { if (ch[id]) { ch[id].destroy(); delete ch[id]; } };

function updateAll(docs) {
  // Split residents vs employees
  const resDocs = docs.filter(d => !isEmployee(d));
  const empDocs = docs.filter(d =>  isEmployee(d));
  const n = resDocs.length, nEmp = empDocs.length;
  console.log(`[Results] updateAll(): ${n} beboere, ${nEmp} ansatte.`);

  // ── Summary stats (residents only) ───────────────────────
  const sc = resDocs.map(symCount);
  document.getElementById('st-total').textContent   = n;
  document.getElementById('st-sym').textContent     = n ? (sc.reduce((a,b)=>a+b,0)/n).toFixed(1) : '-';
  document.getElementById('st-pct').textContent     = n ? Math.round(resDocs.filter(d=>symCount(d)>0).length/n*100)+'%' : '-';
  document.getElementById('st-kronisk').textContent = n ? Math.round(resDocs.filter(hasKronisk).length/n*100)+'%' : '-';
  document.getElementById('st-emp').textContent     = nEmp;

  updateResultsMap(docs);

  // ── Per-band (residents only) ─────────────────────────────
  const B = {};
  const RES_BANDS = DIST_BANDS.filter(b => b !== EMPLOYEE_BAND);
  RES_BANDS.forEach(b => B[b] = { n:0, sum:0, ss:[], ls:[], kn:0 });
  resDocs.forEach(d => {
    const b = d.dist_band; if (!b || !B[b]) return;
    B[b].n++; B[b].sum += symCount(d);
    if (d.stoj_sev) B[b].ss.push(d.stoj_sev);
    if (d.luft_sev) B[b].ls.push(d.luft_sev);
    if (hasKronisk(d)) B[b].kn++;
  });
  const AB      = RES_BANDS.filter(b => B[b].n > 0);
  const avg     = b => B[b].n ? +(B[b].sum/B[b].n).toFixed(2) : 0;
  const avgArr  = arr => arr.length ? +(arr.reduce((x,y)=>x+y,0)/arr.length).toFixed(2) : null;
  const distCols = AB.map((_,i) => {
    const t = i / Math.max(AB.length-1,1);
    return `rgba(${Math.round(13+t*179)},${Math.round(30+t*129)},${Math.round(54+t*99)},${1-t*.5})`;
  });
  console.log('[Results] Beboerbånd:', AB.map(b=>`${b}(n=${B[b].n})`).join(', '));

  // Distance gradient chart
  del('dist');
  ch['dist'] = new Chart(document.getElementById('c-dist'), {
    type:'bar',
    data:{ labels: AB.map(b=>b+(B[b].n?` (n=${B[b].n})`:'')),
           datasets:[{ data:AB.map(avg), backgroundColor:distCols, borderRadius:4 }] },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c=>` ${c.raw} symptomer i gns.`}} },
      scales:{ y:{ beginAtZero:true, title:{display:true,text:'Gns. antal symptomer',font:{size:11}}, grid:{color:'#f2f1ee'} },
               x:{ grid:{display:false} } } }
  });

  // Radar chart
  const DR = {}; DIRS8.forEach(d=>DR[d]={s:0,n:0});
  resDocs.forEach(d=>{ if(d.dir&&DR[d.dir]){DR[d.dir].s+=symCount(d);DR[d.dir].n++;} });
  del('radar');
  ch['radar'] = new Chart(document.getElementById('c-radar'), {
    type:'radar',
    data:{ labels:DIRS8,
      datasets:[{ label:'Gns. symptomer', data:DIRS8.map(d=>DR[d].n?+(DR[d].s/DR[d].n).toFixed(2):0),
        backgroundColor:'rgba(42,79,140,.15)', borderColor:'#2a4f8c',
        pointBackgroundColor:'#2a4f8c', pointRadius:4 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
      scales:{ r:{ beginAtZero:true,
        ticks:{ font:{size:9}, stepSize:1, precision:0 },
        pointLabels:{font:{size:11}} } } }
  });

  // Severity chart
  del('sev');
  ch['sev'] = new Chart(document.getElementById('c-sev'), {
    type:'line',
    data:{ labels:AB, datasets:[
      { label:'Støj', data:AB.map(b=>avgArr(B[b].ss)), borderColor:COL.stoj,
        backgroundColor:'rgba(42,79,140,.08)', tension:.35, fill:true,
        pointRadius:5, pointBackgroundColor:COL.stoj, pointBorderColor:'#fff', pointBorderWidth:2, spanGaps:true },
      { label:'Luft', data:AB.map(b=>avgArr(B[b].ls)), borderColor:COL.luft,
        backgroundColor:'rgba(192,96,16,.07)', tension:.35, fill:true,
        pointRadius:5, pointBackgroundColor:COL.luft, pointBorderColor:'#fff', pointBorderWidth:2, spanGaps:true }
    ] },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{position:'bottom',labels:{font:{size:10},boxWidth:10,padding:8}} },
      scales:{ y:{ min:0, max:10, ticks:{stepSize:2},
                   title:{display:true,text:'Gns. alvorlighed (0–10)',font:{size:10}}, grid:{color:'#f2f1ee'} },
               x:{ grid:{display:false}, ticks:{font:{size:9}} } } }
  });

  // Kronisk chart
  del('kronisk');
  ch['kronisk'] = new Chart(document.getElementById('c-kronisk'), {
    type:'bar',
    data:{ labels:AB.map(b=>b+(B[b].n?` (n=${B[b].n})`:'')),
           datasets:[{ label:'% med kronisk sygdom/kræft',
             data:AB.map(b=>B[b].n?+(B[b].kn/B[b].n*100).toFixed(1):0),
             backgroundColor:'rgba(192,57,43,.72)', borderRadius:4 }] },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>` ${c.raw}%`}}},
      scales:{ y:{max:100,title:{display:true,text:'% af respondenter',font:{size:11}},
                  ticks:{callback:v=>v+'%'},grid:{color:'#f2f1ee'}},
               x:{grid:{display:false}} } }
  });

  // Symptom frequency (residents only — symptom-type items only)
  const SC = {}; ALL_SYMS.filter(s=>s.t==='sym').forEach(s=>SC[s.v]=0);
  resDocs.forEach(d=>['stoj','luft','psyko'].forEach(cat=>(d[cat]||[]).forEach(v=>{if(v in SC)SC[v]++;})));
  const sorted = ALL_SYMS.filter(s=>s.t==='sym').map(s=>({...s, pct:n?Math.round(SC[s.v]/n*100):0})).sort((a,b)=>b.pct-a.pct);
  del('sym');
  ch['sym'] = new Chart(document.getElementById('c-sym'), {
    type:'bar',
    data:{ labels:sorted.map(s=>s.v),
           datasets:[{ data:sorted.map(s=>s.pct), backgroundColor:sorted.map(s=>COL[s.k]), borderRadius:3 }] },
    options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>` ${c.raw}%  (${Math.round(c.raw*n/100)} ud af ${n})`}}},
      scales:{ x:{max:100,ticks:{callback:v=>v+'%'},grid:{color:'#f2f1ee'},
                  title:{display:true,text:'% af respondenter',font:{size:11}}},
               y:{grid:{display:false},ticks:{font:{size:10},
                  callback(v){const l=this.getLabelForValue(v);return l.length>44?l.slice(0,41)+'…':l;}}} } }
  });

  // Nuisance / behavioural-impact frequency (residents only)
  const GC = {}; ALL_SYMS.filter(s=>s.t==='gen').forEach(s=>GC[s.v]=0);
  resDocs.forEach(d=>['stoj','luft','psyko'].forEach(cat=>(d[cat]||[]).forEach(v=>{if(v in GC)GC[v]++;})));
  const sortedGen = ALL_SYMS.filter(s=>s.t==='gen').map(s=>({...s,pct:n?Math.round(GC[s.v]/n*100):0})).sort((a,b)=>b.pct-a.pct);
  del('gen');
  const genEl = document.getElementById('c-gen');
  if (genEl) {
    ch['gen'] = new Chart(genEl, {
      type:'bar',
      data:{ labels:sortedGen.map(s=>s.v),
             datasets:[{ data:sortedGen.map(s=>s.pct), backgroundColor:sortedGen.map(s=>COL[s.k]), borderRadius:3 }] },
      options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>` ${c.raw}%  (${Math.round(c.raw*n/100)} ud af ${n})`}}},
        scales:{ x:{max:100,ticks:{callback:v=>v+'%'},grid:{color:'#f2f1ee'},
                    title:{display:true,text:'% af respondenter',font:{size:11}}},
                 y:{grid:{display:false},ticks:{font:{size:10},
                    callback(v){const l=this.getLabelForValue(v);return l.length>44?l.slice(0,41)+'…':l;}}} } }
    });
  }

  // Onset chart
  const OC = {}; resDocs.forEach(d=>{if(d.onset)OC[d.onset]=(OC[d.onset]||0)+1;});
  const OO = ['Oplever ingen mærkbare gener','Før 2015','2015-2019','2020-2022',
               '2023','2024','2025','Husker ikke præcist'];
  const OL = OO.filter(k=>OC[k]);
  del('onset');
  ch['onset'] = new Chart(document.getElementById('c-onset'), {
    type:'bar',
    data:{ labels:OL, datasets:[{data:OL.map(k=>OC[k]||0),backgroundColor:'#5e3a8c',borderRadius:4}] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
      scales:{ y:{beginAtZero:true,ticks:{stepSize:1},grid:{color:'#f2f1ee'},
                  title:{display:true,text:'Antal svar',font:{size:11}}},
               x:{grid:{display:false}} } }
  });

  // ── Employee symptom chart (sym-type items from stoj/luft/psyko) ──
  const empSC = {}; ALL_SYMS.filter(s=>s.t==='sym').forEach(s=>empSC[s.v]=0);
  empDocs.forEach(d=>['stoj','luft','psyko'].forEach(cat=>(d[cat]||[]).forEach(v=>{if(v in empSC)empSC[v]++;})));
  const empSorted = ALL_SYMS.filter(s=>s.t==='sym' && empSC[s.v]>0)
    .map(s=>({...s, pct:nEmp?Math.round(empSC[s.v]/nEmp*100):0})).sort((a,b)=>b.pct-a.pct);
  const empEl = document.getElementById('c-ansatte');
  if (empEl) {
    del('ansatte');
    if (empSorted.length > 0) {
      ch['ansatte'] = new Chart(empEl, {
        type:'bar',
        data:{ labels:empSorted.map(s=>s.v),
               datasets:[{data:empSorted.map(s=>s.pct),
                          backgroundColor:empSorted.map(s=>COL[s.k]),borderRadius:3}] },
        options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false,
          plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>` ${c.raw}% af ansatte`}}},
          scales:{ x:{max:100,ticks:{callback:v=>v+'%'},grid:{color:'#f2f1ee'},
                      title:{display:true,text:'% af ansatte',font:{size:11}}},
                   y:{grid:{display:false},ticks:{font:{size:10},
                      callback(v){const l=this.getLabelForValue(v);return l.length>44?l.slice(0,41)+'…':l;}}} } }
      });
    } else {
      empEl.style.display = 'none';
      const p = empEl.parentElement?.querySelector('.chart-sub');
      if (p) p.textContent = 'Ingen symptomdata for ansatte endnu.';
    }
  }

  console.log('[Results] Alle grafer opdateret ✅');
}

// ── Datalists ─────────────────────────────────────────────────
function populateDataLists(docs) {
  const sets = {stoj:new Set(),luft:new Set(),psyko:new Set(),kronisk:new Set(),ansatte:new Set()};
  const PRE_STOJ   = new Set(['Søvnbesvær / svært ved at falde i søvn','Tidlig opvågning eller fragmenteret søvn pga. støj','Konstant træthed pga. forstyrret søvn','Koncentrationsbesvær (hjemmearbejde / lektier)','Tinnitus / konstant ringen eller brummen i ørerne','Hovedpine fra støj','Stress og irritabilitet fra vedvarende støjniveau']);
  const PRE_LUFT   = new Set(['Vejtrækningsbesvær / åndenød','Vedvarende eller tilbagevendende hoste','Irritation i øjne, næse eller svælg','Løbende næse / hyppige forkølelseslignende symptomer','Kvalme ved lugtgener fra jetbrændstof','Hovedpine fra luftforurening eller lugt','Kan ikke lufte hjemmet pga. lugtgener','Holder børn inde pga. dårlig udeluft','Forværring af eksisterende luftvejssygdom ved lugtgener']);
  const PRE_PSYKO  = new Set(['Betydelig forringelse af livskvalitet','Magtesløshed ift. myndighedernes passivitet','Bekymringer for min eller familiens langsigtede helbred','Søvnmanglen påvirker min arbejds- eller skoleevne','Overvejer kraftigt at flytte alene pga. lufthavnen','Kender naboer hvis hussalg er mislykket pga. støj eller lugt']);
  const PRE_ANSAT  = new Set(['Kerosindampe / brændstofdampe på arbejdspladsen','Kraftig støjeksponering tæt på fly og motorer','Vibrationsgener fra fly eller ground equipment','Hudirritationer eller øjenirritationer pga. arbejdsmiljø','Hørenedsættelse/tinnitus relateret til arbejde','Kroniske luftvejsproblemer relateret til arbejde']);
  docs.forEach(d => {
    (d.stoj  ||[]).filter(v=>!PRE_STOJ.has(v)).forEach(v=>sets.stoj.add(v));
    (d.luft  ||[]).filter(v=>!PRE_LUFT.has(v)).forEach(v=>sets.luft.add(v));
    (d.psyko ||[]).filter(v=>!PRE_PSYKO.has(v)).forEach(v=>sets.psyko.add(v));
    (d.kronisk||[]).forEach(v=>sets.kronisk.add(v));
    (d.ansatte||[]).filter(v=>!PRE_ANSAT.has(v)).forEach(v=>sets.ansatte.add(v));
  });
  ['stoj','luft','psyko','kronisk','ansatte'].forEach(cat => {
    const dl = document.getElementById(`dl-${cat}`);
    if (dl) dl.innerHTML=[...sets[cat]].sort().map(v=>`<option value="${v.replace(/"/g,'&quot;')}">`).join('');
  });
}

// ── Chi-squared helpers ───────────────────────────────────────
function logGamma(z) {
  const c=[76.18009172947146,-86.50532032941677,24.01409824083091,-1.231739572450155,0.001208650973866179,-5.395239384953e-6];
  let y=z,x=z,tmp=x+5.5; tmp-=(x+0.5)*Math.log(tmp);
  let ser=1.000000000190015; for(let j=0;j<6;j++) ser+=c[j]/(++y);
  return -tmp+Math.log(2.5066282746310005*ser/x);
}
function gammaIncP(a,x) {
  if(x<=0)return 0; let sum=1/a,term=1/a;
  for(let k=1;k<300;k++){term*=x/(a+k);sum+=term;if(Math.abs(term)<1e-12*Math.abs(sum))break;}
  return Math.exp(-x+a*Math.log(x)-logGamma(a))*sum;
}
function chiP(chi2,df) { return Math.max(0,Math.min(1,1-gammaIncP(df/2,chi2/2))); }
function pFmt(p)       { return p<0.001?'< 0,001':p.toFixed(4); }
function hasSym(d)     { return symCount(d) > 0; }

// Weighted linear regression — returns {slope, intercept, r2}
function weightedLinReg(xy) {
  // xy = [{x, y, w}]
  const pts = xy.filter(p=>p.w>0 && p.y!==null);
  if (pts.length < 2) return null;
  const sw=pts.reduce((a,p)=>a+p.w,0);
  const swx=pts.reduce((a,p)=>a+p.w*p.x,0), swy=pts.reduce((a,p)=>a+p.w*p.y,0);
  const swx2=pts.reduce((a,p)=>a+p.w*p.x*p.x,0), swxy=pts.reduce((a,p)=>a+p.w*p.x*p.y,0);
  const denom=sw*swx2-swx*swx;
  if(!denom)return null;
  const slope=(sw*swxy-swx*swy)/denom;
  const intercept=(swy-slope*swx)/sw;
  const yMean=swy/sw;
  const ssTot=pts.reduce((a,p)=>a+p.w*(p.y-yMean)**2,0);
  const ssRes=pts.reduce((a,p)=>a+p.w*(p.y-(slope*p.x+intercept))**2,0);
  const r2=ssTot>0?1-ssRes/ssTot:0;
  return {slope,intercept,r2};
}

// ── Scientific analysis ───────────────────────────────────────
function updateScientific(docs) {
  const resDocs = docs.filter(d => !isEmployee(d));
  const n = resDocs.length;
  console.log(`[Results] updateScientific(): ${n} beboere.`);
  if (!n) return;

  const RES_BANDS = DIST_BANDS.filter(b => b !== EMPLOYEE_BAND);

  // 1. Dose-response table (all resident zones)
  const dd = RES_BANDS.map(zone => {
    const sub = resDocs.filter(d=>d.dist_band===zone);
    const nS  = sub.filter(hasSym).length;
    return { zone, n:sub.length, nS, rate:sub.length?nS/sub.length*100:null,
             mid:BAND_MIDPOINTS[zone] };
  });
  const maxR = Math.max(...dd.filter(d=>d.rate!==null).map(d=>d.rate), 1);
  document.getElementById('dose-tbl').innerHTML =
    `<table class="dose-table"><thead><tr>
      <th>Afstandszone</th><th>n</th><th>Med symptomer</th><th>Symptomrate</th>
    </tr></thead><tbody>
    ${dd.map(d=>`<tr><td class="dzone">${d.zone}</td><td>${d.n}</td><td>${d.nS}</td>
      <td class="drate">${d.rate!==null?d.rate.toFixed(1)+'%':'-'}
      ${d.rate!==null?`<span class="dbar" style="width:${Math.round(d.rate/maxR*80)}px"></span>`:''}</td>
    </tr>`).join('')}</tbody></table>`;

  // Gradient note
  const active    = dd.filter(d=>d.n>0);
  const doseNote  = document.getElementById('dose-note');
  const withData  = dd.filter(d=>d.n>=3);
  if (withData.length >= 2) {
    doseNote.style.display = 'block';
    const first=withData[0].rate, last=withData[withData.length-1].rate;
    doseNote.className = first>last?'notice notice-success':'notice notice-warn';
    doseNote.innerHTML = first>last
      ? `📈 <strong>Gradient observeret:</strong> Symptomraten falder fra ${first.toFixed(1)}% (nærmeste zone) til ${last.toFixed(1)}% (fjerneste zone) — understøtter biologisk plausibel årsagssammenhæng.`
      : `⚠ Gradienten er endnu ikke entydig — sandsynligvis pga. få svar i visse zoner.`;
  }

  // Dose bar chart
  del('dose');
  ch['dose'] = new Chart(document.getElementById('c-dose'), {
    type:'bar',
    data:{ labels:active.map(d=>d.zone),
      datasets:[{ label:'Symptomrate (%)', data:active.map(d=>d.rate??0),
        backgroundColor:active.map((_,i)=>`rgba(192,57,43,${(1-i/Math.max(active.length-1,1)*.65).toFixed(2)})`),
        borderRadius:4 }] },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>` ${c.raw?.toFixed(1)}% (n=${active[c.dataIndex]?.n})`}}},
      scales:{ y:{min:0,max:100,ticks:{callback:v=>v+'%'},title:{display:true,text:'Andel med ≥1 symptom (%)',font:{size:10}},grid:{color:'#f2f1ee'}},
               x:{grid:{display:false}} } }
  });

  // ── 2. Gradient regression across ALL zones ───────────────
  const regData = active.map(d => ({ x:d.mid, y:d.rate??0, w:d.n }));
  const reg     = weightedLinReg(regData);
  const gradEl  = document.getElementById('gradient-body');
  if (gradEl && reg) {
    const slopeDir = reg.slope < 0 ? '📉 Faldende' : '📈 Stigende';
    gradEl.innerHTML = `
      <div class="rr-grid" style="margin-bottom:.9rem">
        <div class="rr-box">
          <div class="rr-num" style="color:var(--navy);font-size:1.2rem">${reg.slope.toFixed(2)}</div>
          <div class="rr-lbl">Hældning (%/km)</div>
        </div>
        <div class="rr-box">
          <div class="rr-num" style="color:var(--navy);font-size:1.2rem">${(reg.r2*100).toFixed(1)}%</div>
          <div class="rr-lbl">R² (forklaret varians)</div>
        </div>
        <div class="rr-box">
          <div class="rr-num" style="color:var(--navy);font-size:1.2rem">${active.length}</div>
          <div class="rr-lbl">Zoner med data</div>
        </div>
      </div>
      <div class="rr-interp" style="border-left-color:var(--navy-light)">
        ${slopeDir} gradient på <strong>${reg.slope.toFixed(2)} procentpoint pr. km</strong> med vægtede mindste kvadraters regression (R² = ${(reg.r2*100).toFixed(1)}%).
        ${reg.slope<0&&reg.r2>0.5?'<strong>Stærk negativ gradient</strong> — stærkt indicium for dosis-respons-sammenhæng med afstand som eksponering.':reg.slope<0?'Negativ gradient — retning som forventet, men R² kræver flere svar for at styrke signalet.':'Gradienten er endnu ikke negativ — del linket for at indhente svar fra alle zoner.'}
      </div>
      <details style="margin-top:.9rem">
        <summary>🔍 Regressionsgrundlag (alle zoner)</summary>
        <div class="formula">${active.map(d=>`${d.zone}: rate=${d.rate?.toFixed(1)??'-'}%, n=${d.n}, midpunkt=${d.mid}km`).join('\n')}\n\nVægtet lineær regression: rate = ${reg.intercept.toFixed(2)} + ${reg.slope.toFixed(4)}·afstand\nR² = ${reg.r2.toFixed(4)}</div>
      </details>`;
  } else if (gradEl) {
    gradEl.innerHTML = `<div class="notice notice-warn">⏳ Kræver svar fra mindst 2 zoner for at beregne gradienten.</div>`;
  }

  // ── 3. Relative Risk (innermost vs outermost with data) ───
  const innerBand = active[0]?.zone;
  const outerBand = active[active.length-1]?.zone;
  const exp   = innerBand ? resDocs.filter(d=>d.dist_band===innerBand) : [];
  const unexp = outerBand && outerBand!==innerBand ? resDocs.filter(d=>d.dist_band===outerBand) : [];
  const a=exp.filter(hasSym).length,   b=exp.length-exp.filter(hasSym).length;
  const c=unexp.filter(hasSym).length, d2=unexp.length-unexp.filter(hasSym).length;
  const rE=(a+b)?a/(a+b):0, rU=(c+d2)?c/(c+d2):0;
  const rr = rU>0 ? rE/rU : null;
  let lo=null,hi=null,se=null;
  if (rr&&a>0&&b>0&&c>0&&d2>0) {
    se=Math.sqrt(b/(a*(a+b))+d2/(c*(c+d2)));
    lo=Math.exp(Math.log(rr)-1.96*se); hi=Math.exp(Math.log(rr)+1.96*se);
  }
  console.log(`[Results] RR=${rr?.toFixed(2)??'N/A'} (${innerBand} vs ${outerBand}), KI=[${lo?.toFixed(2)??'-'}, ${hi?.toFixed(2)??'-'}]`);
  document.getElementById('rr-v').textContent  = rr?rr.toFixed(2)+'x':'-';
  document.getElementById('rr-lo').textContent = lo?lo.toFixed(2)+'x':'-';
  document.getElementById('rr-hi').textContent = hi?hi.toFixed(2)+'x':'-';
  document.getElementById('rr-bands').textContent = innerBand&&outerBand ? `${innerBand} vs. ${outerBand}` : '';
  const rrI = document.getElementById('rr-interp');
  if(rr&&lo&&hi)
    rrI.innerHTML=`Beboere i <strong>${innerBand}</strong> har en <strong>${rr.toFixed(2)} gange højere risiko</strong> for helbredssymptomer vs. ${outerBand}. 95% KI: [${lo.toFixed(2)}; ${hi.toFixed(2)}] — ${lo>1?'<strong>inkluderer ikke 1,0</strong> ✅ statistisk signifikant.':'inkluderer 1,0 — kræver flere svar.'}`;
  else if(!(a+b)||!(c+d2))
    rrI.innerHTML=`Mangler svar fra inderste <em>eller</em> yderste zone for at beregne RR.`;
  else
    rrI.innerHTML=`${innerBand??'?'}: ${(rE*100).toFixed(1)}% (n=${a+b}) &nbsp;|&nbsp; ${outerBand??'?'}: ${(rU*100).toFixed(1)}% (n=${c+d2}).`;
  document.getElementById('rr-formula').textContent=
    `RR = P(sym | ${innerBand}) / P(sym | ${outerBand})\n`+
    `   = ${a}/${a+b} / ${c}/${c+d2} = ${rE.toFixed(4)} / ${rU.toFixed(4)} = ${rr?rr.toFixed(4):'-'}\n`+
    (se?`SE(ln RR) = ${se.toFixed(4)}\n95% KI = [${lo?.toFixed(4)}, ${hi?.toFixed(4)}]`:'Behov for svar i begge ydergrupper.');

  // ── 4. Chi-squared (nærmeste 2 beboerbånd vs fjerneste 2) ─
  const nearBands = ['1.25-3 km','3-5 km'];
  const farBands  = ['10-20 km','20+ km'];
  const near = resDocs.filter(d=>nearBands.includes(d.dist_band));
  const far  = resDocs.filter(d=>farBands.includes(d.dist_band));
  const cA=near.filter(hasSym).length, cB=near.length-cA;
  const cC=far.filter(hasSym).length,  cD=far.length-cC;
  const cN=cA+cB+cC+cD;
  const denom=(cA+cB)*(cC+cD)*(cA+cC)*(cB+cD);
  const chi2=cN>0&&denom>0?cN*Math.pow(cA*cD-cB*cC,2)/denom:0;
  const pv=chiP(chi2,1);
  console.log(`[Results] χ²=${chi2.toFixed(3)}, p=${pv.toFixed(6)}, n=${cN}`);
  document.getElementById('chi-v').textContent=chi2.toFixed(2);
  document.getElementById('chi-p').textContent=pFmt(pv);
  const verd=document.getElementById('chi-verdict');
  if(cN<10) verd.innerHTML=`<div class="verdict verdict-ns">⏳ <span><strong>For få data endnu (n=${cN})</strong><br>Del linket for at samle svar fra nær- og fjernzone.</span></div>`;
  else if(pv<0.001) verd.innerHTML=`<div class="verdict verdict-sig">✅ <span><strong>Vi forkaster H₀ (p < 0,001)</strong><br>Stærkt statistisk signifikant.</span></div>`;
  else if(pv<0.05)  verd.innerHTML=`<div class="verdict verdict-sig">✅ <span><strong>Vi forkaster H₀ (p = ${pFmt(pv)})</strong><br>Statistisk signifikant sammenhæng.</span></div>`;
  else              verd.innerHTML=`<div class="verdict verdict-ns">⚠️ <span><strong>H₀ kan endnu ikke forkastes (p = ${pFmt(pv)})</strong><br>Endnu for få svar.</span></div>`;
  const rNear=(cA+cB)?`${(cA/(cA+cB)*100).toFixed(1)}%`:'-';
  const rFar =(cC+cD)?`${(cC/(cC+cD)*100).toFixed(1)}%`:'-';
  document.getElementById('chi-tbl').innerHTML=`<table class="dose-table"><thead><tr>
    <th></th><th>Symptomer: Ja</th><th>Symptomer: Nej</th><th>I alt</th><th>Rate</th></tr></thead><tbody>
    <tr><td class="dzone">Nær (1,25-5 km)</td><td>${cA}</td><td>${cB}</td><td>${cA+cB}</td><td class="drate">${rNear}</td></tr>
    <tr><td class="dzone">Fjern (10+ km)</td><td>${cC}</td><td>${cD}</td><td>${cC+cD}</td><td class="drate">${rFar}</td></tr>
    <tr style="font-weight:600"><td>I alt</td><td>${cA+cC}</td><td>${cB+cD}</td><td>${cN}</td><td></td></tr>
    </tbody></table>
    <div style="font-size:.77rem;color:var(--muted);margin-top:.5rem;font-family:'Space Mono',monospace">χ² = ${chi2.toFixed(4)}, p = ${pv<0.001?'< 0,001':pv.toFixed(6)}</div>`;

  // ── 5. Conclusion ─────────────────────────────────────────
  const withD=dd.filter(d=>d.n>=3);
  const hasGrad=withD.length>=2&&withD[0].rate>withD[withD.length-1].rate;
  const rrStr=rr?rr.toFixed(2):'-';
  const kiStr=(lo&&hi)?`[${lo.toFixed(2)}-${hi.toFixed(2)}]`:'[-]';
  document.getElementById('concl-body').innerHTML=`
  <p style="color:var(--muted);font-size:.88rem;line-height:1.8;margin-bottom:1rem">Analysen af <strong>${n} beboerrespondenter</strong> viser:</p>
  <div class="concl-grid">
    <div class="concl-item"><div class="concl-n">1.</div>
      <div style="font-weight:600;margin-bottom:.25rem;font-size:.87rem">Dosis-respons</div>
      <div class="concl-desc">${hasGrad?`Gradient fra ${withD[0].rate.toFixed(1)}% (nærmeste) til ${withD[withD.length-1].rate.toFixed(1)}% (fjerneste) — Bradford Hill-overensstemmelse.`:'Gradienten er under dannelse.'}</div>
    </div>
    <div class="concl-item"><div class="concl-n">2.</div>
      <div style="font-weight:600;margin-bottom:.25rem;font-size:.87rem">Lineær gradient</div>
      <div class="concl-desc">${reg?`Hældning = ${reg.slope.toFixed(2)} %/km, R² = ${(reg.r2*100).toFixed(1)}% (${active.length} zoner).`:'Kræver svar fra ≥2 zoner.'}</div>
    </div>
    <div class="concl-item"><div class="concl-n">3.</div>
      <div style="font-weight:600;margin-bottom:.25rem;font-size:.87rem">RR & χ²-test</div>
      <div class="concl-desc">RR = ${rrStr} ${kiStr}. χ² = ${chi2.toFixed(2)}, p ${pv<0.001?'< 0,001':'= '+pFmt(pv)}. ${pv<0.05?'H₀ forkastes.':'Endnu ikke signifikant.'}</div>
    </div>
  </div>
  <div class="notice notice-warn" style="margin:0">
    <strong>Anbefaling:</strong> Disse fund ${hasGrad&&pv<0.05?'opfylder flere af':'er på vej mod at opfylde'} Bradford Hill-kriterierne og bør præsenteres for kommunen med krav om officiel epidemiologisk undersøgelse.
    ${n<50?' <em>Del linket for at styrke evidensen.</em>':''}
  </div>`;
}

// ── Full refresh ──────────────────────────────────────────────
function refreshResults() {
  console.log('[Results] refreshResults() kaldt.');
  if (!rMap) {
    initResultsMap();
  } else {
    setTimeout(() => { rMap.invalidateSize(); }, 150);
  }
  if (_latestDocs !== null) {
    console.log(`[Results] Genrenderer med ${_latestDocs.length} cached docs.`);
    updateAll(_latestDocs);
    updateScientific(_latestDocs);
    if (rMap) updateResultsMap(_latestDocs);
  } else {
    console.warn('[Results] Ingen data i cache endnu.');
  }
}
registerResultsRefresh(refreshResults);

// ── Live Firestore listener ───────────────────────────────────
if (db) {
  console.log('[Results] Opretter onSnapshot-lytter…');
  onSnapshot(query(collection(db,'responses')), snap => {
    const docs = snap.docs.map(d=>d.data());
    console.log(`[Results] onSnapshot: ${docs.length} docs (${snap.docChanges().length} ændringer).`);
    _latestDocs = docs;
    populateDataLists(docs);
    const tab = document.getElementById('tab-results');
    if (tab?.classList.contains('active')) {
      console.log('[Results] Tab aktiv — opdaterer live.');
      updateAll(docs);
      updateScientific(docs);
    } else {
      console.log('[Results] Tab skjult — data cached.');
    }
  }, err => {
    console.error('[Results] ❌ onSnapshot fejl:', err.code, err.message);
  });
} else {
  _latestDocs = [];
  updateAll([]);
}

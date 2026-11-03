/**
 * AcousticReportDownload.jsx
 * All report-building, PDF download, Word download, and DownloadModal logic.
 * Receives `allForms` (object keyed by path slug) and `allLiveLp` (same keys).
 * Each path sheet is built independently and combined into one report.
 */

import { useState, useMemo } from "react";
import { Loader2, FileText, FileIcon } from "lucide-react";
import toast from "react-hot-toast";

/* ── Constants (duplicated here so this file is self-contained) ── */
const BANDS     = [63, 125, 250, 500, 1000, 2000, 4000, 8000];
const BAND_KEYS = ["hz63","hz125","hz250","hz500","hz1000","hz2000","hz4000","hz8000"];
const A_WEIGHT  = [-26.2, -16.1, -8.6, -3.2, 0, 1.2, 1.0, -1.1];
const A_WEIGHTING = { hz63:-26.2, hz125:-16.1, hz250:-8.6, hz500:-3.2, hz1000:0, hz2000:1.2, hz4000:1.0, hz8000:-1.1 };

const NOISE_PATH_LABEL = {
  exhaust:                "Exhaust Air",
  intake:                 "Intake Air",
  through_wall:           "Through Wall (Radiated)",
  through_door:           "Through Door (Radiated)",
  through_ceiling_above:  "Through Ceiling Above (Radiated)",
  through_ceiling_below:  "Through Ceiling Below (Radiated)",
};

/* ── Helpers ── */
function round1(n) { return Math.round(n * 10) / 10; }
function fmt2(n)   { return (Math.round(n * 100) / 100).toFixed(2); }
const fmtN = v => { const n=Number(v); return (v===undefined||v===null||v===""||isNaN(n)||!isFinite(n)) ? "-" : n.toFixed(1); };
const skipN = v => v===undefined||v===null||v===0||Number(v)===0||v===""||v==="-";

/* ── Calc functions (exact copies — no equations changed) ── */
function mmToFt(mm) { return mm / 304.8; }

function calcUnlinedIL(width_mm, height_mm, length_m) {
  const W = Number(width_mm); const H = Number(height_mm); const L = Number(length_m);
  if (!W || !H || !L) return null;
  const wft = mmToFt(W); const hft = mmToFt(H);
  const lft = L * 3.28084;
  const P = 2*(wft+hft); const S = wft*hft;
  return BANDS.map(f => {
    if (P/S >= 2) return round1(Math.min(1.5*(P/S)**0.25*lft, 10));
    return round1((0.1*P)/S*lft);
  });
}

const LINED_DEFAULT = {
  A: [0.04, 0.08, 0.14, 0.22, 0.32, 0.40, 0.53, 0.53],
  B: [1.959, 1.41, 0.824, 0.5, 0.695, 0.802, 0.451, 0.219],
  C: [0.917, 0.941, 1.079, 1.087, 0, 0, 0, 0],
};
function calcLinedIL(width_mm, height_mm, length_m, thickness_in, coeffAOverride) {
  const W = Number(width_mm); const H = Number(height_mm);
  const L = Number(length_m); const t = Number(thickness_in)||1;
  if (!W || !H || !L) return null;
  const wft = mmToFt(W); const hft = mmToFt(H);
  const lft = L * 3.28084;
  const P = 2*(wft+hft); const S = wft*hft;
  return BANDS.map((_, i) => {
    const A = (coeffAOverride && BAND_KEYS[i] && Number(coeffAOverride[BAND_KEYS[i]])) || LINED_DEFAULT.A[i];
    const B = LINED_DEFAULT.B[i]; const C = LINED_DEFAULT.C[i];
    return round1(A * (P/S)**B * t**C * lft);
  });
}

const ELBOW_WIDTH_BREAKS = [200, 400, 800];
const ELBOW_UNLINED_TBL = [
  [0,0,0,1,5,8,4,3],[0,1,5,5,8,4,3,3],[0,5,5,8,4,3,3,3],[1,5,8,4,3,3,3,3],
];
const ELBOW_LINED_TBL = [
  [0,0,0,1,6,11,10,10],[0,1,6,6,11,10,10,10],[0,6,6,11,10,10,10,10],[1,6,11,10,10,10,10,10],
];
function getElbowRowIdx(w) {
  const W = Number(w);
  if (W <= ELBOW_WIDTH_BREAKS[0]) return 0;
  if (W <= ELBOW_WIDTH_BREAKS[1]) return 1;
  if (W <= ELBOW_WIDTH_BREAKS[2]) return 2;
  return 3;
}
function calcElbowIL(width_mm, elbows, lined) {
  const n = Number(elbows); if (!n || n <= 0) return null;
  const ri  = getElbowRowIdx(width_mm);
  const tbl = lined ? ELBOW_LINED_TBL : ELBOW_UNLINED_TBL;
  return tbl[ri].map(v => v * n);
}

function calcERL(width_mm, height_mm) {
  const W = Number(width_mm); const H = Number(height_mm);
  if (!W || !H) return null;
  const area_ft2 = (W/1000)*(H/1000) * 10.7639;
  const D_ft = Math.sqrt(4*area_ft2/Math.PI);
  const a1=0.7; const c0=1125.33;
  return BANDS.map(f => {
    const ratio = (a1*c0)/(Math.PI*f*D_ft);
    return round1(10*Math.log10(1+ratio*ratio) * -1);
  });
}

function calcDistanceEffect(distance_m, directivity) {
  const r = Number(distance_m)||1; const Q = Number(directivity)||1;
  if (r <= 0) return null;
  const il = 10*Math.log10(Q/(4*Math.PI*r*r));
  const val = Math.round(il*100)/100;
  return Object.fromEntries(BAND_KEYS.map(k=>[k,val]));
}

function liveSchultzOffsets(length_m, width_m, height_m, distance_m) {
  const V = Number(length_m)*Number(width_m)*Number(height_m);
  const r = Number(distance_m)||3;
  if (V <= 0) return null;
  return BANDS.map(f => -10*Math.log10(r) - 5*Math.log10(V) - 3*Math.log10(f) + 12);
}

function calcRockwoolRVC(L, W, H, alphaObj) {
  const V = Number(L)*Number(W)*Number(H);
  if (!V || V <= 0) return null;
  const S = 2*(Number(L)*Number(W) + Number(L)*Number(H) + Number(W)*Number(H));
  return BAND_KEYS.map(k => {
    const alpha = Number(alphaObj?.[k])||0;
    const A = S*alpha;
    if (!A || A <= 0) return 0;
    const T = 0.161*V/A;
    return round1(10*Math.log10(V) - 10*Math.log10(T) - 14);
  });
}

// ── NC lookup tables (exact same as main form) ──
const NC_TABLE_LEFT  = [[47,36,29,22,17,14,12,11],[54,44,35,28,22,18,15,13],[59,48,39,31,24,20,17,16],[63,52,43,34,27,22,19,17],[67,57,47,38,30,25,21,19],[70,60,50,41,33,27,23,21],[73,62,53,44,35,29,25,22],[75,64,56,47,38,31,27,24],[78,67,58,49,40,33,28,26],[80,69,61,52,42,35,30,27]];
const NC_TABLE_STEPS = [20,25,30,35,40,45,50,55,60,65];

function findRowByDbaTotal(stcInput) {
  const val = Number(stcInput);
  const STC_ROWS = [
    {nc:20,dba:[-45,-35,-29,-25,-22,-20,-19,-18],left:NC_TABLE_LEFT[0]},
    {nc:25,dba:[-40,-30,-24,-20,-18,-16,-15,-14],left:NC_TABLE_LEFT[1]},
    {nc:30,dba:[-35,-26,-20,-16,-14,-12,-11,-10],left:NC_TABLE_LEFT[2]},
    {nc:35,dba:[-31,-22,-17,-13,-11,-9,-8,-7],left:NC_TABLE_LEFT[3]},
    {nc:40,dba:[-27,-18,-13,-10,-8,-6,-5,-4],left:NC_TABLE_LEFT[4]},
    {nc:45,dba:[-23,-14,-9,-6,-5,-3,-3,-2],left:NC_TABLE_LEFT[5]},
    {nc:50,dba:[-19,-10,-5,-3,-2,-1,0,0],left:NC_TABLE_LEFT[6]},
    {nc:55,dba:[-15,-6,-2,0,2,4,4,5],left:NC_TABLE_LEFT[7]},
    {nc:60,dba:[-11,-3,1,3,5,6,7,7],left:NC_TABLE_LEFT[8]},
    {nc:65,dba:[-7,0,4,7,8,10,10,11],left:NC_TABLE_LEFT[9]},
  ];
  const sorted = [...STC_ROWS].sort((a,b)=>Math.abs(a.nc-val)-Math.abs(b.nc-val));
  return sorted[0];
}

function getNCCriteria(ncLevel) {
  const row = findRowByDbaTotal(ncLevel);
  return row ? row.left : BAND_KEYS.map(()=>0);
}

function calcNCRating(lpBand) {
  const NC_LEFT = [
    {nc:20,vals:[47,36,29,22,17,14,12,11]},{nc:25,vals:[54,44,35,28,22,18,15,13]},
    {nc:30,vals:[59,48,39,31,24,20,17,16]},{nc:35,vals:[63,52,43,34,27,22,19,17]},
    {nc:40,vals:[67,57,47,38,30,25,21,19]},{nc:45,vals:[70,60,50,41,33,27,23,21]},
    {nc:50,vals:[73,62,53,44,35,29,25,22]},{nc:55,vals:[75,64,56,47,38,31,27,24]},
    {nc:60,vals:[78,67,58,49,40,33,28,26]},{nc:65,vals:[80,69,61,52,42,35,30,27]},
    {nc:70,vals:[83,72,64,55,45,37,32,29]},{nc:75,vals:[86,75,67,58,48,40,35,32]},
    {nc:80,vals:[88,77,69,61,51,42,37,34]},
  ];
  for (const {nc, vals} of NC_LEFT) {
    if (!BAND_KEYS.some((k,i) => (lpBand[k]??0) > vals[i])) return nc;
  }
  return ">80";
}

/* ── buildReportSections — per-form ── */
function buildReportSections(form, liveLp) {
  const NR_A = [55.4,35.5,22.0,12.0,4.8,0.0,-3.5,-6.1];
  const NR_B = [0.681,0.790,0.870,0.930,0.974,1.000,1.015,1.025];
  const A_WT = [-26.2,-16.1,-8.6,-3.2,0.0,1.2,1.0,-1.1];
  const isRockwoolPath = ["through_wall","through_ceiling_above"].includes(form.noisePath);
  const rw = form.rockwool||{};
  const rvcArr = isRockwoolPath
    ? (calcRockwoolRVC(rw.length_m,rw.width_m,rw.height_m,rw.alpha||{}) || BAND_KEYS.map(()=>0))
    : BAND_KEYS.map(()=>0);
  const attIL = BAND_KEYS.map(k=>Number(form.attenuator?.il?.[k])||0);
  const actualVals = BAND_KEYS.map((k,i)=>(liveLp[k]??0)+attIL[i]);
  const hasTreatment = isRockwoolPath ? rvcArr.some(v=>v!==0) : attIL.some(v=>v>0);
  const treatedVals  = isRockwoolPath
    ? BAND_KEYS.map((_,i)=>actualVals[i]+rvcArr[i])
    : BAND_KEYS.map(k=>liveLp[k]??0);

  const ncMode  = form.receiver?.ncNrChoice==="NC";
  const nrMode  = form.receiver?.ncNrChoice==="NR";
  const dbaMode = form.receiver?.ncNrChoice==="dBA";
  const bandHeader = ["Description",...BANDS.map(b=>`${b} Hz`)];

  let ncSection=null;
  if (ncMode) {
    const reqNC = Number(form.receiver.requiredNC)||50;
    const reqVals = getNCCriteria(reqNC);
    const reductionVals = actualVals.map((v,i)=>v-reqVals[i]);
    const rawLpObj = Object.fromEntries(BAND_KEYS.map((k,i)=>[k,actualVals[i]]));
    const ncRating = calcNCRating(rawLpObj);
    const treatedLpObj = Object.fromEntries(BAND_KEYS.map((k,i)=>[k,treatedVals[i]]));
    const ncRatingTreated = hasTreatment ? calcNCRating(treatedLpObj) : null;
    const treatedReduction = treatedVals.map((v,i)=>v-reqVals[i]);
    ncSection = {
      title:"NC Noise Level Summary", bandHeader,
      rows:[
        ["Total Lp at Receiver (dB)",...actualVals.map(v=>fmt2(v))],
        [`Required Noise Level: NC ${reqNC}`,...reqVals.map(v=>fmt2(v))],
        ["Additional dB Reduction Required",...reductionVals.map(v=>v>0?`+${fmt2(v)}`:0)],
      ],
      badge:`Without Treatment — Calculated NC: ${ncRating} ${typeof ncRating==="number"&&ncRating<=reqNC?"✓ Within limit":"✗ Exceeds NC "+reqNC}`,
      treatment: hasTreatment ? {
        title:"With Acoustic Treatment — NC Summary",
        rows:[
          ["With Acoustic Treatment (dB)",...treatedVals.map(v=>fmt2(v))],
          [`Required Noise Level: NC ${reqNC}`,...reqVals.map(v=>fmt2(v))],
          ["Additional dB Reduction Required",...treatedReduction.map(v=>v>0?`+${fmt2(v)}`:0)],
        ],
        badge:`With Acoustic Treatment — Calculated NC: ${ncRatingTreated} ${typeof ncRatingTreated==="number"&&ncRatingTreated<=reqNC?"✓ Within limit":"✗ Exceeds NC "+reqNC}`,
      }:null,
    };
  }

  let nrSection=null;
  if (nrMode) {
    const reqNR = Number(form.receiver.requiredNR)||50;
    const reqVals = NR_A.map((a,i)=>a+NR_B[i]*reqNR);
    const reductionVals = actualVals.map((v,i)=>v-reqVals[i]);
    const calcNRR = (obj)=>{ for(let n=0;n<=100;n++){const c=NR_A.map((a,i)=>a+NR_B[i]*n);if(!BAND_KEYS.some((k,i)=>(obj[k]??0)>c[i]))return n;}return ">100"; };
    const nrRating = calcNRR(Object.fromEntries(BAND_KEYS.map((k,i)=>[k,actualVals[i]])));
    const nrRatingTreated = hasTreatment ? calcNRR(Object.fromEntries(BAND_KEYS.map((k,i)=>[k,treatedVals[i]]))) : null;
    const treatedReduction = treatedVals.map((v,i)=>v-reqVals[i]);
    nrSection = {
      title:"NR Noise Level Summary", bandHeader,
      rows:[
        ["Total Lp at Receiver (dB)",...actualVals.map(v=>fmt2(v))],
        [`Required Noise Level: NR ${reqNR}`,...reqVals.map(v=>fmt2(v))],
        ["Additional dB Reduction Required",...reductionVals.map(v=>v>0?`+${fmt2(v)}`:0)],
      ],
      badge:`Without Treatment — Calculated NR: ${nrRating} ${typeof nrRating==="number"&&nrRating<=reqNR?"✓ Within limit":"✗ Exceeds NR "+reqNR}`,
      treatment: hasTreatment ? {
        title:"With Acoustic Treatment — NR Summary",
        rows:[
          ["With Acoustic Treatment (dB)",...treatedVals.map(v=>fmt2(v))],
          [`Required Noise Level: NR ${reqNR}`,...reqVals.map(v=>fmt2(v))],
          ["Additional dB Reduction Required",...treatedReduction.map(v=>v>0?`+${fmt2(v)}`:0)],
        ],
        badge:`With Acoustic Treatment — Calculated NR: ${nrRatingTreated} ${typeof nrRatingTreated==="number"&&nrRatingTreated<=reqNR?"✓ Within limit":"✗ Exceeds NR "+reqNR}`,
      }:null,
    };
  }

  let dbaSection=null;
  if (dbaMode) {
    const dbaLimit = Number(form.receiver.required_dba)||65;
    const calcTotalDBA = (vals) => 10*Math.log10(vals.reduce((s,lp,i)=>s+Math.pow(10,(lp+A_WT[i])/10),0));
    const totalDBA = calcTotalDBA(actualVals);
    const exceed = totalDBA-dbaLimit;
    const totalDBATreated = hasTreatment ? calcTotalDBA(treatedVals) : null;
    const exceedTreated = hasTreatment ? totalDBATreated-dbaLimit : null;
    dbaSection = {
      title:"dB(A) Limit Summary",
      bandHeader:[...bandHeader,"Total dB(A)"],
      rows:[
        ["Total Lp at Receiver (dB)",...actualVals.map(v=>fmt2(v)),fmt2(totalDBA)],
        ["A-weighting Correction (dB)",...A_WT.map(v=>v>0?`+${v}`:String(v)),"—"],
        ["Lp + A-weight (dB(A))",...actualVals.map((v,i)=>fmt2(v+A_WT[i])),fmt2(totalDBA)],
      ],
      badge:`Without Treatment — Total: ${fmt2(totalDBA)} dB(A) ${exceed>0?`✗ Exceeds limit by +${fmt2(exceed)} dB(A)`:`✓ Within dB(A) limit (${dbaLimit})`}`,
      treatment: hasTreatment&&totalDBATreated!==null ? {
        title:"With Acoustic Treatment — dB(A) Summary",
        rows:[
          ["With Acoustic Treatment (dB)",...treatedVals.map(v=>fmt2(v)),fmt2(totalDBATreated)],
          ["A-weighting Correction (dB)",...A_WT.map(v=>v>0?`+${v}`:String(v)),"—"],
          ["Lp + A-weight (dB(A))",...treatedVals.map((v,i)=>fmt2(v+A_WT[i])),fmt2(totalDBATreated)],
        ],
        badge:`With Acoustic Treatment — Total: ${fmt2(totalDBATreated)} dB(A) ${exceedTreated>0?`✗ Exceeds limit by +${fmt2(exceedTreated)} dB(A)`:`✓ Within dB(A) limit (${dbaLimit})`}`,
      }:null,
    };
  }
  return { actualVals, treatedVals, hasTreatment, rvcArr, attIL, ncSection, nrSection, dbaSection };
}

/* ══════════════════════════════════════════════════════════
   buildSinglePathHTML — generates the full HTML for ONE path
   (exact format matching the Excel reference sheets)
══════════════════════════════════════════════════════════ */
function buildSinglePathHTML(form, liveLp, project, pathNumber) {
  const sections = buildReportSections(form, liveLp);
  const { ncSection, nrSection, dbaSection, attIL, rvcArr, actualVals } = sections;

  const g    = form.generator      || {};
  const rec  = form.receiver       || {};
  const room = form.room           || {};
  const de   = form.distanceEffect || {};
  const erl  = form.erl            || {};
  const att  = form.attenuator     || {};
  const tp   = form.throughPath    || {};
  const rw   = form.rockwool       || {};
  const ducts = Array.isArray(form.ducts) ? form.ducts : [];
  const path      = form.noisePath;
  const pathLabel = NOISE_PATH_LABEL[path] || path;
  const isDuctPath     = ["exhaust","intake"].includes(path);
  const isThroughPath  = ["through_wall","through_door","through_ceiling_above","through_ceiling_below"].includes(path);
  const isRockwoolPath = ["through_wall","through_ceiling_above"].includes(path);
  const useRoom = form.roomOrDistance === "spaceRoom";

  const now     = new Date();
  const dateStr = now.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});

  // ── Calc intermediate arrays ──
  const swlArr = BAND_KEYS.map(k=>Number(g.swl?.[k])||0);
  const erlW   = Number(erl.width_mm)||0;
  const erlH   = Number(erl.height_mm)||0;
  const erlArr = (isDuctPath&&(erlW>0||erlH>0)) ? (calcERL(erlW,erlH)||BAND_KEYS.map(()=>0)) : BAND_KEYS.map(()=>0);
  const attILArr = BAND_KEYS.map(k=>Number(att.il?.[k])||0);
  const hasAtt   = attILArr.some(v=>v!==0);
  const ZERO8    = BAND_KEYS.map(()=>0);

  // Per-duct IL
  let totalDuctILArr = BAND_KEYS.map(()=>0);
  const ductRows = [];
  if (isDuctPath) {
    ducts.forEach((d,di)=>{
      const isLined = d.lining==="lined";
      const straightRaw = isLined ? calcLinedIL(d.width_mm,d.height_mm,d.length_m,d.liningThickness_in,d.coeffA) : calcUnlinedIL(d.width_mm,d.height_mm,d.length_m);
      const straightIL = straightRaw||ZERO8;
      const elbRaw = calcElbowIL(d.width_mm,d.elbows,isLined);
      const elbIL  = elbRaw||ZERO8;
      const ductTotal = BAND_KEYS.map((_,i)=>(straightIL[i]||0)+(elbIL[i]||0));
      totalDuctILArr  = totalDuctILArr.map((v,i)=>v+(ductTotal[i]||0));
      const lbl    = d.label||`Duct ${di+1}`;
      const dimStr = `W=${d.width_mm||"-"}mm H=${d.height_mm||"-"}mm L=${d.length_m||"-"}m`;
      if (straightIL.some(v=>v!==0)) ductRows.push({label:`${lbl} IL (${isLined?"Lined":"Unlined"}) [${dimStr}]`,vals:straightIL});
      if (elbIL.some(v=>v!==0))      ductRows.push({label:`${lbl} Elbow IL (${d.elbows||0} elbows)`,vals:elbIL});
    });
  }

  // Distance correction
  let distCorrArr = BAND_KEYS.map(()=>0);
  if (isDuctPath) {
    distCorrArr = BAND_KEYS.map(()=>-5);
  } else if (!useRoom) {
    const deObj = calcDistanceEffect(Number(de.distance_m)||1, Number(de.directivity)||2);
    distCorrArr = deObj ? BAND_KEYS.map(k=>Number(deObj[k])||0) : BAND_KEYS.map(()=>0);
  } else {
    const S = liveSchultzOffsets(Number(room.length_m)||1,Number(room.width_m)||1,Number(room.height_m)||1,Number(room.distance_m)||1);
    distCorrArr = Array.isArray(S) ? S : (S ? BAND_KEYS.map(k=>Number(S[k])||0) : BAND_KEYS.map(()=>0));
  }

  // Through-path TL
  const wallTLArr = path==="through_wall"   ? BAND_KEYS.map(k=>Number(tp.wall_tl?.[k])||0)     : null;
  const doorTLArr = path==="through_door"   ? BAND_KEYS.map(k=>Number(tp.door_tl?.[k])||0)     : null;
  const ceilTLArr = ["through_ceiling_above","through_ceiling_below"].includes(path)
                  ? BAND_KEYS.map(k=>Number(tp.ceiling_bands?.[k])||0) : null;
  // For through_wall / through_door — use STC lookup table
  let tlFromSTC = null;
  if (path==="through_wall"&&tp.wall_stc) {
    const r=findRowByDbaTotal(Number(tp.wall_stc)); tlFromSTC=r?r.dba.map(v=>-Math.abs(v)):null;
  } else if (path==="through_door"&&tp.door_stc) {
    const r=findRowByDbaTotal(Number(tp.door_stc)); tlFromSTC=r?r.dba.map(v=>-Math.abs(v)):null;
  }
  const tlArr  = tlFromSTC || wallTLArr || doorTLArr || ceilTLArr || BAND_KEYS.map(()=>0);
  const hasTL  = tlArr.some(v=>v!==0);

  // RVC
  const rvcBands = rvcArr||BAND_KEYS.map(()=>0);
  const hasRVC   = isRockwoolPath&&rvcBands.some(v=>v!==0);

  const aWeightArr = A_WEIGHT;

  const lpWithout = actualVals||BAND_KEYS.map(()=>0);
  const lpWith    = BAND_KEYS.map(k=>Number(liveLp[k])||0);

  const totalDBA = (lpBands) => {
    const sum = lpBands.reduce((s,lp,i)=>s+Math.pow(10,((Number(lp)||0)+aWeightArr[i])/10),0);
    if(!sum||sum<=0) return 0;
    return 10*Math.log10(sum);
  };
  const dbaWithout = totalDBA(lpWithout);
  const dbaWith    = totalDBA(lpWith);

  const ncNrChoice = rec.ncNrChoice||"dBA";
  let reqLevelLabel="", reqLevelVal="";
  if(ncNrChoice==="NC")  { reqLevelLabel="Required NC Level";        reqLevelVal=!skipN(rec.requiredNC) ?`NC ${rec.requiredNC}` :"-"; }
  if(ncNrChoice==="NR")  { reqLevelLabel="Required NR Level";        reqLevelVal=!skipN(rec.requiredNR) ?`NR ${rec.requiredNR}` :"-"; }
  if(ncNrChoice==="dBA") { reqLevelLabel="Required Noise Level (dB(A))"; reqLevelVal=!skipN(rec.required_dba)?`${rec.required_dba} dB(A)`:"-"; }

  const reqDBA = Number(rec.required_dba)||Number(rec.requiredNC)||Number(rec.requiredNR)||0;
  const additionalReductionWithout = dbaWithout-reqDBA;
  const additionalReductionWith    = dbaWith-reqDBA;

  // ── HTML helpers ──
  const TD  = (c,x="")=>`<td style="border:1px solid #999;padding:3px 6px;font-size:10pt;${x}">${c}</td>`;
  const TDC = (c,x="")=>TD(c,`text-align:center;${x}`);
  const TH  = (c,x="")=>`<th style="border:1px solid #999;padding:3px 6px;font-size:10pt;background:#d9d9d9;font-weight:bold;${x}">${c}</th>`;
  const THC = (c,x="")=>TH(c,`text-align:center;${x}`);

  // ── AVERAGE SPL rows (from reference sheet) ──
  // Average SPL at 1m = SWL - 10*log10(4*pi*1^2) ≈ SWL - 11 dB
  const splAt1m = swlArr.map(v=>round1(v - 10*Math.log10(4*Math.PI*1*1)));

  // ── TL label for the path table ──
  let tlLabel = "";
  if (path==="through_wall")  tlLabel = tp.wall_label  ? `${tp.wall_label} (Rw ${tp.wall_stc||"-"} Transmission loss)` : `STC ${tp.wall_stc||"-"} (Transmission loss)`;
  if (path==="through_door")  tlLabel = tp.door_label  ? `${tp.door_label} (STC ${tp.door_stc||"-"} Transmission loss)` : `STC ${tp.door_stc||"-"} (Transmission loss)`;
  if (path==="through_ceiling_above"||path==="through_ceiling_below") tlLabel = tp.ceiling_label||"Ceiling Transmission Loss";

  const pathNum = pathNumber||1;

  // ── PAGE BREAK helper (for multi-path combined PDF) ──
  const PB = `<div style="page-break-before:always;"></div>`;

  return `
  <!-- ══════ PATH ${pathNum}: ${pathLabel} ══════ -->
  ${pathNum>1?PB:""}
  <div style="margin-bottom:16px;">

  <!-- EQUIPMENT INFO TABLE -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
    <tbody>
      <tr>
        <td style="border:1px solid #999;padding:3px 8px;font-size:10pt;font-weight:bold;width:22%;">EQUIPMENT ID:</td>
        <td style="border:1px solid #999;padding:3px 8px;font-size:10pt;width:28%;">${g.equipmentId||"-"}</td>
        <td style="border:1px solid #999;padding:3px 8px;font-size:10pt;font-weight:bold;width:22%;">NOISE PATH</td>
        <td style="border:1px solid #999;padding:3px 8px;font-size:10pt;width:28%;">${pathLabel}</td>
      </tr>
      <tr>
        <td style="border:1px solid #999;padding:3px 8px;font-size:10pt;font-weight:bold;">MODEL NUMBER</td>
        <td style="border:1px solid #999;padding:3px 8px;font-size:10pt;">${g.modelNumber||"-"}</td>
        <td style="border:1px solid #999;padding:3px 8px;font-size:10pt;font-weight:bold;">BUILDING REF</td>
        <td style="border:1px solid #999;padding:3px 8px;font-size:10pt;">${g.buildingRef||"-"}</td>
      </tr>
      <tr>
        <td style="border:1px solid #999;padding:3px 8px;font-size:10pt;font-weight:bold;">RECEIVER LOCATION</td>
        <td colspan="3" style="border:1px solid #999;padding:3px 8px;font-size:10pt;">${rec.description||"-"}</td>
      </tr>
    </tbody>
  </table>

  <!-- SOUND POWER LEVELS -->
  <p style="font-size:10pt;margin:8px 0 4px;">The sound power levels for the eqp. unit:</p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:4px;">
    <thead>
      <tr>
        ${TH("Band","width:28%;")}
        ${BANDS.map(b=>THC(b)).join("")}
      </tr>
    </thead>
    <tbody>
      <tr>
        ${TD("Average Sound Pressure Levels at 1m dB","background:#f9f9f9;")}
        ${BANDS.map(()=>TDC("")).join("")}
      </tr>
      ${splAt1m.some(v=>v!==0)?`<tr>${TD("Average Sound Pressure Levels at 1m dB")}${splAt1m.map(v=>TDC(fmtN(v))).join("")}</tr>`:""}
      <tr>
        ${TD("sound pressure levels (SPL) at 1 meter to sound power levels (PWL), we use the following formula: L p=10log 10 (4πr² )","font-size:9pt;font-style:italic;")}
        ${swlArr.map(v=>TDC(`<b>${fmtN(v)}</b>`,"font-weight:bold;")).join("")}
      </tr>
    </tbody>
  </table>
  <p style="font-size:9.5pt;font-style:italic;margin:4px 0 10px;">
    Receiver Location For this Calculation is considered @ ${isDuctPath?"1 M from "+pathLabel+" louver":(room.distance_m||"-")+" m from DG room wall"}.
    And it will be the acoustically critical receiver location.
  </p>

  <!-- PATH N CALCULATION TABLE -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:4px;">
    <thead>
      <tr>
        <td colspan="2" style="border:1px solid #999;padding:3px 8px;font-size:10pt;font-weight:bold;background:#e8e8e8;">Path ${pathNum}</td>
        <td colspan="3" style="border:1px solid #999;padding:3px 8px;font-size:10pt;font-weight:bold;background:#e8e8e8;">${isDuctPath?"EXHAUST DUCT":pathLabel}</td>
        <td colspan="${BANDS.length}" style="border:1px solid #999;padding:3px 8px;font-size:10pt;font-weight:bold;background:#e8e8e8;"></td>
      </tr>
      <tr>
        <td colspan="2" style="border:1px solid #999;padding:3px 6px;font-size:10pt;"></td>
        ${TH("Width<br/>(mm)","text-align:center;font-size:9pt;")}
        ${TH("Height<br/>(mm)","text-align:center;font-size:9pt;")}
        ${TH("Length<br/>(M) /no.","text-align:center;font-size:9pt;")}
        <td colspan="${BANDS.length}" style="border:1px solid #999;padding:3px 6px;font-size:10pt;font-weight:bold;background:#d9d9d9;text-align:center;">Octave Band</td>
      </tr>
      <tr>
        ${TH("Frequency (Hz)","colspan:2;")}
        ${TH("","text-align:center;")}
        ${TH("","text-align:center;")}
        ${TH("","text-align:center;")}
        ${BANDS.map(b=>THC(b)).join("")}
      </tr>
    </thead>
    <tbody>
      <!-- SWL -->
      <tr style="background:#f9f9f9;">
        ${TD("<b>GENERATOR SOUND POWER LEVEL</b>","colspan:2;font-weight:bold;")}
        ${TDC("")}${TDC("")}${TDC("")}
        ${swlArr.map(v=>TDC(`<b>${fmtN(v)}</b>`,"font-weight:bold;")).join("")}
      </tr>

      <!-- Distance correction -->
      ${distCorrArr.some(v=>v!==0)?`<tr>
        ${TD(isDuctPath?"Distance = r= 1 meters, Q=4<br/>Distance Correction = (10Log Q/4nr2)":"Distance Effect","colspan:2;font-size:9pt;")}
        ${TDC("")}${TDC("")}${TDC(isDuctPath?"":"")  }
        ${distCorrArr.map(v=>TDC(fmtN(v))).join("")}
      </tr>`:""}

      <!-- ERL -->
      ${isDuctPath&&erlArr.some(v=>v!==0)?`<tr>
        ${TD("End reflection Factor","colspan:2;")}
        ${TDC(erlW||"")}${TDC(erlH||"")}${TDC("1")}
        ${erlArr.map(v=>TDC(fmtN(v))).join("")}
      </tr>`:""}

      <!-- Per-duct IL rows -->
      ${isDuctPath&&ductRows.length ? ductRows.map(dr=>`<tr>
        ${TD(`&minus; ${dr.label}`,"colspan:2;font-size:9pt;")}
        ${TDC("")}${TDC("")}${TDC("")}
        ${dr.vals.map(v=>TDC(v!==0?fmtN(-Math.abs(v)):"-")).join("")}
      </tr>`).join("") : ""}

      <!-- TL (through paths) — highlighted yellow as in reference -->
      ${hasTL?`<tr style="background:#fff2cc;">
        ${TD(`<b style="color:#333;">${tlLabel}</b>`,"colspan:2;background:#fff2cc;")}
        ${TDC("")}${TDC(path==="through_wall"?(tp.wall_stc?`Rw ${tp.wall_stc}`:"-"):path==="through_door"?(tp.door_stc?`STC ${tp.door_stc}`:"-"):(tp.ceiling_stc?`STC ${tp.ceiling_stc}`:""),"")}${TDC("")}
        ${tlArr.map(v=>TDC(fmtN(v),"background:#fff2cc;")).join("")}
      </tr>`:""}

      <!-- A-Weighting -->
      <tr>
        ${TD("A Weighting Correction","colspan:2;")}
        ${TDC("")}${TDC("")}${TDC("")}
        ${aWeightArr.map(v=>TDC(fmtN(v))).join("")}
      </tr>

      <!-- RVC / Room Volume Correction -->
      ${hasRVC?`
      <tr>
        ${TD(`Room volume correction [10logV-10logRT-14]<br/>Room volume[m3] Reverberation time [ sec]`,"colspan:2;font-size:9pt;")}
        ${TDC(`${((rw.length_m||0)*(rw.width_m||0)*(rw.height_m||0)).toFixed(1)}`)}
        ${TDC("m3")}${TDC("")}
        ${rvcBands.map(v=>TDC(fmtN(v))).join("")}
      </tr>`:""}

      <!-- Room dimensions -->
      ${useRoom||isThroughPath?`
      <tr style="background:#f5f5f5;">
        ${TD("Room Length","colspan:2;font-size:9.5pt;")}
        ${TDC("=")}${TDC(room.length_m||"-")}${TDC("M")}
        ${TD("Room Height up to Ceiling","font-size:9pt;")}${TDC("=")}${TDC(room.height_m||"-")}${TDC("M")}
        ${BANDS.slice(3).map(()=>TDC("")).join("")}
      </tr>
      <tr style="background:#f5f5f5;">
        ${TD("Room Width","colspan:2;font-size:9.5pt;")}
        ${TDC("=")}${TDC(room.width_m||"-")}${TDC("M")}
        ${TD("Distance to receiver","font-size:9pt;")}${TDC("=")}${TDC(room.distance_m||"-")}${TDC("M")}
        ${BANDS.slice(3).map(()=>TDC("")).join("")}
      </tr>`:
      // non-room path: distance info
      `<tr style="background:#f5f5f5;">
        ${TD("Distance to receiver","colspan:2;font-size:9.5pt;")}
        ${TDC(de.distance_m||"-")}${TDC("m")}${TDC("")}
        ${BANDS.map(()=>TDC("")).join("")}
      </tr>`}

      <!-- Resultant SPL WITHOUT attenuator -->
      <tr style="background:#fff2cc;">
        ${TD(`<b>Resultant Sound Pressure Level @ 1m ${hasAtt?"Without sound attenuator":"With sound attenuator"}</b>`,"colspan:2;background:#fff2cc;font-weight:bold;")}
        ${TDC("")}${TDC("")}${TDC("")}
        ${lpWithout.map(v=>TDC(`<b>${fmtN(v)}</b>`,"background:#fff2cc;font-weight:bold;")).join("")}
      </tr>
    </tbody>
  </table>

  <!-- COMBINATION OF PATH RESULTS -->
  <p style="font-size:11pt;font-weight:bold;margin:14px 0 4px;">Combination of Path Results Using Logarithmic Addition, dB</p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:4px;">
    <thead>
      <tr>
        ${THC("PATH #","width:6%;")}
        ${TH("Description","width:18%;")}
        ${BANDS.map(b=>THC(b)).join("")}
      </tr>
    </thead>
    <tbody>
      <tr>
        ${TDC(pathNum)}
        ${TD(isDuctPath?"EXHAUST DUCT":pathLabel)}
        ${lpWithout.map(v=>TDC(fmtN(v))).join("")}
      </tr>
      <tr style="background:#f2f2f2;">
        ${TDC("")}
        ${TD("<b>Total Lp at receiver location</b>","font-weight:bold;")}
        ${lpWithout.map(v=>TDC(`<b>${fmtN(v)}</b>`,"font-weight:bold;")).join("")}
      </tr>
      <!-- Yellow — additional dB reduction required per band -->
      <tr style="background:#ffff00;">
        ${TDC("")}
        ${TD("<b>Additional dB reduction required</b>","font-weight:bold;background:#ffff00;")}
        ${lpWithout.map((v,i)=>{const r=v-reqDBA;return TDC(r>0?fmtN(r):"0.0","background:#ffff00;font-weight:bold;");}).join("")}
      </tr>
      <!-- Required noise level -->
      <tr>
        ${TDC("")}
        ${TD(`${reqLevelLabel}`)}
        ${BANDS.slice(0,7).map(()=>TDC("")).join("")}
        ${TDC(`<b>${reqLevelVal}</b>`,"font-weight:bold;")}
      </tr>
      <!-- Calculated noise level WITHOUT attenuator (RED) -->
      <tr>
        ${TDC("")}
        ${TD("<b>Calculated Noise Level at Receiver (1M) Without sound attenuator</b>","font-weight:bold;")}
        ${BANDS.slice(0,7).map(()=>TDC("")).join("")}
        ${TDC(`<b style="color:#cc0000;">${fmtN(dbaWithout)}</b>`,"font-weight:bold;background:#ffe0e0;")}
      </tr>
    </tbody>
  </table>

  <!-- ATTENUATOR SECTION (last) -->
  ${hasAtt?`
  <p style="font-size:11pt;font-weight:bold;margin:14px 0 4px;">Additional measure required:</p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:4px;">
    <thead>
      <tr>
        <td rowspan="2" style="border:1px solid #999;padding:3px 6px;font-size:9.5pt;font-weight:bold;width:22%;vertical-align:top;">
          Insertion Losses of Galloway Acoustics Sound Attenuators :<br/>
          Model: ${att.model||"-"}<br/>
          W ${att.width_mm||"-"}mm x H ${att.height_mm||"-"}mm<br/>
          x L ${att.length_mm||"-"}mm<br/>
          Pr.Drop: ${att.pressureDrop_pa||"-"} Pa
        </td>
        ${THC("Sound Attenuator<br/>Selection","width:14%;background:#ffff00;color:#000;")}
        ${THC("Attenuator model","colspan:${BANDS.length};background:#ffff00;color:#000;")}
      </tr>
      <tr>
        ${TDC("")}
        ${attILArr.map(v=>TDC(`<b>${fmtN(v)}</b>`,"font-weight:bold;")).join("")}
      </tr>
    </thead>
    <tbody>
      <tr>
        ${TDC("")}
        ${TD("Total Lp at receiver with attenuator")}
        ${lpWith.map(v=>TDC(fmtN(v))).join("")}
      </tr>
      <tr>
        ${TDC("")}
        ${TD(reqLevelLabel)}
        ${BANDS.slice(0,7).map(()=>TDC("")).join("")}
        ${TDC(reqLevelVal,"font-weight:bold;")}
      </tr>
      <tr>
        ${TDC("")}
        ${TD("<b>Additional dB reduction required (after attenuator)</b>","font-weight:bold;")}
        ${BANDS.slice(0,7).map(()=>TDC("")).join("")}
        ${TDC(additionalReductionWith>0?fmtN(additionalReductionWith):"0.0","font-weight:bold;background:#ffff00;")}
      </tr>
      <tr>
        ${TDC("")}
        ${TD("<b>Calculated Noise Level at Receiver WITH Sound Attenuator</b>","font-weight:bold;")}
        ${BANDS.slice(0,7).map(()=>TDC("")).join("")}
        ${TDC(`<b style="color:#006600;">${fmtN(dbaWith)}</b>`,"font-weight:bold;background:#d9f7d9;")}
      </tr>
    </tbody>
  </table>`:""}

  <!-- NC/NR RESULT -->
  ${ncSection?`
  <p style="font-size:11pt;font-weight:bold;text-decoration:underline;margin:14px 0 6px;">${ncSection.title}</p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:4px;">
    <thead><tr>${THC("Parameter")}${BANDS.map(b=>THC(b)).join("")}</tr></thead>
    <tbody>${(ncSection.rows||[]).map((r,ri)=>{
      const[lbl,...vals]=r;const isY=lbl&&lbl.includes("Reduction");const bg=ri===0?"#f9f9f9":isY?"#ffff00":"#fff";
      return`<tr style="background:${bg};">${TD(lbl,"font-weight:"+(ri===0||isY?"bold":"normal")+";")}${vals.map(v=>TDC(v??"-")).join("")}</tr>`;
    }).join("")}</tbody>
  </table>
  ${ncSection.badge?`<p style="font-size:10pt;font-weight:bold;padding:4px 8px;border:1px solid #ccc;display:inline-block;">${ncSection.badge}</p>`:""}`:""}

  ${nrSection?`
  <p style="font-size:11pt;font-weight:bold;text-decoration:underline;margin:14px 0 6px;">${nrSection.title}</p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:4px;">
    <thead><tr>${THC("Parameter")}${BANDS.map(b=>THC(b)).join("")}</tr></thead>
    <tbody>${(nrSection.rows||[]).map((r,ri)=>{
      const[lbl,...vals]=r;const isY=lbl&&lbl.includes("Reduction");const bg=ri===0?"#f9f9f9":isY?"#ffff00":"#fff";
      return`<tr style="background:${bg};">${TD(lbl,"font-weight:"+(ri===0||isY?"bold":"normal")+";")}${vals.map(v=>TDC(v??"-")).join("")}</tr>`;
    }).join("")}</tbody>
  </table>
  ${nrSection.badge?`<p style="font-size:10pt;font-weight:bold;padding:4px 8px;border:1px solid #ccc;display:inline-block;">${nrSection.badge}</p>`:""}`:""}

  </div>
  `;
}

/* ══════════════════════════════════════════════════════════
   buildCombinedHTMLReport — wraps all active paths into one HTML doc
══════════════════════════════════════════════════════════ */
export function buildCombinedHTMLReport(allForms, allLiveLp, project) {
  const now     = new Date();
  const dateStr = now.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});

  const PATH_ORDER = ["exhaust","intake","through_wall","through_door","through_ceiling_above","through_ceiling_below"];
  const activePaths = PATH_ORDER.filter(p => allForms[p]);

  const pathSheets = activePaths.map((p,i)=>{
    const form   = allForms[p];
    const liveLp = allLiveLp[p] || {};
    return buildSinglePathHTML(form, liveLp, project, i+1);
  }).join("\n");

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>DG-SARIA Acoustic Calculation Report</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:"Times New Roman",Times,serif;background:#fff;color:#000;font-size:10pt;}
    .page{max-width:980px;margin:0 auto;padding:24px 32px 48px;}
    table{border-collapse:collapse;width:100%;}
    td,th{border:1px solid #999;padding:3px 6px;font-size:10pt;vertical-align:middle;}
    @media print{
      body{background:#fff;}
      .page{padding:14px 18px;}
    }
  </style>
</head><body><div class="page">

  <!-- ══ REPORT HEADER ══ -->
  <div style="text-align:center;margin-bottom:18px;border-bottom:2px solid #333;padding-bottom:12px;">
    <div style="font-size:14pt;font-weight:bold;letter-spacing:0.5px;text-transform:uppercase;">Acoustic Calculation Report</div>
    <div style="font-size:10pt;margin-top:5px;">AAPL Consultants / DG-SARIA &nbsp;·&nbsp; ${dateStr}</div>
    ${project?.name?`<div style="font-size:10pt;margin-top:3px;">Project: ${project.name}${project.client?` &nbsp;·&nbsp; Client: ${project.client}`:""}</div>`:""}
    <div style="font-size:9.5pt;margin-top:4px;color:#555;">
      Paths included: ${activePaths.map(p=>NOISE_PATH_LABEL[p]||p).join(" &nbsp;·&nbsp; ")}
    </div>
  </div>

  ${pathSheets}

  <!-- ══ FOOTER ══ -->
  <div style="margin-top:28px;padding-top:8px;border-top:1px solid #ccc;font-size:9pt;color:#666;text-align:center;">
    Generated by DG-SARIA Acoustic Calculator &nbsp;·&nbsp; AAPL Consultants &nbsp;·&nbsp; ${dateStr}
  </div>

</div></body></html>`;
}

/* ══════════════════════════════════════════════════════════
   downloadCombinedPDF — blob URL iframe print (no jsPDF)
══════════════════════════════════════════════════════════ */
export async function downloadCombinedPDF(allForms, allLiveLp, project) {
  const html = buildCombinedHTMLReport(allForms, allLiveLp, project);
  const printHtml = html.replace(
    "</style>",
    `@page { size: A4; margin: 10mm 8mm; }
     @media print {
       body { background: #fff !important; }
       .page { max-width: 100% !important; padding: 0 !important; }
       table { page-break-inside: avoid; }
       tr    { page-break-inside: avoid; }
     }</style>`
  );
  const blob    = new Blob([printHtml],{type:"text/html;charset=utf-8"});
  const blobUrl = URL.createObjectURL(blob);
  const iframe  = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:210mm;height:297mm;border:none;visibility:hidden;";
  document.body.appendChild(iframe);
  await new Promise(resolve=>{ iframe.onload=resolve; iframe.src=blobUrl; });
  await new Promise(r=>setTimeout(r,600));
  try { iframe.contentWindow.focus(); iframe.contentWindow.print(); }
  catch(e) { window.open(blobUrl,"_blank"); }
  setTimeout(()=>{ try{document.body.removeChild(iframe);}catch(_){} URL.revokeObjectURL(blobUrl); },6000);
}

/* ══════════════════════════════════════════════════════════
   downloadCombinedWord — all paths as sections in one .docx
══════════════════════════════════════════════════════════ */
export async function downloadCombinedWord(allForms, allLiveLp, project) {
  const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun,
          HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType, PageBreak } = await import("docx");

  const boldRun   = (t,color="000000")=> new TextRun({text:t,bold:true,size:20,font:"Calibri",color});
  const normalRun = (t)=> new TextRun({text:t,size:20,font:"Calibri"});
  const spacer    = ()=> new Paragraph({text:"",spacing:{before:60,after:60}});
  const heading   = (t,level=2)=> new Paragraph({text:t,heading:level===1?HeadingLevel.HEADING_1:HeadingLevel.HEADING_2,spacing:{before:200,after:100}});

  const grayShade = {type:ShadingType.SOLID,color:"475569",fill:"475569"};
  const tealShade = {type:ShadingType.SOLID,color:"0E9F8E",fill:"0E9F8E"};
  const yelShade  = {type:ShadingType.SOLID,color:"FFFF00",fill:"FFFF00"};
  const blueShade = {type:ShadingType.SOLID,color:"1D4ED8",fill:"1D4ED8"};

  const mkCell = (text,opts={})=> new TableCell({
    children:[new Paragraph({children:[new TextRun({text:String(text),bold:opts.bold||false,color:opts.color||"000000",size:18,font:"Calibri"})],alignment:opts.center?AlignmentType.CENTER:AlignmentType.LEFT})],
    shading:opts.shading||undefined,
    borders:{top:{style:BorderStyle.SINGLE,size:1,color:"999999"},bottom:{style:BorderStyle.SINGLE,size:1,color:"999999"},left:{style:BorderStyle.SINGLE,size:1,color:"999999"},right:{style:BorderStyle.SINGLE,size:1,color:"999999"}},
    columnSpan:opts.span||1,
    width:opts.width?{size:opts.width,type:WidthType.DXA}:undefined,
  });
  const mkHdr = (t,sh)=> mkCell(t,{bold:true,color:"FFFFFF",shading:sh,center:true});

  const bandTable = (hdrRow,dataRows,hdrShade)=> new Table({
    width:{size:100,type:WidthType.PERCENTAGE},
    rows:[
      new TableRow({children:hdrRow.map(h=>mkHdr(h,hdrShade))}),
      ...dataRows.map(row=>new TableRow({children:row.map((c,ci)=>mkCell(c,ci===0?{bold:true}:{center:true}))})),
    ],
  });

  const infoTable = (rows,hdrShade)=> new Table({
    width:{size:100,type:WidthType.PERCENTAGE},
    rows:rows.map((r,i)=>new TableRow({
      children:r.map((c,ci)=>mkCell(c,i===0?{bold:true,color:"FFFFFF",shading:hdrShade,center:true}:(ci===0?{bold:true}:{center:true}))),
    })),
  });

  const sectionBlocks = (sec)=>{
    if(!sec) return [];
    const blocks=[spacer(),heading(sec.title,2),bandTable(sec.bandHeader,sec.rows,grayShade)];
    if(sec.badge) blocks.push(new Paragraph({children:[new TextRun({text:sec.badge,italics:true,size:18,font:"Calibri",color:"475569"})],spacing:{before:80,after:80}}));
    if(sec.treatment){
      blocks.push(spacer(),heading(sec.treatment.title,2),bandTable(sec.bandHeader,sec.treatment.rows,blueShade));
      if(sec.treatment.badge) blocks.push(new Paragraph({children:[new TextRun({text:sec.treatment.badge,italics:true,size:18,font:"Calibri",color:"1D4ED8"})],spacing:{before:80,after:80}}));
    }
    return blocks;
  };

  const PATH_ORDER = ["exhaust","intake","through_wall","through_door","through_ceiling_above","through_ceiling_below"];
  const activePaths = PATH_ORDER.filter(p=>allForms[p]);
  const allChildren = [];

  // Cover
  allChildren.push(
    new Paragraph({children:[new TextRun({text:"DG Acoustic Calculation Report",bold:true,size:32,font:"Calibri",color:"0E9F8E"})],alignment:AlignmentType.CENTER,spacing:{before:0,after:200}}),
    new Paragraph({children:[new TextRun({text:"AAPL Consultants  |  DG-SARIA",size:20,font:"Calibri",color:"475569"})],alignment:AlignmentType.CENTER,spacing:{before:0,after:120}}),
    new Paragraph({children:[new TextRun({text:`Date: ${new Date().toLocaleDateString("en-GB")}`,size:18,font:"Calibri",color:"475569"})],alignment:AlignmentType.CENTER,spacing:{before:0,after:400}}),
  );

  activePaths.forEach((pathKey,pi)=>{
    const form   = allForms[pathKey];
    const liveLp = allLiveLp[pathKey]||{};
    const {actualVals,treatedVals,hasTreatment,rvcArr,attIL,ncSection,nrSection,dbaSection} = buildReportSections(form,liveLp);
    const g    = form.generator||{};
    const rec  = form.receiver||{};
    const att  = form.attenuator||{};
    const path = form.noisePath;
    const pathLabel = NOISE_PATH_LABEL[path]||path;
    const isDuctPath = ["exhaust","intake"].includes(path);
    const attILVals  = BAND_KEYS.map(k=>Number(att.il?.[k])||0);
    const rw = form.rockwool||{};
    const rvcFull = calcRockwoolRVC(rw.length_m,rw.width_m,rw.height_m,rw.alpha||{});

    if(pi>0){
      allChildren.push(new Paragraph({children:[new PageBreak()]}));
    }

    allChildren.push(
      heading(`Path ${pi+1}: ${pathLabel}`,1),
      spacer(),
      heading("Equipment Information",2),
      infoTable([
        ["Field","Details"],
        ["Equipment ID",  g.equipmentId||"—"],
        ["Noise Path",    pathLabel],
        ["Model Number",  g.modelNumber||"—"],
        ["Building Ref",  g.buildingRef||"—"],
        ["Rated kVA",     g.ratedKva?`${g.ratedKva} kVA`:"—"],
        ["Receiver Loc",  rec.description||"—"],
        ["Noise Criterion", rec.ncNrChoice||"—"],
        ["Required Level",
          rec.ncNrChoice==="NC"?`NC ${rec.requiredNC}`:
          rec.ncNrChoice==="NR"?`NR ${rec.requiredNR}`:`${rec.required_dba} dB(A)`],
      ],tealShade),
      spacer(),
      heading("Sound Power Level per Octave Band",2),
      bandTable(["Band (Hz)",...BANDS.map(String)],[["SWL (dB)",...BAND_KEYS.map(k=>fmt2(Number(g.swl?.[k])||0))]],grayShade),
      spacer(),
      heading("Receiver Lp (WITHOUT attenuator)",2),
      bandTable(["Band (Hz)",...BANDS.map(String)],[["Lp (dB)",...actualVals.map(v=>fmt2(v))]],tealShade),
      spacer(),
    );

    if(hasTreatment){
      allChildren.push(
        heading("Receiver Lp (WITH acoustic treatment)",2),
        bandTable(["Band (Hz)",...BANDS.map(String)],[["Lp (dB)",...treatedVals.map(v=>fmt2(v))]],blueShade),
        spacer(),
      );
    }

    if(isDuctPath&&form.ducts?.length){
      allChildren.push(heading("Duct Details",2));
      form.ducts.forEach((d,di)=>{
        allChildren.push(
          new Paragraph({children:[boldRun(`Duct ${di+1}: ${d.label||""} — ${d.lining==="lined"?"Lined":"Unlined"} — Elbows: ${d.elbows||0}`)],spacing:{before:100,after:60}}),
          infoTable([
            ["Parameter","Value","Parameter","Value"],
            ["Width (mm)",String(d.width_mm||0),"Height (mm)",String(d.height_mm||0)],
            ["Length (m)",String(d.length_m||0),"Lining Thickness",String(d.liningThickness_in||0)+" in"],
          ],grayShade),
          spacer(),
        );
      });
    }

    if(!isDuctPath){
      const tp=form.throughPath||{};
      allChildren.push(
        heading("Transmission Loss Details",2),
        infoTable([
          ["Parameter","Value"],
          ...(path==="through_wall"?[["Wall Construction",tp.wall_label||"—"],["Wall STC",String(tp.wall_stc||"—")]]:
             path==="through_door"?[["Door Construction",tp.door_label||"—"],["Door STC",String(tp.door_stc||"—")]]:
             [["Ceiling Construction",tp.ceiling_label||"—"]]),
        ],tealShade),
        spacer(),
        ...(["through_ceiling_above","through_ceiling_below"].includes(path)&&tp.ceiling_bands?[
          bandTable(["Band (Hz)",...BANDS.map(String)],[["TL (dB)",...BAND_KEYS.map(k=>fmt2(Number(tp.ceiling_bands?.[k])||0))]],grayShade),
          spacer(),
        ]:[]),
      );
    }

    if(attILVals.some(v=>v>0)){
      allChildren.push(
        heading("Attenuator Insertion Loss",2),
        infoTable([
          ["Model","Width (mm)","Height (mm)","Length (mm)","Pressure Drop (Pa)"],
          [att.model||"—",String(att.width_mm||0),String(att.height_mm||0),String(att.length_mm||0),String(att.pressureDrop_pa||0)],
        ],tealShade),
        spacer(),
        bandTable(["Band (Hz)",...BANDS.map(String)],[["IL (dB)",...attILVals.map(v=>fmt2(v))]],grayShade),
        spacer(),
      );
    }

    if(["through_wall","through_ceiling_above"].includes(path)){
      allChildren.push(
        heading("Rockwool Insulation Loss",2),
        infoTable([
          ["Parameter","Value"],
          ["Rockwool Type",rw.type||"—"],
          ["Room L×W×H (m)",`${rw.length_m||0} × ${rw.width_m||0} × ${rw.height_m||0}`],
        ],{type:ShadingType.SOLID,color:"F59E0B",fill:"F59E0B"}),
        spacer(),
        bandTable(["Band (Hz)",...BANDS.map(String)],[
          ["Abs Coeff (αs)",...BAND_KEYS.map(k=>String(rw.alpha?.[k]||0))],
          ["RVC (dB)",...(rvcFull||BAND_KEYS.map(()=>0)).map(v=>fmt2(v))],
        ],{type:ShadingType.SOLID,color:"F59E0B",fill:"F59E0B"}),
        spacer(),
      );
    }

    allChildren.push(...sectionBlocks(ncSection),...sectionBlocks(nrSection),...sectionBlocks(dbaSection));
  });

  allChildren.push(
    spacer(),
    new Paragraph({
      children:[new TextRun({text:`Report generated by AAPL Consultants DG-SARIA System  |  Rev ${project?.revision||"00"}  |  ${new Date().toLocaleDateString("en-GB")}`,size:16,font:"Calibri",color:"94A3B8",italics:true})],
      alignment:AlignmentType.CENTER,
    }),
  );

  const docObj  = new Document({sections:[{properties:{},children:allChildren}]});
  const blob    = await Packer.toBlob(docObj);
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement("a");
  a.href        = url;
  a.download    = `DG_Acoustic_Report_${(project?.projectName||"Report").replace(/\s+/g,"_")}_Rev${project?.revision||"00"}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ══════════════════════════════════════════════════════════
   DownloadModal — shows combined preview + download buttons
   Props: onClose, allForms, allLiveLp, project
══════════════════════════════════════════════════════════ */
export function DownloadModal({ onClose, allForms, allLiveLp, project }) {
  const [loading,  setLoading]  = useState(null);
  const [previewPath, setPreviewPath] = useState(null); // null = combined

  const PATH_ORDER = ["exhaust","intake","through_wall","through_door","through_ceiling_above","through_ceiling_below"];
  const activePaths = PATH_ORDER.filter(p=>allForms[p]);

  const htmlReport = useMemo(()=>{
    if(previewPath&&allForms[previewPath]){
      const form = allForms[previewPath];
      const liveLp = allLiveLp[previewPath]||{};
      return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><style>
        *{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:"Times New Roman",Times,serif;background:#fff;color:#000;font-size:10pt;}
        .page{max-width:960px;margin:0 auto;padding:20px 28px 40px;}
        table{border-collapse:collapse;width:100%;}
        td,th{border:1px solid #999;padding:3px 6px;font-size:10pt;vertical-align:middle;}
        @media print{body{background:#fff;}.page{padding:12px 16px;}}
      </style></head><body><div class="page">
      ${buildSinglePathHTML(form,liveLp,project,activePaths.indexOf(previewPath)+1)}
      </div></body></html>`;
    }
    return buildCombinedHTMLReport(allForms,allLiveLp,project);
  },[allForms,allLiveLp,project,previewPath,activePaths]);

  const handle = async(type)=>{
    setLoading(type);
    try {
      if(type==="pdf") await downloadCombinedPDF(allForms,allLiveLp,project);
      else             await downloadCombinedWord(allForms,allLiveLp,project);
      toast.success(`${type==="pdf"?"PDF":"Word"} downloaded`);
      onClose();
    } catch(e){
      console.error(e);
      toast.error("Download failed — see console");
    } finally { setLoading(null); }
  };

  const NOISE_PATH_LABEL_SHORT = {
    exhaust:"Exhaust Air", intake:"Intake Air",
    through_wall:"Wall", through_door:"Door",
    through_ceiling_above:"Ceil. Above", through_ceiling_below:"Ceil. Below",
  };

  return (
    <div style={{position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(15,23,42,.55)",backdropFilter:"blur(4px)"}}>
      <div style={{width:"min(96vw,1100px)",height:"min(92vh,820px)",background:"#fff",borderRadius:16,boxShadow:"0 24px 64px rgba(0,0,0,.25)",display:"flex",flexDirection:"column",overflow:"hidden"}}>

        {/* Header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 20px 12px",borderBottom:"1.5px solid #E2E8F0",flexShrink:0}}>
          <div>
            <span style={{fontSize:16,fontWeight:700,color:"#0F172A",fontFamily:"Inter,sans-serif"}}>Report Preview</span>
            <span style={{fontSize:11.5,color:"#64748B",marginLeft:10,fontFamily:"Inter,sans-serif"}}>
              {activePaths.length} path{activePaths.length!==1?"s":""} included
            </span>
          </div>
          <button onClick={onClose} type="button" style={{background:"none",border:"none",cursor:"pointer",color:"#94A3B8",fontSize:20,lineHeight:1,padding:"4px 8px"}}>✕</button>
        </div>

        {/* Path tabs */}
        {activePaths.length>1&&(
          <div style={{display:"flex",gap:6,padding:"8px 20px",borderBottom:"1px solid #E2E8F0",flexShrink:0,overflowX:"auto",background:"#F8FAFC"}}>
            <button type="button" onClick={()=>setPreviewPath(null)}
              style={{padding:"5px 12px",borderRadius:7,border:`1.5px solid ${!previewPath?"#0E9F8E":"#E2E8F0"}`,background:!previewPath?"#E3F8F5":"#fff",color:!previewPath?"#0E9F8E":"#64748B",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"Inter,sans-serif"}}>
              All Paths
            </button>
            {activePaths.map(p=>(
              <button key={p} type="button" onClick={()=>setPreviewPath(p)}
                style={{padding:"5px 12px",borderRadius:7,border:`1.5px solid ${previewPath===p?"#0E9F8E":"#E2E8F0"}`,background:previewPath===p?"#E3F8F5":"#fff",color:previewPath===p?"#0E9F8E":"#64748B",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"Inter,sans-serif"}}>
                {NOISE_PATH_LABEL_SHORT[p]||p}
              </button>
            ))}
          </div>
        )}

        {/* Preview iframe */}
        <div style={{flex:1,overflow:"hidden",background:"#F1F5F9"}}>
          <iframe
            srcDoc={htmlReport}
            title="Report Preview"
            style={{width:"100%",height:"100%",border:"none",minHeight:"500px"}}
            sandbox="allow-same-origin"
          />
        </div>

        {/* Download buttons */}
        <div style={{padding:"14px 20px 18px",borderTop:"1.5px solid #E2E8F0",flexShrink:0,background:"#FAFAFA"}}>
          <p style={{fontSize:11.5,color:"#64748B",margin:"0 0 10px",textAlign:"center",fontFamily:"Inter,sans-serif"}}>
            Download includes ALL {activePaths.length} path sheet{activePaths.length!==1?"s":""} in one file
          </p>
          <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
            <button type="button" disabled={!!loading} onClick={()=>handle("pdf")}
              style={{display:"flex",alignItems:"center",gap:10,padding:"11px 20px",borderRadius:10,border:"1.5px solid #FECDD3",background:"#FFF1F2",cursor:loading?"not-allowed":"pointer",minWidth:160,transition:"all .15s"}}
              onMouseEnter={e=>{if(!loading){e.currentTarget.style.background="#FFE4E6";e.currentTarget.style.borderColor="#FB7185";}}}
              onMouseLeave={e=>{e.currentTarget.style.background="#FFF1F2";e.currentTarget.style.borderColor="#FECDD3";}}>
              <div style={{width:34,height:34,borderRadius:8,background:"#FEE2E2",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                {loading==="pdf"?<Loader2 size={16} color="#E11D48" style={{animation:"spin .7s linear infinite"}}/>:<FileText size={16} color="#E11D48"/>}
              </div>
              <div style={{textAlign:"left"}}>
                <div style={{fontSize:13,fontWeight:700,color:"#0F172A",fontFamily:"Inter,sans-serif"}}>Print / Save PDF</div>
                <div style={{fontSize:10.5,color:"#94A3B8",marginTop:1,fontFamily:"Inter,sans-serif"}}>Opens browser print dialog · A4</div>
              </div>
            </button>
            <button type="button" disabled={!!loading} onClick={()=>handle("word")}
              style={{display:"flex",alignItems:"center",gap:10,padding:"11px 20px",borderRadius:10,border:"1.5px solid #BFDBFE",background:"#EFF6FF",cursor:loading?"not-allowed":"pointer",minWidth:160,transition:"all .15s"}}
              onMouseEnter={e=>{if(!loading){e.currentTarget.style.background="#DBEAFE";e.currentTarget.style.borderColor="#60A5FA";}}}
              onMouseLeave={e=>{e.currentTarget.style.background="#EFF6FF";e.currentTarget.style.borderColor="#BFDBFE";}}>
              <div style={{width:34,height:34,borderRadius:8,background:"#DBEAFE",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                {loading==="word"?<Loader2 size={16} color="#1D4ED8" style={{animation:"spin .7s linear infinite"}}/>:<FileIcon size={16} color="#1D4ED8"/>}
              </div>
              <div style={{textAlign:"left"}}>
                <div style={{fontSize:13,fontWeight:700,color:"#0F172A",fontFamily:"Inter,sans-serif"}}>Download Word</div>
                <div style={{fontSize:10.5,color:"#94A3B8",marginTop:1,fontFamily:"Inter,sans-serif"}}>Editable .docx · all paths</div>
              </div>
            </button>
          </div>
          <p style={{fontSize:10.5,color:"#CBD5E1",margin:"8px 0 0",textAlign:"center",fontFamily:"Inter,sans-serif"}}>
            Libraries load on first use — may take a moment
          </p>
        </div>
      </div>
    </div>
  );
}
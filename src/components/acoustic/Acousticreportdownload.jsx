/**
 * AcousticReportDownload.jsx
 * All report / download / modal code for DG-SARIA Acoustic Calculator.
 * Layout matches the reference Excel sheet exactly.
 * No calculation equations changed.
 *
 * Row order per path
 * ──────────────────
 * EXHAUST / INTAKE (isDuct):
 *   1. Generator SWL
 *   2. Per-duct IL rows (each duct: straight IL then elbow IL)
 *   3. End Reflection Loss (ERL)
 *   4. Distance Correction (−5 dB, r=1m Q=4)
 *   5. Receiver Location note row
 *   6. A-Weighting Correction  ← only when ncNrChoice === "dBA"
 *   7. Room dimension info rows
 *   8. Resultant Lp WITHOUT attenuator
 *
 * THROUGH WALL / DOOR / CEILING:
 *   1. Generator SWL
 *   2. Distance Effect / Room Correction (Schultz)
 *   3. STC value (own cell)  → Transmission Loss band values
 *   4. Room Volume Correction (Rockwool, if applicable)
 *   5. A-Weighting Correction  ← only when ncNrChoice === "dBA"
 *   6. Receiver Location note row
 *   7. Resultant Lp WITHOUT attenuator
 */
import { useState, useMemo } from "react";
import { Loader2, FileText, FileIcon } from "lucide-react";
import toast from "react-hot-toast";

/* ═══════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════ */
const BANDS     = [63, 125, 250, 500, 1000, 2000, 4000, 8000];
const BAND_KEYS = ["hz63","hz125","hz250","hz500","hz1000","hz2000","hz4000","hz8000"];
const A_WEIGHT  = [-26.2, -16.1, -8.6, -3.2, 0, 1.2, 1.0, -1.1];

const PATH_LABEL = {
  exhaust:               "EXHAUST AIR SIDE",
  intake:                "INTAKE AIR SIDE",
  through_wall:          "THROUGH WALL (RADIATED NOISE)",
  through_door:          "THROUGH DOOR (RADIATED NOISE)",
  through_ceiling_above: "THROUGH CEILING ABOVE (RADIATED NOISE)",
  through_ceiling_below: "THROUGH CEILING BELOW (RADIATED NOISE)",
};
const PATH_SHORT = {
  exhaust:"Exhaust Air", intake:"Intake Air",
  through_wall:"Wall", through_door:"Door",
  through_ceiling_above:"Ceil.Above", through_ceiling_below:"Ceil.Below",
};
const DUCT_PATHS = ["exhaust","intake"];

/* ═══════════════════════════════════════════════════════
   CALCULATION FUNCTIONS  (equations UNCHANGED)
═══════════════════════════════════════════════════════ */
function r1(n){ return Math.round(n*10)/10; }
function mmToFt(mm){ return mm/304.8; }

function calcUnlinedIL(width_mm,height_mm,length_m){
  const W=Number(width_mm),H=Number(height_mm),L=Number(length_m);
  if(!W||!H||!L) return null;
  const wft=mmToFt(W),hft=mmToFt(H),lft=L*3.28084;
  const P=2*(wft+hft),S=wft*hft;
  return BANDS.map(f=>{ if(P/S>=2) return r1(Math.min(1.5*(P/S)**0.25*lft,10)); return r1((0.1*P)/S*lft); });
}
const LIN={
  A:[0.04,0.08,0.14,0.22,0.32,0.40,0.53,0.53],
  B:[1.959,1.41,0.824,0.5,0.695,0.802,0.451,0.219],
  C:[0.917,0.941,1.079,1.087,0,0,0,0],
};
function calcLinedIL(width_mm,height_mm,length_m,thickness_in,coeffAOverride){
  const W=Number(width_mm),H=Number(height_mm),L=Number(length_m),t=Number(thickness_in)||1;
  if(!W||!H||!L) return null;
  const wft=mmToFt(W),hft=mmToFt(H),lft=L*3.28084;
  const P=2*(wft+hft),S=wft*hft;
  return BANDS.map((_,i)=>{
    const A=(coeffAOverride&&Number(coeffAOverride[BAND_KEYS[i]]))||LIN.A[i];
    return r1(A*(P/S)**LIN.B[i]*t**LIN.C[i]*lft);
  });
}
const ELBOW_UNL=[[0,0,0,1,5,8,4,3],[0,1,5,5,8,4,3,3],[0,5,5,8,4,3,3,3],[1,5,8,4,3,3,3,3]];
const ELBOW_LN =[[0,0,0,1,6,11,10,10],[0,1,6,6,11,10,10,10],[0,6,6,11,10,10,10,10],[1,6,11,10,10,10,10,10]];
function elbowIdx(w){ const W=Number(w); return W<=200?0:W<=400?1:W<=800?2:3; }
function calcElbowIL(width_mm,elbows,lined){
  const n=Number(elbows); if(!n||n<=0) return null;
  return (lined?ELBOW_LN:ELBOW_UNL)[elbowIdx(width_mm)].map(v=>v*n);
}
function calcERL(width_mm,height_mm){
  const W=Number(width_mm),H=Number(height_mm);
  if(!W||!H) return null;
  const area_ft2=(W/1000)*(H/1000)*10.7639;
  const D_ft=Math.sqrt(4*area_ft2/Math.PI);
  const a1=0.7,c0=1125.33;
  return BANDS.map(f=>{ const r=(a1*c0)/(Math.PI*f*D_ft); return r1(10*Math.log10(1+r*r)*-1); });
}
function calcDistanceEffect(distance_m,directivity){
  const r=Number(distance_m)||1,Q=Number(directivity)||1;
  if(r<=0) return null;
  const val=Math.round(10*Math.log10(Q/(4*Math.PI*r*r))*100)/100;
  return Object.fromEntries(BAND_KEYS.map(k=>[k,val]));
}
function liveSchultzOffsets(length_m,width_m,height_m,distance_m){
  const V=Number(length_m)*Number(width_m)*Number(height_m);
  const r=Number(distance_m)||3;
  if(V<=0) return null;
  return BANDS.map(f=>-10*Math.log10(r)-5*Math.log10(V)-3*Math.log10(f)+12);
}
function calcRockwoolRVC(L,W,H,alphaObj){
  const V=Number(L)*Number(W)*Number(H);
  if(!V||V<=0) return null;
  const S=2*(Number(L)*Number(W)+Number(L)*Number(H)+Number(W)*Number(H));
  return BAND_KEYS.map(k=>{
    const alpha=Number(alphaObj?.[k])||0;
    const A=S*alpha; if(!A||A<=0) return 0;
    const T=0.161*V/A;
    return r1(10*Math.log10(V)-10*Math.log10(T)-14);
  });
}
const NC_TABLE=[
  {nc:20,vals:[47,36,29,22,17,14,12,11]},{nc:25,vals:[54,44,35,28,22,18,15,13]},
  {nc:30,vals:[59,48,39,31,24,20,17,16]},{nc:35,vals:[63,52,43,34,27,22,19,17]},
  {nc:40,vals:[67,57,47,38,30,25,21,19]},{nc:45,vals:[70,60,50,41,33,27,23,21]},
  {nc:50,vals:[73,62,53,44,35,29,25,22]},{nc:55,vals:[75,64,56,47,38,31,27,24]},
  {nc:60,vals:[78,67,58,49,40,33,28,26]},{nc:65,vals:[80,69,61,52,42,35,30,27]},
  {nc:70,vals:[83,72,64,55,45,37,32,29]},{nc:75,vals:[86,75,67,58,48,40,35,32]},
  {nc:80,vals:[88,77,69,61,51,42,37,34]},
];
const STC_ROWS=[
  {nc:20,dba:[-45,-35,-29,-25,-22,-20,-19,-18]},{nc:25,dba:[-40,-30,-24,-20,-18,-16,-15,-14]},
  {nc:30,dba:[-35,-26,-20,-16,-14,-12,-11,-10]},{nc:35,dba:[-31,-22,-17,-13,-11,-9,-8,-7]},
  {nc:40,dba:[-27,-18,-13,-10,-8,-6,-5,-4]},{nc:45,dba:[-23,-14,-9,-6,-5,-3,-3,-2]},
  {nc:50,dba:[-19,-10,-5,-3,-2,-1,0,0]},{nc:55,dba:[-15,-6,-2,0,2,4,4,5]},
  {nc:60,dba:[-11,-3,1,3,5,6,7,7]},{nc:65,dba:[-7,0,4,7,8,10,10,11]},
];
function findRowByDbaTotal(stcVal){
  const v=Number(stcVal);
  return [...STC_ROWS].sort((a,b)=>Math.abs(a.nc-v)-Math.abs(b.nc-v))[0];
}
function getNCCriteria(ncLevel){
  const row=NC_TABLE.find(r=>r.nc===ncLevel)||[...NC_TABLE].sort((a,b)=>Math.abs(a.nc-ncLevel)-Math.abs(b.nc-ncLevel))[0];
  return row?row.vals:BANDS.map(()=>0);
}
function calcNCRating(lpArr){
  for(const {nc,vals} of NC_TABLE){ if(!lpArr.some((v,i)=>v>vals[i])) return nc; }
  return ">80";
}
/* NR Table — exact values from Table 5: Sound Pressure Level For Each NR Level */
const NR_ROWS=[
  {nr:0,  left:[36,22,12,5,0,-4,-6,-8]},
  {nr:1,  left:[36.7,22.9,12.9,6,1,-2.9,-5,-7]},
  {nr:2,  left:[37.4,23.8,13.8,7,2,-1.8,-4,-6]},
  {nr:3,  left:[38.1,24.7,14.7,8,3,-0.7,-3,-5]},
  {nr:4,  left:[38.8,25.6,15.6,9,4,0.4,-2,-4]},
  {nr:5,  left:[39.5,26.5,16.5,10,5,1.5,-1,-3]},
  {nr:6,  left:[40.2,27.4,17.4,11,6,2.6,0,-2]},
  {nr:7,  left:[40.9,28.3,18.3,12,7,3.7,1,-1]},
  {nr:8,  left:[41.6,29.2,19.2,13,8,4.8,2,0]},
  {nr:9,  left:[42.3,30.1,20.1,14,9,5.9,3,1]},
  {nr:10, left:[43,31,21,15,10,7,4,2]},
  {nr:11, left:[43.8,31.8,22,15.9,11,8,5,3.1]},
  {nr:12, left:[44.6,32.6,23,16.8,12,9,6,4.2]},
  {nr:13, left:[45.4,33.4,24,17.7,13,10,7,5.3]},
  {nr:14, left:[46.2,34.2,25,18.6,14,11,8,6.4]},
  {nr:15, left:[47,35,26,19.5,15,12,9,7.5]},
  {nr:16, left:[47.8,35.8,27,20.4,16,13,10,8.6]},
  {nr:17, left:[48.6,36.6,28,21.3,17,14,11,9.7]},
  {nr:18, left:[49.4,37.4,29,22.2,18,15,12,10.8]},
  {nr:19, left:[50.2,38.2,30,23.1,19,16,13,11.9]},
  {nr:20, left:[51,39,31,24,20,17,14,13]},
  {nr:21, left:[51.8,39.9,31.9,25,21,18,15.1,14]},
  {nr:22, left:[52.6,40.8,32.8,26,22,19,16.2,15]},
  {nr:23, left:[53.4,41.7,33.7,27,23,20,17.3,16]},
  {nr:24, left:[54.2,42.6,34.6,28,24,21,18.4,17]},
  {nr:25, left:[55,43.5,35.5,29,25,22,19.5,18]},
  {nr:26, left:[55.8,44.4,36.4,30,26,23,20.6,19]},
  {nr:27, left:[56.6,45.3,37.3,31,27,24,21.7,20]},
  {nr:28, left:[57.4,46.2,38.2,32,28,25,22.8,21]},
  {nr:29, left:[58.2,47.1,39.1,33,29,26,23.9,22]},
  {nr:30, left:[59,48,40,34,30,27,25,23]},
  {nr:31, left:[59.8,48.9,40.9,35,31,28,26,24]},
  {nr:32, left:[60.6,49.8,41.8,36,32,29,27,25]},
  {nr:33, left:[61.4,50.7,42.7,37,33,30,28,26]},
  {nr:34, left:[62.2,51.6,43.6,38,34,31,29,27]},
  {nr:35, left:[63,52.5,44.5,39,35,32,30,28]},
  {nr:36, left:[63.8,53.4,45.4,40,36,33,31,29]},
  {nr:37, left:[64.6,54.3,46.3,41,37,34,32,30]},
  {nr:38, left:[65.4,55.2,47.2,42,38,35,33,31]},
  {nr:39, left:[66.2,56.1,48.1,43,39,36,34,32]},
  {nr:40, left:[67,57,49,44,40,37,35,33]},
  {nr:41, left:[67.8,57.9,50,45,41,38,36,34.1]},
  {nr:42, left:[68.6,58.8,51,46,42,39,37,35.2]},
  {nr:43, left:[69.4,59.7,52,47,43,40,38,36.3]},
  {nr:44, left:[70.2,60.6,53,48,44,41,39,37.4]},
  {nr:45, left:[71,61.5,54,49,45,42,40,38.5]},
  {nr:46, left:[71.8,62.4,55,50,46,43,41,39.6]},
  {nr:47, left:[72.6,63.3,56,51,47,44,42,40.7]},
  {nr:48, left:[73.4,64.2,57,52,48,45,43,41.8]},
  {nr:49, left:[74.2,65.1,58,53,49,46,44,42.9]},
  {nr:50, left:[75,66,59,54,50,47,45,44]},
  {nr:51, left:[75.8,66.8,59.9,54.9,51,48,46,45]},
  {nr:52, left:[76.6,67.6,60.8,55.8,52,49,47,46]},
  {nr:53, left:[77.4,68.4,61.7,56.7,53,50,48,47]},
  {nr:54, left:[78.2,69.2,62.6,57.6,54,51,49,48]},
  {nr:55, left:[79,70,63.5,58.5,55,52,50,49]},
  {nr:56, left:[79.8,70.8,64.4,59.4,56,53,51,50]},
  {nr:57, left:[80.6,71.6,65.3,60.3,57,54,52,51]},
  {nr:58, left:[81.4,72.4,66.2,61.2,58,55,53,52]},
  {nr:59, left:[82.2,73.2,67.1,62.1,59,56,54,53]},
  {nr:60, left:[83,74,68,63,60,57,55,54]},
  {nr:61, left:[83.8,74.9,68.9,64,61,58.1,56.1,55]},
  {nr:62, left:[84.6,75.8,69.8,65,62,59.2,57.2,56]},
  {nr:63, left:[85.4,76.7,70.7,66,63,60.3,58.3,57]},
  {nr:64, left:[86.2,77.6,71.6,67,64,61.4,59.4,58]},
  {nr:65, left:[87,78.5,72.5,68,65,62.5,60.5,59]},
  {nr:66, left:[87.8,79.4,73.4,69,66,63.6,61.6,60]},
  {nr:67, left:[88.6,80.3,74.3,70,67,64.7,62.7,61]},
  {nr:68, left:[89.4,81.2,75.2,71,68,65.8,63.8,62]},
  {nr:69, left:[90.2,82.1,76.1,72,69,66.9,64.9,63]},
  {nr:70, left:[91,83,77,73,70,68,66,64]},
  {nr:71, left:[91.8,83.9,77.9,74,71,69,67,65]},
  {nr:72, left:[92.6,84.8,78.8,75,72,70,68,66]},
  {nr:73, left:[93.4,85.7,79.7,76,73,71,69,67]},
  {nr:74, left:[94.2,86.6,80.6,77,74,72,70,68]},
  {nr:75, left:[95,87.5,81.5,78,75,73,71,69]},
  {nr:76, left:[95.8,88.4,82.4,79,76,74,72,70]},
  {nr:77, left:[96.6,89.3,83.3,80,77,75,73,71]},
  {nr:78, left:[97.4,90.2,84.2,81,78,76,74,72]},
  {nr:79, left:[98.2,91.1,85.1,82,79,77,75,73]},
  {nr:80, left:[99,92,86,83,80,78,76,74]},
  {nr:81, left:[99.8,92.8,87,84,81,79,77,75.1]},
  {nr:82, left:[100.6,93.6,88,85,82,80,78,76.2]},
  {nr:83, left:[101.4,94.4,89,86,83,81,79,77.3]},
  {nr:84, left:[102.2,95.2,90,87,84,82,80,78.4]},
  {nr:85, left:[103,96,91,88,85,83,81,79.5]},
  {nr:86, left:[103.8,96.8,92,89,86,84,82,80.6]},
  {nr:87, left:[104.6,97.6,93,90,87,85,83,81.7]},
  {nr:88, left:[105.4,98.4,94,91,88,86,84,82.8]},
  {nr:89, left:[106.2,99.2,95,92,89,87,85,83.9]},
  {nr:90, left:[107,100,96,93,90,88,86,85]},
  {nr:91, left:[107.8,100.9,96.9,93.9,91,89,87,86]},
  {nr:92, left:[108.6,101.8,97.8,94.8,92,90,88,87]},
  {nr:93, left:[109.4,102.7,98.7,95.7,93,91,89,88]},
  {nr:94, left:[110.2,103.6,99.6,96.6,94,92,90,89]},
  {nr:95, left:[111,104.5,100.5,97.5,95,93,91,90]},
  {nr:96, left:[111.8,105.4,101.4,98.4,96,94,92,91]},
  {nr:97, left:[112.6,106.3,102.3,99.3,97,95,93,92]},
  {nr:98, left:[113.4,107.2,103.2,100.2,98,96,94,93]},
  {nr:99, left:[114.2,108.1,104.1,101.1,99,97,95,94]},
  {nr:100,left:[115,109,105,102,100,98,96,95]},
  {nr:101,left:[115.7,109.9,105.9,103,101,99,97.1,96]},
  {nr:102,left:[116.4,110.8,106.8,104,102,100,98.2,97]},
  {nr:103,left:[117.1,111.7,107.7,105,103,101,99.3,98]},
  {nr:104,left:[117.8,112.6,108.6,106,104,102,100.4,99]},
  {nr:105,left:[118.5,113.5,109.5,107,105,103,101.5,100]},
  {nr:106,left:[119.2,114.4,110.4,108,106,104,102.6,101]},
  {nr:107,left:[119.9,115.3,111.3,109,107,105,103.7,102]},
  {nr:108,left:[120.6,116.2,112.2,110,108,106,104.8,103]},
  {nr:109,left:[121.3,117.1,113.1,111,109,107,105.9,104]},
  {nr:110,left:[122,118,114,112,110,108,107,105]},
  {nr:111,left:[122.8,118.8,115,113,111,109,108,106.1]},
  {nr:112,left:[123.6,119.6,116,114,112,110,109,107.2]},
  {nr:113,left:[124.4,120.4,117,115,113,111,110,108.3]},
  {nr:114,left:[125.2,121.2,118,116,114,112,111,109.4]},
  {nr:115,left:[126,122,119,117,115,113,112,110.5]},
  {nr:116,left:[126.8,122.8,120,118,116,114,113,111.6]},
  {nr:117,left:[127.6,123.6,121,119,117,115,114,112.7]},
  {nr:118,left:[128.4,124.4,122,120,118,116,115,113.8]},
  {nr:119,left:[129.2,125.2,123,121,119,117,116,114.9]},
  {nr:120,left:[130,126,124,122,120,118,117,116]},
  {nr:121,left:[130.8,126.9,124.9,122.9,121,119,118,117]},
  {nr:122,left:[131.6,127.8,125.8,123.8,122,120,119,118]},
  {nr:123,left:[132.4,128.7,126.7,124.7,123,121,120,119]},
  {nr:124,left:[133.2,129.6,127.6,125.6,124,122,121,120]},
  {nr:125,left:[134,130.5,128.5,126.5,125,123,122,121]},
  {nr:126,left:[134.8,131.4,129.4,127.4,126,124,123,122]},
  {nr:127,left:[135.6,132.3,130.3,128.3,127,125,124,123]},
  {nr:128,left:[136.4,133.2,131.2,129.2,128,126,125,124]},
  {nr:129,left:[137.2,134.1,132.1,130.1,129,127,126,125]},
  {nr:130,left:[138,135,133,131,130,128,127,126]},
];
function findRowByNR(nr){ const v=Number(nr)||0; return NR_ROWS.reduce((best,row)=>Math.abs(row.nr-v)<Math.abs(best.nr-v)?row:best); }
function getNRCriteria(nr){ return findRowByNR(nr).left; }
function calcNRRating(lpArr){
  const sorted=[...NR_ROWS].sort((a,b)=>a.nr-b.nr);
  for(const row of sorted){ if(!lpArr.some((v,i)=>v>row.left[i])) return row.nr; }
  return ">130";
}
function totalDBA(arr){
  const s=arr.reduce((a,v,i)=>a+Math.pow(10,((Number(v)||0)+A_WEIGHT[i])/10),0);
  return s>0?10*Math.log10(s):0;
}

/* mirror of main form calculation — no equation change */
function calcLiveReceiverLp(form){
  if(!form) return Object.fromEntries(BAND_KEYS.map(k=>[k,0]));
  const g=form.generator||{};
  const path=form.noisePath||"exhaust";
  const isDuctPath=DUCT_PATHS.includes(path);
  const isThroughPath=["through_wall","through_door","through_ceiling_above","through_ceiling_below"].includes(path);
  const useRoom=form.roomOrDistance==="spaceRoom";
  let lp=BAND_KEYS.map(k=>Number(g.swl?.[k])||0);
  if(isDuctPath){
    lp=lp.map(v=>v-5);
    const erl=form.erl||{};
    const erlArr=calcERL(Number(erl.width_mm)||0,Number(erl.height_mm)||0);
    if(erlArr) lp=lp.map((v,i)=>v+(erlArr[i]||0));
    (Array.isArray(form.ducts)?form.ducts:[]).forEach(d=>{
      const lined=d.lining==="lined";
      const sIL=lined?calcLinedIL(d.width_mm,d.height_mm,d.length_m,d.liningThickness_in,d.coeffA):calcUnlinedIL(d.width_mm,d.height_mm,d.length_m);
      const eIL=calcElbowIL(d.width_mm,d.elbows,lined);
      if(sIL) lp=lp.map((v,i)=>v-(sIL[i]||0));
      if(eIL) lp=lp.map((v,i)=>v-(eIL[i]||0));
    });
  } else {
    const de=form.distanceEffect||{};
    const rm=form.room||{};
    if(useRoom){
      const S=liveSchultzOffsets(Number(rm.length_m)||1,Number(rm.width_m)||1,Number(rm.height_m)||1,Number(rm.distance_m)||1);
      if(S) lp=lp.map((v,i)=>v+S[i]);
    } else {
      const deObj=calcDistanceEffect(Number(de.distance_m)||1,Number(de.directivity)||2);
      if(deObj) lp=lp.map((v,i)=>v+Number(deObj[BAND_KEYS[i]]||0));
    }
    if(isThroughPath){
      const tp=form.throughPath||{};
      if(path==="through_wall"&&tp.wall_stc){ const r=findRowByDbaTotal(Number(tp.wall_stc)); if(r) lp=lp.map((v,i)=>v+r.dba[i]); }
      else if(path==="through_door"&&tp.door_stc){ const r=findRowByDbaTotal(Number(tp.door_stc)); if(r) lp=lp.map((v,i)=>v+r.dba[i]); }
      else if(["through_ceiling_above","through_ceiling_below"].includes(path)){ const cb=(form.throughPath||{}).ceiling_bands||{}; lp=lp.map((v,i)=>v-(Number(cb[BAND_KEYS[i]])||0)); }
    }
  }
  const att=form.attenuator||{};
  const attIL=BAND_KEYS.map(k=>Number(att.il?.[k])||0);
  if(attIL.some(v=>v>0)) lp=lp.map((v,i)=>v-attIL[i]);
  return Object.fromEntries(BAND_KEYS.map((k,i)=>[k,r1(lp[i])]));
}

/* ═══════════════════════════════════════════════════════
   HTML REPORT
   Table columns (13 total):
     [0]  Description / Label
     [1]  Width (mm)
     [2]  Height (mm)
     [3]  Length (m) / No.
     [4]  STC value  ← dedicated STC cell (empty for non-TL rows)
     [5..12]  Octave bands 63–8000 Hz
═══════════════════════════════════════════════════════ */

/* Force background colors into print/PDF */
const CSS = `
*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}
body{font-family:"Times New Roman",Times,serif;font-size:9pt;color:#000;background:#fff}
.page{max-width:100%;padding:10px 12px 20px}
table{border-collapse:collapse;width:100%;margin-bottom:6px;table-layout:fixed}
td,th{border:1px solid #666;padding:2px 3px;vertical-align:middle;font-size:8.5pt;word-wrap:break-word}
th{background:#d9d9d9;font-weight:bold;text-align:center}
.gy {background:#e8e8e8}
.lgy{background:#f2f2f2}
.yl {background:#ffff00}
.ayl{background:#fffacd}
.gn {background:#c6efce;color:#276221}
.rd {background:#ffc7ce;color:#9c0006}
.bold{font-weight:bold}
.c{text-align:center}
.l{text-align:left}
.r{text-align:right}
.pg{page-break-before:always}
.it{font-style:italic}
@page{size:A4 portrait;margin:8mm 6mm}
@media print{.page{padding:3px 5px}td,th{font-size:7.5pt;padding:1px 2px}}
`;

/* ── 13-column table helpers ──
   Col indices: 0=desc, 1=W, 2=H, 3=L, 4=STC, 5..12=8 bands
   ALL rows must emit exactly 13 cells (or fewer via colspan summing to 13)
*/
const TOTAL_COLS = 13;
const N_BANDS    = 8;

/* Local combineEquipmentSWL for download component */
function combineEquipmentSWL(generators){
  if(!generators||!generators.length) return Object.fromEntries(BAND_KEYS.map(k=>[k,0]));
  if(generators.length===1) return Object.fromEntries(BAND_KEYS.map(k=>[k,Number(generators[0].swl?.[k])||0]));
  const combined={};
  BAND_KEYS.forEach(k=>{
    const sum=generators.reduce((acc,g)=>{
      const v=Number(g.swl?.[k])||0;
      return acc+Math.pow(10,v/10);
    },0);
    combined[k]=10*Math.log10(sum);
  });
  return combined;
}

function buildSinglePathHTML(form, liveLp, project, pathNum){
  /* Support both single generator (legacy) and generators array (multi-equip) */
  const equipType = form.equipmentType || "DG";
  const generators = Array.isArray(form.generators) && form.generators.length>0
    ? form.generators
    : (form.generator ? [form.generator] : [{}]);
  const combinedSWL = combineEquipmentSWL(generators);
  const g   = generators[0]            || {};
  const rec = form.receiver       || {};
  const rm  = form.room           || {};
  const de  = form.distanceEffect || {};
  const erl = form.erl            || {};
  const att = form.attenuator     || {};
  const tp  = form.throughPath    || {};
  const rw  = form.rockwool       || {};
  const ducts = Array.isArray(form.ducts) ? form.ducts : [];
  const path   = form.noisePath || "exhaust";
  const isDuct    = DUCT_PATHS.includes(path);
  const isThrough = ["through_wall","through_door","through_ceiling_above","through_ceiling_below"].includes(path);
  const isRW      = ["through_wall","through_ceiling_above"].includes(path);
  const useRoom   = form.roomOrDistance === "spaceRoom";

  /* ncNrChoice drives whether A-weighting row is shown */
  const ncNrChoice = rec.ncNrChoice || "dBA";
  const showAWeight = ncNrChoice === "dBA";   // only show A-wt row when result is in dBA
  const reqNC  = Number(rec.requiredNC)  || 50;
  const reqNR  = Number(rec.requiredNR)  || 50;
  const reqDBA = Number(rec.required_dba)|| 65;

  /* ── derived arrays ── */
  const swlArr   = BAND_KEYS.map(k=>Number(combinedSWL[k])||0);
  const Z8       = BANDS.map(()=>0);
  const attILArr = BAND_KEYS.map(k=>Number(att.il?.[k])||0);
  const hasAtt   = attILArr.some(v=>v>0);

  /* ERL */
  const erlArr = isDuct&&Number(erl.width_mm)&&Number(erl.height_mm)
    ? (calcERL(Number(erl.width_mm),Number(erl.height_mm))||Z8) : Z8;

  /* Distance row */
  let distArr=Z8, distLabel="";
  if(isDuct){
    distArr=BANDS.map(()=>-5);
    distLabel="Distance Correction (r=1m, Q=4)  10·Log(Q/4πr²) = -5 dB";
  } else if(useRoom){
    const S=liveSchultzOffsets(Number(rm.length_m)||1,Number(rm.width_m)||1,Number(rm.height_m)||1,Number(rm.distance_m)||1);
    distArr=Array.isArray(S)?S:Z8;
    distLabel=`Room Correction — Schultz method (r = ${rm.distance_m||"–"} m)`;
  } else {
    const deObj=calcDistanceEffect(Number(de.distance_m)||1,Number(de.directivity)||2);
    distArr=deObj?BAND_KEYS.map(k=>Number(deObj[k])||0):Z8;
    distLabel=`Distance Effect  r=${de.distance_m||"–"} m, Q=${de.directivity||"–"}  [10·Log(Q/4πr²)]`;
  }

  /* Per-duct IL objects — ordered per duct: straight then elbow */
  const ductRows=[];
  if(isDuct){
    ducts.forEach((d,di)=>{
      const lined=d.lining==="lined";
      const lbl=d.label||`Duct ${di+1}`;
      const type=lined?"Lined":"Unlined";
      const sIL=lined
        ?calcLinedIL(d.width_mm,d.height_mm,d.length_m,d.liningThickness_in,d.coeffA)
        :calcUnlinedIL(d.width_mm,d.height_mm,d.length_m);
      const eIL=calcElbowIL(d.width_mm,d.elbows,lined);
      if(sIL) ductRows.push({label:`${lbl} — ${type} Duct IL`,w:d.width_mm||"",h:d.height_mm||"",l:d.length_m||"",vals:sIL,neg:true});
      if(eIL&&eIL.some(v=>v!==0)) ductRows.push({label:`${lbl} — Elbow IL (${d.elbows||0} nos)`,w:d.width_mm||"",h:"",l:d.elbows||"",vals:eIL,neg:true});
    });
  }

  /* TL (through paths) */
  let tlArr=Z8, tlLabel="", stcVal="";
  if(path==="through_wall"&&tp.wall_stc){
    const r=findRowByDbaTotal(Number(tp.wall_stc));
    tlArr=r?r.dba:[...Z8];
    tlLabel=tp.wall_label?`${tp.wall_label} — Transmission Loss`:"Wall — Transmission Loss";
    stcVal=`STC ${tp.wall_stc}`;
  } else if(path==="through_door"&&tp.door_stc){
    const r=findRowByDbaTotal(Number(tp.door_stc));
    tlArr=r?r.dba:[...Z8];
    tlLabel=tp.door_label?`${tp.door_label} — Transmission Loss`:"Door — Transmission Loss";
    stcVal=`STC ${tp.door_stc}`;
  } else if(["through_ceiling_above","through_ceiling_below"].includes(path)&&tp.ceiling_bands){
    tlArr=BAND_KEYS.map(k=>-(Number(tp.ceiling_bands[k])||0));
    tlLabel=tp.ceiling_label?`${tp.ceiling_label} — Ceiling IL`:"Ceiling — Insertion Loss";
    stcVal="";
  }
  const hasTL=tlArr.some(v=>v!==0);

  /* Rockwool RVC */
  const rvcArr=isRW?(calcRockwoolRVC(rw.length_m,rw.width_m,rw.height_m,rw.alpha||{})||Z8):Z8;
  const hasRVC=rvcArr.some(v=>v!==0);

  /* Lp before / after attenuator */
  const lpBefore = BAND_KEYS.map((k,i)=>(Number(liveLp[k])||0)+(hasAtt?attILArr[i]:0));
  const lpAfter  = BAND_KEYS.map(k=>Number(liveLp[k])||0);
  const dbaB=totalDBA(lpBefore), dbaA=totalDBA(lpAfter);

  /* dB(A) per-band rows: Lp[i] + A_WEIGHT[i] for each band,
     then logarithmic sum = 10·log10( Σ 10^((Lp[i]+Aw[i])/10) )
     Formula from ref: SPL_total = 10·log10(10^(SPL1/10)+10^(SPL2/10)+…)
  */
  const dbaPerBandB = lpBefore.map((v,i)=>r1(v+A_WEIGHT[i]));
  const dbaPerBandA = lpAfter.map((v,i)=>r1(v+A_WEIGHT[i]));
  // dbaB and dbaA already equal 10·log10(Σ10^((Lp+Aw)/10)) via totalDBA()

  const ncCrit    = getNCCriteria(reqNC);
  const nrCrit    = getNRCriteria(reqNR);
  const ncRating  = calcNCRating(lpBefore);
  const nrRating  = calcNRRating(lpBefore);
  const ncRatingA = calcNCRating(lpAfter);
  const nrRatingA = calcNRRating(lpAfter);

  const finalLabel = ncNrChoice==="NC"
    ? `NC ${ncRating}` : ncNrChoice==="NR"
    ? `NR ${nrRating}` : `${dbaB.toFixed(1)} dB(A)`;
  const finalLabelA = ncNrChoice==="NC"
    ? `NC ${ncRatingA}` : ncNrChoice==="NR"
    ? `NR ${nrRatingA}` : `${dbaA.toFixed(1)} dB(A)`;
  const reqLabel = ncNrChoice==="NC"
    ? `${reqNC} NC` : ncNrChoice==="NR"
    ? `${reqNR} NR` : `${reqDBA} dB(A)`;

  /* ── HTML helpers ── */
  // All emit exactly the right number of cells — no CSS colspan tricks
  const c   =(t,cls="",span=1)=>span>1?`<td colspan="${span}" class="c ${cls}" style="overflow:hidden">${t??""}</td>`:`<td class="c ${cls}" style="overflow:hidden">${t??""}</td>`;
  const cl  =(t,cls="",span=1)=>span>1?`<td colspan="${span}" class="l ${cls}" style="overflow:hidden">${t??""}</td>`:`<td class="l ${cls}" style="overflow:hidden">${t??""}</td>`;
  const th  =(t,span=1)=>span>1?`<th colspan="${span}" style="overflow:hidden">${t??""}</th>`:`<th style="overflow:hidden">${t??""}</th>`;

  /* Standard data row: desc | W | H | L | STC | 8 bands (13 cells) */
  function dataRow(label, wv, hv, lv, stc, arr, cls="", neg=false, bold=false){
    const bCells=arr.map(v=>{
      const n=Number(v);
      const txt=isNaN(n)||n===undefined?"—":neg?`(${Math.abs(n).toFixed(1)})`:n.toFixed(1);
      return c(bold?`<b>${txt}</b>`:txt, cls);
    }).join("");
    return `<tr>${cl(bold?`<b>${label}</b>`:label,cls)}${c(wv??"",cls)}${c(hv??"",cls)}${c(lv??"",cls)}${c(stc??"",cls)}${bCells}</tr>`;
  }

  /* Full-width spanning row */
  function spanRow(html, cls=""){
    return `<tr><td colspan="${TOTAL_COLS}" class="l ${cls}" style="overflow:hidden;padding:2px 4px">${html}</td></tr>`;
  }

  /* Receiver location note (duct paths) */
  const recLocNote = isDuct
    ? `Receiver Location for this calculation is considered <b>1 m from ${path==="exhaust"?"Exhaust":"Intake"} air louvre</b> (Acoustic Louvre). This is the acoustically critical receiver location.`
    : isThrough
    ? `Receiver Location for this calculation is considered <b>${de.distance_m||rm.distance_m||"–"} m from DG room ${path.includes("wall")?"wall":path.includes("door")?"door":"ceiling"}</b>. This is the acoustically critical receiver location.`
    : `Receiver Location: <b>${rec.description||"—"}</b> at ${de.distance_m||rm.distance_m||"–"} m`;

  const pg   = pathNum>1 ? `<div class="pg"></div>` : "";
  const date = new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});

  /* ── Info header block (no borders, matches Excel sheet top) ── */
  const hdr=`
<table style="border-collapse:collapse;width:100%;margin-bottom:5px;">
<tr>
  <td style="border:none;width:12%;font-weight:bold;font-size:9pt">EQUIPMENT ID:</td>
  <td style="border:none;width:38%;font-size:9pt">${g.equipmentId||"—"}</td>
  <td style="border:none;width:12%;font-weight:bold;font-size:9pt">MODEL NUMBER:</td>
  <td style="border:none;width:38%;font-size:9pt">${g.modelNumber||"—"}</td>
</tr>
<tr>
  <td style="border:none;font-weight:bold;font-size:9pt">NOISE PATH:</td>
  <td style="border:none;font-size:9pt">${PATH_LABEL[path]||path}</td>
  <td style="border:none;font-weight:bold;font-size:9pt">RATED kVA:</td>
  <td style="border:none;font-size:9pt">${g.ratedKva||"—"} kVA</td>
</tr>
<tr>
  <td style="border:none;font-weight:bold;font-size:9pt">BUILDING REF:</td>
  <td style="border:none;font-size:9pt">${g.buildingRef||"—"}</td>
  <td style="border:none;font-weight:bold;font-size:9pt">PROJECT:</td>
  <td style="border:none;font-size:9pt">${project?.name||project?.projectName||"—"}</td>
</tr>
<tr>
  <td style="border:none;font-weight:bold;font-size:9pt">RECEIVER LOCATION:</td>
  <td style="border:none;font-size:9pt" colspan="3">${rec.description||"—"}</td>
</tr>
</table>`;

  /* ── Main calculation table ──
     Col widths: desc(27%) | W(5%) | H(5%) | L(5%) | STC(5%) | 8×(6.625%)
  */
  const colGroup=`<colgroup>
  <col style="width:27%">
  <col style="width:5%"><col style="width:5%"><col style="width:5%"><col style="width:5%">
  ${BANDS.map(()=>`<col style="width:6.625%">`).join("")}
</colgroup>`;

  /* ── Build main rows in EXACT path order ── */
  let mainRows="";

  /* ─ HEADER ROWS ─ */
  mainRows+=`
<tr class="gy">
  ${th("Path "+pathNum+" | "+PATH_LABEL[path]||path,TOTAL_COLS)}
</tr>
<tr class="gy">
  ${th("Description")}${th("Width\n(mm)")}${th("Height\n(mm)")}${th("Length (M)\n/ No.")}${th("STC")}
  ${BANDS.map(b=>th(b+" Hz")).join("")}
</tr>`;

  if(isDuct){
    /* ══ EXHAUST / INTAKE ORDER ══
       1. Generator SWL
       2. Duct IL rows (each duct: straight → elbow)
       3. End Reflection Loss
       4. Distance Correction (−5)
       5. Receiver Location note
       6. A-Weighting (only if dBA)
       7. Room dimension info rows
       8. Resultant Lp
    */

    // 1. SWL
    mainRows+=dataRow(`${equipType==="Pump"?"PUMP":"GENERATOR"} SOUND POWER LEVEL (Combined)`.trim(),"","","","",swlArr,"bold",false,true);

    // 2. Duct IL rows
    ductRows.forEach(dr=>{
      mainRows+=dataRow(dr.label,dr.w,dr.h,dr.l,"",dr.vals,"",dr.neg);
    });

    // 3. ERL
    if(erlArr.some(v=>v!==0)){
      mainRows+=dataRow(
        `End Reflection Loss — W=${erl.width_mm||"–"} mm, H=${erl.height_mm||"–"} mm`,
        erl.width_mm||"",erl.height_mm||"","1","",erlArr,"",true
      );
    }

    // 4. Distance Correction
    mainRows+=dataRow(distLabel,"","","","",distArr);

    // 5. Receiver Location note
    mainRows+=spanRow(recLocNote,"lgy");

    // 6. A-Weighting (only if dBA)
    if(showAWeight){
      mainRows+=dataRow("A-Weighting Correction","","","","",A_WEIGHT);
    }

    // 7. Room dimension info rows (italic note rows, not calculated)
    mainRows+=`
<tr class="lgy">
  <td class="l it" style="font-size:8pt">Room Length</td>
  <td class="c it" style="font-size:8pt">${rm.length_m||"–"} M</td>
  <td class="l it" colspan="2" style="font-size:8pt">Room Height (up to ceiling)</td>
  <td class="c it" style="font-size:8pt">${rm.height_m||"–"} M</td>
  ${BANDS.map(()=>`<td class="lgy"></td>`).join("")}
</tr>
<tr class="lgy">
  <td class="l it" style="font-size:8pt">Room Width</td>
  <td class="c it" style="font-size:8pt">${rm.width_m||"–"} M</td>
  <td class="l it" colspan="2" style="font-size:8pt">Distance to receiver</td>
  <td class="c it" style="font-size:8pt">1 M (from louvre)</td>
  ${BANDS.map(()=>`<td class="lgy"></td>`).join("")}
</tr>`;

    // 8. Resultant Lp
    mainRows+=dataRow(
      "RESULTANT SOUND PRESSURE LEVEL @ 1m — Without Sound Attenuator",
      "","","","",lpBefore,"ayl",false,true
    );

    // 9. dB(A) rows — only when criterion is dBA
    if(showAWeight){
      // Per-band Lp + A-weight values
      mainRows+=dataRow(
        "Lp + A-Weighting per Band  [Lp(i) + A(i)]",
        "","","","",dbaPerBandB,"lgy"
      );
      // Logarithmic sum total: 10·log10(Σ 10^(val/10))
      mainRows+=`<tr class="ayl">
  <td class="l bold ayl" colspan="5" style="overflow:hidden">
    <b>Total dB(A) — Logarithmic Addition</b>
    <span style="font-size:7.5pt;font-weight:normal;margin-left:6px">[10·log₁₀(Σ 10^((Lp+A)/10))]</span>
  </td>
  ${Array(N_BANDS-1).fill(c("","ayl")).join("")}
  ${c(`<b>${dbaB.toFixed(1)} dB(A)</b>`,"bold ayl")}
</tr>`;
    }

  } else {
    /* ══ THROUGH WALL / DOOR / CEILING ORDER ══
       1. Generator SWL
       2. Distance Effect / Room Correction (Schultz)
       3. STC + Transmission Loss bands
       4. Room Volume Correction (Rockwool)
       5. A-Weighting (only if dBA)
       6. Receiver Location note
       7. Resultant Lp
    */

    // 1. SWL
    mainRows+=dataRow(`${equipType==="Pump"?"PUMP":"GENERATOR"} SOUND POWER LEVEL (Combined)`.trim(),"","","","",swlArr,"bold",false,true);

    // 2. Distance / Room Correction
    if(distArr.some(v=>v!==0)){
      mainRows+=dataRow(distLabel,"","","","",distArr);
    }

    // 3. TL / Transmission Loss — STC gets its OWN dedicated cell
    if(hasTL){
      mainRows+=dataRow(tlLabel,"","","",stcVal,tlArr,"ayl");
    }

    // 4. RVC (Rockwool)
    if(hasRVC){
      const vol=((rw.length_m||0)*(rw.width_m||0)*(rw.height_m||0)).toFixed(1);
      mainRows+=dataRow(
        `Room Volume Correction  [10·log(V)−10·log(RT)−14]  V=${vol} m³`,
        rw.width_m||"",rw.height_m||"",rw.length_m||"","",rvcArr
      );
    }

    // 5. A-Weighting (only if dBA)
    if(showAWeight){
      mainRows+=dataRow("A-Weighting Correction","","","","",A_WEIGHT);
    }

    // 6. Receiver Location note
    mainRows+=spanRow(recLocNote,"lgy");

    // 7. Resultant Lp
    mainRows+=dataRow(
      "RESULTANT SOUND PRESSURE LEVEL @ 1m — Without Sound Attenuator",
      "","","","",lpBefore,"ayl",false,true
    );

    // 8. dB(A) rows — only when criterion is dBA
    if(showAWeight){
      mainRows+=dataRow(
        "Lp + A-Weighting per Band  [Lp(i) + A(i)]",
        "","","","",dbaPerBandB,"lgy"
      );
      mainRows+=`<tr class="ayl">
  <td class="l bold ayl" colspan="5" style="overflow:hidden">
    <b>Total dB(A) — Logarithmic Addition</b>
    <span style="font-size:7.5pt;font-weight:normal;margin-left:6px">[10·log₁₀(Σ 10^((Lp+A)/10))]</span>
  </td>
  ${Array(N_BANDS-1).fill(c("","ayl")).join("")}
  ${c(`<b>${dbaB.toFixed(1)} dB(A)</b>`,"bold ayl")}
</tr>`;
    }
  }

  const mainTable=`
<table>${colGroup}
<thead>
${mainRows}
</thead>
</table>`;

  /* ── Combination / Summary table ── */
  const combTable=`
<table>${colGroup}
<thead>
<tr>
  ${th("Combination of Path Results — Logarithmic Addition",2)}
  ${th("")}${th("")}${th("")}
  ${th("Octave Band Frequency (Hz)",N_BANDS)}
</tr>
<tr>
  ${th("PATH #")}${th("Description")}${th("")}${th("")}${th("")}
  ${BANDS.map(b=>th(b)).join("")}
</tr>
</thead>
<tbody>
<tr>
  ${c(pathNum)}${cl(PATH_LABEL[path]||path)}${c("")}${c("")}${c("")}
  ${lpBefore.map(v=>c(v.toFixed(1))).join("")}
</tr>
<tr>
  ${cl("Total Lp at Receiver Location","",2)}${c("")}${c("")}${c("")}
  ${lpBefore.map(v=>c(v.toFixed(1))).join("")}
</tr>
<tr class="yl">
  ${cl("<b>Additional dB Reduction Required</b>","bold yl",2)}${c("","yl")}${c("","yl")}${c("","yl")}
  ${(ncNrChoice==="NC"
    ?ncCrit.map((cv,i)=>{ const r=r1(lpBefore[i]-cv); return c(r>0?r.toFixed(1):"0","bold yl"); })
    :ncNrChoice==="NR"
    ?nrCrit.map((cv,i)=>{ const r=r1(lpBefore[i]-cv); return c(r>0?r.toFixed(1):"0","bold yl"); })
    :lpBefore.map((v,i)=>{ const r=r1(v+A_WEIGHT[i]-reqDBA); return c(r>0?r.toFixed(1):"0","bold yl"); })
  ).join("")}
</tr>
<tr>
  ${cl("Required Noise Level @ 1m","",2)}${c("")}${c("")}${c("")}
  ${Array(N_BANDS-1).fill(c("")).join("")}${c(`<b>${reqLabel}</b>`,"bold")}
</tr>
<tr>
  ${cl("<b>Calculated Noise Level at Receiver (1m) — WITHOUT Sound Attenuator</b>","bold rd",2)}
  ${c("","rd")}${c("","rd")}${c("","rd")}
  ${Array(N_BANDS-1).fill(c("","rd")).join("")}
  ${c(`<b>${finalLabel}</b>`,"bold rd")}
</tr>
</tbody>
</table>`;

  /* ── Attenuator table ── */
  const attTable=hasAtt?`
<table>${colGroup}
<thead>
<tr>
  ${th("Additional Measure Required:",2)}${th("")}${th("")}${th("")}
  ${th("Sound Attenuator — Insertion Loss",N_BANDS)}
</tr>
<tr>
  ${th("Attenuator Details")}${th("Selection")}${th("")}${th("")}${th("Model")}
  ${BANDS.map(b=>th(b+" Hz")).join("")}
</tr>
</thead>
<tbody>
<tr>
  <td class="l" rowspan="3" style="font-size:8pt;line-height:1.4">
    <b>Sound Attenuator</b><br/>
    Model: <b>${att.model||"—"}</b><br/>
    W: ${att.width_mm||"–"} mm × H: ${att.height_mm||"–"} mm<br/>
    Length: ${att.length_mm||"–"} mm<br/>
    Pressure Drop: ${att.pressureDrop_pa||"–"} Pa
  </td>
  <td class="l" rowspan="3" style="font-size:8pt">Sound Attenuator Selection</td>
  ${c("")}${c("")}${c(`<b>${att.model||"—"}</b>`,"bold gy")}
  ${attILArr.map(v=>c(v?`-${v.toFixed(1)}`:"0","bold gy")).join("")}
</tr>
<tr>${c("")}${c("")}${c("")}${Array(N_BANDS).fill(c("")).join("")}</tr>
<tr>
  ${c("")}${c("")}
  ${cl("Total Lp at Receiver Location (with attenuator)","",1)}
  ${lpAfter.map(v=>c(v.toFixed(1))).join("")}
</tr>
<tr>
  ${cl("<b>Calculated Noise Level at Receiver (1m) — WITH Sound Attenuator</b>","bold gn",2)}
  ${c("","gn")}${c("","gn")}${c("","gn")}
  ${Array(N_BANDS-1).fill(c("","gn")).join("")}
  ${c(`<b>${finalLabelA}</b>`,"bold gn")}
</tr>
${showAWeight?`
<tr>
  ${cl("Lp + A-Weighting per Band (with attenuator)  [Lp(i) + A(i)]","lgy",5)}
  ${dbaPerBandA.map(v=>c(v.toFixed(1),"lgy")).join("")}
</tr>
<tr class="gn">
  <td class="l bold gn" colspan="5" style="overflow:hidden">
    <b>Total dB(A) WITH Attenuator — Logarithmic Addition</b>
    <span style="font-size:7.5pt;font-weight:normal;margin-left:6px">[10·log₁₀(Σ 10^((Lp+A)/10))]</span>
  </td>
  ${Array(N_BANDS-1).fill(c("","gn")).join("")}
  ${c(`<b>${dbaA.toFixed(1)} dB(A)</b>`,"bold gn")}
</tr>`:""}
</tbody>
</table>`:"";

  return `${pg}
<div class="page">
${hdr}
<p style="font-size:8.5pt;margin-bottom:4px;font-style:italic">The sound power levels for the equipment unit — Path ${pathNum}: ${PATH_LABEL[path]||path}</p>
${mainTable}
${combTable}
${attTable}
<p style="font-size:7.5pt;color:#888;margin-top:4px;text-align:right">Date: ${date} &nbsp;|&nbsp; Rev: ${project?.revision||"00"} &nbsp;|&nbsp; Generated by DG-SARIA Acoustic Calculator</p>
</div>`;
}

/* ═══════════════════════════════════════════════════════
   COMBINED HTML REPORT
═══════════════════════════════════════════════════════ */
export function buildCombinedHTMLReport(allForms, allLiveLp, project, equipmentType){
  const eqType=equipmentType||(allForms[Object.keys(allForms)[0]]?.equipmentType)||"DG";
  const ORDER=["exhaust","intake","through_wall","through_door","through_ceiling_above","through_ceiling_below"];
  const active=ORDER.filter(p=>allForms[p]&&!(eqType==="Pump"&&DUCT_PATHS.includes(p)));
  const sheets=active.map((p,i)=>buildSinglePathHTML(allForms[p],allLiveLp[p]||{},project,i+1)).join("\n");
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>DG Acoustic Calculation Report</title>
<style>${CSS}</style>
</head><body>${sheets}</body></html>`;
}

/* ═══════════════════════════════════════════════════════
   PDF DOWNLOAD — opens print dialog in new tab
   Colors print because of -webkit-print-color-adjust:exact in CSS
═══════════════════════════════════════════════════════ */
export async function downloadCombinedPDF(allForms, allLiveLp, project, equipmentType){
  const html=buildCombinedHTMLReport(allForms,allLiveLp,project,equipmentType);
  const blob=new Blob([html],{type:"text/html;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const win=window.open(url,"_blank");
  if(win){
    win.onload=()=>{ setTimeout(()=>{ win.focus(); win.print(); },800); };
  } else {
    const a=document.createElement("a");
    a.href=url; a.download="DG_Acoustic_Report.html"; a.click();
  }
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}

/* ═══════════════════════════════════════════════════════
   WORD DOWNLOAD — single wide table per path, matches Excel layout
═══════════════════════════════════════════════════════ */
export async function downloadCombinedWord(allForms, allLiveLp, project, equipmentType){
  const { Document, Packer, Paragraph, Table, TableRow, TableCell,
          TextRun, AlignmentType, BorderStyle, WidthType, ShadingType,
          PageBreak } = await import("docx");

  const BRD={style:BorderStyle.SINGLE,size:4,color:"666666"};
  const BRDALL={top:BRD,bottom:BRD,left:BRD,right:BRD};
  const BRDNONE={top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE}};
  const sh=fill=>({type:ShadingType.SOLID,color:fill,fill});
  const GY=sh("D9D9D9"),YEL=sh("FFFF00"),AYL=sh("FFFACD"),GRN=sh("C6EFCE"),RED=sh("FFC7CE"),LGY=sh("F2F2F2"),WHT=sh("FFFFFF");

  function run(t,opts={}){
    return new TextRun({text:String(t??""),bold:!!opts.bold,size:opts.size||16,font:"Times New Roman",color:opts.color||"000000",italics:!!opts.italic});
  }
  function para(runs,opts={}){
    return new Paragraph({children:Array.isArray(runs)?runs:[run(runs,opts)],alignment:opts.align||AlignmentType.LEFT,spacing:{before:0,after:0}});
  }
  function sp(){ return new Paragraph({text:"",spacing:{before:60,after:0}}); }

  /* col widths in dxa for A4 portrait (usable ~11200 dxa):
     desc(3200) | W(500) | H(500) | L(500) | STC(500) | 8×(762) = 3200+500*4+762*8=3200+2000+6096=11296 */
  const COL=[3200,500,500,500,500,...BANDS.map(()=>762)];

  function mkCell(content,opts={}){
    const isParas=Array.isArray(content)&&content[0] instanceof Paragraph;
    const children=isParas?content:[para(
      typeof content==="string"?[run(content,{bold:opts.bold,color:opts.color,size:opts.size||15,italic:opts.italic})]:[content],
      {align:opts.align||AlignmentType.CENTER}
    )];
    return new TableCell({
      children,
      shading:opts.shade||WHT,
      borders:opts.noBorder?BRDNONE:BRDALL,
      columnSpan:opts.span||1,
      rowSpan:opts.rowSpan||1,
      width:{size:0,type:WidthType.AUTO},
      verticalAlign:"center",
    });
  }
  function hCell(t,shade2=GY,span=1){
    return mkCell(t,{bold:true,shade:shade2,align:AlignmentType.CENTER,span,size:14});
  }
  function mkRow(cells){ return new TableRow({children:cells}); }

  /* data row: desc | W | H | L | STC | 8 bands (13 cells) */
  function dataRow(label,wv,hv,lv,stc,arr,shade2=null,neg=false,bold=false){
    return mkRow([
      mkCell([para([run(label,{bold,size:14})],{align:AlignmentType.LEFT})],{shade:shade2||WHT}),
      mkCell(String(wv??""),{shade:shade2||WHT,size:14}),
      mkCell(String(hv??""),{shade:shade2||WHT,size:14}),
      mkCell(String(lv??""),{shade:shade2||WHT,size:14}),
      mkCell(String(stc??""),{shade:shade2||WHT,size:14,bold:!!stc}),
      ...arr.map(v=>{
        const n=Number(v);
        const txt=isNaN(n)||n===undefined?"—":neg?`(${Math.abs(n).toFixed(1)})`:n.toFixed(1);
        return mkCell(txt,{shade:shade2||WHT,bold,size:14});
      }),
    ]);
  }

  function fullSpan(txt,shade2=null,bold=false){
    return mkRow([mkCell([para([run(txt,{bold,size:14})],{align:AlignmentType.LEFT})],{span:TOTAL_COLS,shade:shade2||WHT})]);
  }

  const eqType=equipmentType||(allForms[Object.keys(allForms)[0]]?.equipmentType)||"DG";
  const ORDER=["exhaust","intake","through_wall","through_door","through_ceiling_above","through_ceiling_below"];
  const active=ORDER.filter(p=>allForms[p]&&!(eqType==="Pump"&&DUCT_PATHS.includes(p)));
  const allChildren=[];
  const dateStr=new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});

  active.forEach((pathKey,pi)=>{
    const pathNum=pi+1;
    const form=allForms[pathKey];
    const liveLp=allLiveLp[pathKey]||{};
    const equipType=form.equipmentType||"DG";
    const generators=Array.isArray(form.generators)&&form.generators.length>0
      ?form.generators:(form.generator?[form.generator]:[{}]);
    const combinedSWL=combineEquipmentSWL(generators);
    const g=generators[0]||{};
    const rec=form.receiver||{};
    const att=form.attenuator||{};
    const rm=form.room||{};
    const de=form.distanceEffect||{};
    const erl=form.erl||{};
    const tp=form.throughPath||{};
    const rw=form.rockwool||{};
    const ducts=Array.isArray(form.ducts)?form.ducts:[];
    const path=form.noisePath||"exhaust";
    const isDuct=DUCT_PATHS.includes(path);
    const isThrough=["through_wall","through_door","through_ceiling_above","through_ceiling_below"].includes(path);
    const isRW=["through_wall","through_ceiling_above"].includes(path);
    const useRoom=form.roomOrDistance==="spaceRoom";
    const ncNrChoice=rec.ncNrChoice||"dBA";
    const showAWeight=ncNrChoice==="dBA";
    const reqNC=Number(rec.requiredNC)||50;
    const reqNR=Number(rec.requiredNR)||50;
    const reqDBA=Number(rec.required_dba)||65;

    const swlArr=BAND_KEYS.map(k=>Number(combinedSWL[k])||0);
    const Z8=BANDS.map(()=>0);
    const attILArr=BAND_KEYS.map(k=>Number(att.il?.[k])||0);
    const hasAtt=attILArr.some(v=>v>0);
    const erlArr=isDuct&&Number(erl.width_mm)&&Number(erl.height_mm)
      ?(calcERL(Number(erl.width_mm),Number(erl.height_mm))||Z8):Z8;

    let distArr=Z8,distLabel="";
    if(isDuct){ distArr=BANDS.map(()=>-5); distLabel="Distance Correction (r=1m, Q=4) = -5 dB"; }
    else if(useRoom){ const S=liveSchultzOffsets(Number(rm.length_m)||1,Number(rm.width_m)||1,Number(rm.height_m)||1,Number(rm.distance_m)||1); distArr=Array.isArray(S)?S:Z8; distLabel=`Room Correction — Schultz method (r=${rm.distance_m||"–"} m)`; }
    else { const deObj=calcDistanceEffect(Number(de.distance_m)||1,Number(de.directivity)||2); distArr=deObj?BAND_KEYS.map(k=>Number(deObj[k])||0):Z8; distLabel=`Distance Effect r=${de.distance_m||"–"} m, Q=${de.directivity||"–"}`; }

    const ductRows=[];
    if(isDuct){
      ducts.forEach((d,di)=>{
        const lined=d.lining==="lined";
        const lbl=d.label||`Duct ${di+1}`;
        const type=lined?"Lined":"Unlined";
        const sIL=lined?calcLinedIL(d.width_mm,d.height_mm,d.length_m,d.liningThickness_in,d.coeffA):calcUnlinedIL(d.width_mm,d.height_mm,d.length_m);
        const eIL=calcElbowIL(d.width_mm,d.elbows,lined);
        if(sIL) ductRows.push({label:`${lbl} — ${type} Duct IL`,w:d.width_mm||"",h:d.height_mm||"",l:d.length_m||"",vals:sIL,neg:true});
        if(eIL&&eIL.some(v=>v!==0)) ductRows.push({label:`${lbl} — Elbow IL (${d.elbows||0} nos)`,w:d.width_mm||"",h:"",l:d.elbows||"",vals:eIL,neg:true});
      });
    }

    let tlArr=Z8,tlLabel="",stcVal="";
    if(path==="through_wall"&&tp.wall_stc){ const r=findRowByDbaTotal(Number(tp.wall_stc)); tlArr=r?r.dba:[...Z8]; tlLabel=tp.wall_label?`${tp.wall_label} — Transmission Loss`:"Wall — Transmission Loss"; stcVal=`STC ${tp.wall_stc}`; }
    else if(path==="through_door"&&tp.door_stc){ const r=findRowByDbaTotal(Number(tp.door_stc)); tlArr=r?r.dba:[...Z8]; tlLabel=tp.door_label?`${tp.door_label} — Transmission Loss`:"Door — Transmission Loss"; stcVal=`STC ${tp.door_stc}`; }
    else if(["through_ceiling_above","through_ceiling_below"].includes(path)&&tp.ceiling_bands){ tlArr=BAND_KEYS.map(k=>-(Number(tp.ceiling_bands[k])||0)); tlLabel=tp.ceiling_label?`${tp.ceiling_label} — Ceiling IL`:"Ceiling — Insertion Loss"; stcVal=""; }
    const hasTL=tlArr.some(v=>v!==0);

    const rvcArr=isRW?(calcRockwoolRVC(rw.length_m,rw.width_m,rw.height_m,rw.alpha||{})||Z8):Z8;
    const hasRVC=rvcArr.some(v=>v!==0);
    const lpBefore=BAND_KEYS.map((k,i)=>(Number(liveLp[k])||0)+(hasAtt?attILArr[i]:0));
    const lpAfter=BAND_KEYS.map(k=>Number(liveLp[k])||0);
    const dbaB=totalDBA(lpBefore),dbaA=totalDBA(lpAfter);
    const dbaPerBandBW=lpBefore.map((v,i)=>r1(v+A_WEIGHT[i]));
    const dbaPerBandAW=lpAfter.map((v,i)=>r1(v+A_WEIGHT[i]));
    const ncCrit=getNCCriteria(reqNC);
    const nrCrit=getNRCriteria(reqNR);
    const ncR=calcNCRating(lpBefore),nrR=calcNRRating(lpBefore);
    const ncRA=calcNCRating(lpAfter),nrRA=calcNRRating(lpAfter);
    const finalLabel=ncNrChoice==="NC"?`NC ${ncR}`:ncNrChoice==="NR"?`NR ${nrR}`:`${dbaB.toFixed(1)} dB(A)`;
    const finalLabelA=ncNrChoice==="NC"?`NC ${ncRA}`:ncNrChoice==="NR"?`NR ${nrRA}`:`${dbaA.toFixed(1)} dB(A)`;
    const reqLabel=ncNrChoice==="NC"?`${reqNC} NC`:ncNrChoice==="NR"?`${reqNR} NR`:`${reqDBA} dB(A)`;

    if(pi>0) allChildren.push(new Paragraph({children:[new PageBreak()]}));

    // Info block
    allChildren.push(
      para([run("EQUIPMENT ID: ",{bold:true,size:18}),run(g.equipmentId||"—",{size:18})]),
      para([run("NOISE PATH: ",{bold:true,size:18}),run(PATH_LABEL[path]||path,{size:18})]),
      para([run("MODEL NUMBER: ",{bold:true,size:18}),run(g.modelNumber||"—",{size:18})]),
      para([run("BUILDING REF: ",{bold:true,size:18}),run(g.buildingRef||"—",{size:18})]),
      para([run("RECEIVER LOCATION: ",{bold:true,size:18}),run(rec.description||"—",{size:18})]),
      sp(),
    );

    const tblRows=[];
    // Header rows
    tblRows.push(mkRow([hCell(`Path ${pathNum} | ${PATH_LABEL[path]||path}`,GY,TOTAL_COLS)]));
    tblRows.push(mkRow([
      hCell("Description"),hCell("Width\n(mm)"),hCell("Height\n(mm)"),hCell("Length\n/ No."),hCell("STC"),
      ...BANDS.map(b=>hCell(`${b}\nHz`)),
    ]));

    if(isDuct){
      // 1. SWL
      tblRows.push(dataRow(`${equipType==="Pump"?"PUMP":"GENERATOR"} SOUND POWER LEVEL (Combined)`,"","","","",swlArr,GY,false,true));
      // 2. Ducts
      ductRows.forEach(dr=>tblRows.push(dataRow(dr.label,dr.w,dr.h,dr.l,"",dr.vals,null,dr.neg)));
      // 3. ERL
      if(erlArr.some(v=>v!==0)) tblRows.push(dataRow(`End Reflection Loss W=${erl.width_mm||"–"}mm H=${erl.height_mm||"–"}mm`,erl.width_mm||"",erl.height_mm||"","1","",erlArr,null,true));
      // 4. Distance Correction
      tblRows.push(dataRow(distLabel,"","","","",distArr));
      // 5. Receiver Location note
      tblRows.push(fullSpan(`Receiver Location: 1 m from ${path==="exhaust"?"Exhaust":"Intake"} air louvre (Acoustic Louvre) — acoustically critical receiver location`,LGY));
      // 6. A-Weighting
      if(showAWeight) tblRows.push(dataRow("A-Weighting Correction","","","","",A_WEIGHT));
      // 7. Room dims
      tblRows.push(mkRow([
        mkCell([para([run("Room Length",{size:14,italic:true})],{align:AlignmentType.LEFT})],{shade:LGY}),
        mkCell(`${rm.length_m||"–"} M`,{shade:LGY,size:13}),
        mkCell([para([run("Room Height (up to ceiling)",{size:13,italic:true})],{align:AlignmentType.LEFT})],{shade:LGY,span:2}),
        mkCell(`${rm.height_m||"–"} M`,{shade:LGY,size:13}),
        ...Array(N_BANDS).fill(null).map(()=>mkCell("",{shade:LGY})),
      ]));
      tblRows.push(mkRow([
        mkCell([para([run("Room Width",{size:14,italic:true})],{align:AlignmentType.LEFT})],{shade:LGY}),
        mkCell(`${rm.width_m||"–"} M`,{shade:LGY,size:13}),
        mkCell([para([run("Distance to receiver",{size:13,italic:true})],{align:AlignmentType.LEFT})],{shade:LGY,span:2}),
        mkCell("1 M (from louvre)",{shade:LGY,size:13}),
        ...Array(N_BANDS).fill(null).map(()=>mkCell("",{shade:LGY})),
      ]));
      // 8. Resultant
      tblRows.push(dataRow("RESULTANT SOUND PRESSURE LEVEL @ 1m — Without Sound Attenuator","","","","",lpBefore,AYL,false,true));
      // 9. dB(A) logarithmic rows (only when dBA criterion)
      if(showAWeight){
        tblRows.push(dataRow("Lp + A-Weighting per Band  [Lp(i) + A(i)]","","","","",dbaPerBandBW,LGY));
        tblRows.push(mkRow([
          mkCell([para([run("Total dB(A) — Logarithmic Addition  [10·log₁₀(Σ 10^((Lp+A)/10))]",{bold:true,size:14})],{align:AlignmentType.LEFT})],{shade:AYL,span:5}),
          ...Array(N_BANDS-1).fill(null).map(()=>mkCell("",{shade:AYL})),
          mkCell(`${dbaB.toFixed(1)} dB(A)`,{shade:AYL,bold:true,size:14}),
        ]));
      }
    } else {
      // 1. SWL
      tblRows.push(dataRow(`${equipType==="Pump"?"PUMP":"GENERATOR"} SOUND POWER LEVEL (Combined)`,"","","","",swlArr,GY,false,true));
      // 2. Distance/Room Correction
      if(distArr.some(v=>v!==0)) tblRows.push(dataRow(distLabel,"","","","",distArr));
      // 3. TL (STC in own cell)
      if(hasTL) tblRows.push(dataRow(tlLabel,"","","",stcVal,tlArr,AYL));
      // 4. RVC
      if(hasRVC){ const vol=((rw.length_m||0)*(rw.width_m||0)*(rw.height_m||0)).toFixed(1); tblRows.push(dataRow(`Room Volume Correction V=${vol} m³`,rw.width_m||"",rw.height_m||"",rw.length_m||"","",rvcArr)); }
      // 5. A-Weighting
      if(showAWeight) tblRows.push(dataRow("A-Weighting Correction","","","","",A_WEIGHT));
      // 6. Receiver Location note
      tblRows.push(fullSpan(`Receiver Location: ${de.distance_m||rm.distance_m||"–"} m from DG room ${path.includes("wall")?"wall":path.includes("door")?"door":"ceiling"} — acoustically critical receiver location`,LGY));
      // 7. Resultant
      tblRows.push(dataRow("RESULTANT SOUND PRESSURE LEVEL @ 1m — Without Sound Attenuator","","","","",lpBefore,AYL,false,true));
      // 8. dB(A) logarithmic rows (only when dBA criterion)
      if(showAWeight){
        tblRows.push(dataRow("Lp + A-Weighting per Band  [Lp(i) + A(i)]","","","","",dbaPerBandBW,LGY));
        tblRows.push(mkRow([
          mkCell([para([run("Total dB(A) — Logarithmic Addition  [10·log₁₀(Σ 10^((Lp+A)/10))]",{bold:true,size:14})],{align:AlignmentType.LEFT})],{shade:AYL,span:5}),
          ...Array(N_BANDS-1).fill(null).map(()=>mkCell("",{shade:AYL})),
          mkCell(`${dbaB.toFixed(1)} dB(A)`,{shade:AYL,bold:true,size:14}),
        ]));
      }
    }

    allChildren.push(new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:tblRows}),sp());

    // Combination table
    const combRows=[
      mkRow([hCell("Combination of Path Results — Logarithmic Addition",GY,2),hCell("",GY,3),hCell("Octave Band Frequency (Hz)",GY,N_BANDS)]),
      mkRow([hCell("PATH #"),hCell("Description"),hCell(""),hCell(""),hCell(""),...BANDS.map(b=>hCell(b))]),
      mkRow([mkCell(String(pathNum)),mkCell([para([run(PATH_LABEL[path]||path,{size:14})],{align:AlignmentType.LEFT})]),mkCell(""),mkCell(""),mkCell(""),...lpBefore.map(v=>mkCell(v.toFixed(1)))]),
      mkRow([mkCell([para([run("Total Lp at Receiver Location",{size:14})],{align:AlignmentType.LEFT})],{span:2}),mkCell(""),mkCell(""),mkCell(""),...lpBefore.map(v=>mkCell(v.toFixed(1)))]),
      mkRow([
        mkCell([para([run("Additional dB Reduction Required",{bold:true,size:14})],{align:AlignmentType.LEFT})],{shade:YEL,span:2}),
        mkCell("",{shade:YEL}),mkCell("",{shade:YEL}),mkCell("",{shade:YEL}),
        ...(ncNrChoice==="NC"
          ?ncCrit.map((cv,i)=>mkCell(r1(lpBefore[i]-cv)>0?String(r1(lpBefore[i]-cv).toFixed(1)):"0",{shade:YEL,bold:true,size:14}))
          :ncNrChoice==="NR"
          ?nrCrit.map((cv,i)=>mkCell(r1(lpBefore[i]-cv)>0?String(r1(lpBefore[i]-cv).toFixed(1)):"0",{shade:YEL,bold:true,size:14}))
          :lpBefore.map((v,i)=>mkCell(r1(v+A_WEIGHT[i]-reqDBA)>0?String(r1(v+A_WEIGHT[i]-reqDBA).toFixed(1)):"0",{shade:YEL,bold:true,size:14}))
        ),
      ]),
      mkRow([mkCell([para([run("Required Noise Level @ 1m",{size:14})],{align:AlignmentType.LEFT})],{span:2}),mkCell(""),mkCell(""),mkCell(""),...Array(N_BANDS-1).fill(null).map(()=>mkCell("")),mkCell(reqLabel,{bold:true,size:14})]),
      mkRow([
        mkCell([para([run("Calculated Noise Level at Receiver (1m) — WITHOUT Sound Attenuator",{bold:true,size:14})],{align:AlignmentType.LEFT})],{shade:RED,span:2}),
        mkCell("",{shade:RED}),mkCell("",{shade:RED}),mkCell("",{shade:RED}),
        ...Array(N_BANDS-1).fill(null).map(()=>mkCell("",{shade:RED})),
        mkCell(finalLabel,{shade:RED,bold:true,color:"9C0006",size:14}),
      ]),
    ];
    allChildren.push(new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:combRows}),sp());

    if(hasAtt){
      const attRows=[
        mkRow([hCell("Additional Measure Required:",GY,2),hCell("",GY,3),hCell("Sound Attenuator — Insertion Loss",GY,N_BANDS)]),
        mkRow([hCell("Attenuator Details"),hCell("Selection"),hCell(""),hCell(""),hCell("Model"),...BANDS.map(b=>hCell(b))]),
        mkRow([
          mkCell([
            para([run(`Sound Attenuator`,{bold:true,size:14})]),
            para([run(`Model: ${att.model||"—"}`,{size:13})]),
            para([run(`W: ${att.width_mm||"–"} mm × H: ${att.height_mm||"–"} mm`,{size:13})]),
            para([run(`Length: ${att.length_mm||"–"} mm`,{size:13})]),
            para([run(`Pr.Drop: ${att.pressureDrop_pa||"–"} Pa`,{size:13})]),
          ],{rowSpan:3}),
          mkCell([para([run("Sound Attenuator\nSelection",{size:13})],{align:AlignmentType.LEFT})],{rowSpan:3}),
          mkCell(""),mkCell(""),
          mkCell(att.model||"—",{shade:GY,bold:true,size:14}),
          ...attILArr.map(v=>mkCell(v?`-${v.toFixed(1)}`:"0",{shade:GY,bold:true,size:14})),
        ]),
        mkRow([mkCell(""),mkCell(""),mkCell(""),...Array(N_BANDS).fill(null).map(()=>mkCell(""))]),
        mkRow([mkCell([para([run("Total Lp at Receiver Location (with attenuator)",{size:14})],{align:AlignmentType.LEFT})],{span:3}),...Array(N_BANDS).fill(null).map((_,i)=>mkCell(lpAfter[i].toFixed(1)))]),
        mkRow([
          mkCell([para([run("Calculated Noise Level at Receiver (1m) — WITH Sound Attenuator",{bold:true,size:14})],{align:AlignmentType.LEFT})],{shade:GRN,span:5}),
          ...Array(N_BANDS-1).fill(null).map(()=>mkCell("",{shade:GRN})),
          mkCell(finalLabelA,{shade:GRN,bold:true,color:"276221",size:14}),
        ]),
        ...(showAWeight?[
          dataRow("Lp + A-Weighting per Band (with attenuator)  [Lp(i) + A(i)]","","","","",dbaPerBandAW,LGY),
          mkRow([
            mkCell([para([run("Total dB(A) WITH Attenuator — Logarithmic Addition  [10·log₁₀(Σ 10^((Lp+A)/10))]",{bold:true,size:14})],{align:AlignmentType.LEFT})],{shade:GRN,span:5}),
            ...Array(N_BANDS-1).fill(null).map(()=>mkCell("",{shade:GRN})),
            mkCell(`${dbaA.toFixed(1)} dB(A)`,{shade:GRN,bold:true,color:"276221",size:14}),
          ]),
        ]:[]),
      ];
      allChildren.push(new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:attRows}),sp());
    }

    allChildren.push(para([run(`Date: ${dateStr}  |  Rev: ${project?.revision||"00"}  |  DG-SARIA Acoustic Calculator`,{size:13,italic:true,color:"888888"})],{align:AlignmentType.RIGHT}));
  });

  const doc=new Document({
    sections:[{
      properties:{
        page:{
          size:{width:12240,height:15840}, // A4 portrait in dxa (8.5" × 11" ≈ A4)
          margin:{top:720,right:600,bottom:720,left:600},
        },
      },
      children:allChildren,
    }],
  });

  const blob=await Packer.toBlob(doc);
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download=`DG_Acoustic_Report_${(project?.name||project?.projectName||"Report").replace(/\s+/g,"_")}_Rev${project?.revision||"00"}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ═══════════════════════════════════════════════════════
   DOWNLOAD MODAL
═══════════════════════════════════════════════════════ */
export function DownloadModal({ onClose, allForms, allLiveLp, project, equipmentType }){
  const [loading, setLoading] = useState(null);
  const [prevPath, setPrevPath] = useState(null);

  const eqType=equipmentType||(allForms[Object.keys(allForms)[0]]?.equipmentType)||"DG";
  const ORDER=["exhaust","intake","through_wall","through_door","through_ceiling_above","through_ceiling_below"];
  const active=ORDER.filter(p=>allForms[p]&&!(eqType==="Pump"&&DUCT_PATHS.includes(p)));

  const previewHtml=useMemo(()=>{
    if(prevPath&&allForms[prevPath]){
      const idx=active.indexOf(prevPath);
      return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><style>${CSS}</style></head><body>
        ${buildSinglePathHTML(allForms[prevPath],allLiveLp[prevPath]||{},project,idx+1)}
      </body></html>`;
    }
    return buildCombinedHTMLReport(allForms,allLiveLp,project,eqType);
  },[allForms,allLiveLp,project,prevPath,eqType]);

  const handle=async(type)=>{
    setLoading(type);
    try{
      if(type==="pdf") await downloadCombinedPDF(allForms,allLiveLp,project,eqType);
      else             await downloadCombinedWord(allForms,allLiveLp,project,eqType);
      toast.success(type==="pdf"?"Print dialog opened — save as PDF":"Word file downloaded");
    }catch(e){ console.error(e); toast.error("Download failed: "+e.message); }
    finally{ setLoading(null); }
  };

  const S={
    overlay:{position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(10,20,40,.65)",backdropFilter:"blur(4px)"},
    modal:{width:"min(99vw,1100px)",height:"min(96vh,860px)",background:"#fff",borderRadius:14,boxShadow:"0 24px 60px rgba(0,0,0,.35)",display:"flex",flexDirection:"column",overflow:"hidden",fontFamily:"Inter,sans-serif"},
    head:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 20px",borderBottom:"1.5px solid #E2E8F0",flexShrink:0,background:"#F8FAFC"},
    tabs:{display:"flex",gap:6,padding:"7px 18px",borderBottom:"1px solid #E2E8F0",flexShrink:0,overflowX:"auto",background:"#F1F5F9"},
    preview:{flex:1,overflow:"hidden",background:"#CBD5E1"},
    foot:{padding:"12px 20px 14px",borderTop:"1.5px solid #E2E8F0",flexShrink:0,background:"#FAFAFA"},
  };

  const tab=(label,val)=>(
    <button key={val??""} type="button" onClick={()=>setPrevPath(val)}
      style={{padding:"5px 13px",borderRadius:7,border:`1.5px solid ${prevPath===val?"#2563EB":"#E2E8F0"}`,background:prevPath===val?"#EFF6FF":"#fff",color:prevPath===val?"#2563EB":"#64748B",fontSize:11.5,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>
      {label}
    </button>
  );

  return (
    <div style={S.overlay}>
      <div style={S.modal}>
        <div style={S.head}>
          <div>
            <span style={{fontSize:15,fontWeight:700,color:"#0F172A"}}>Acoustic Report Preview</span>
            <span style={{fontSize:11,color:"#64748B",marginLeft:10}}>{active.length} path{active.length!==1?"s":""} · A4 Portrait</span>
          </div>
          <button onClick={onClose} type="button" style={{background:"none",border:"none",cursor:"pointer",color:"#94A3B8",fontSize:22,lineHeight:1,padding:"2px 6px"}}>✕</button>
        </div>

        <div style={S.tabs}>
          {tab("All Paths",null)}
          {active.map(p=>tab(PATH_SHORT[p]||p,p))}
        </div>

        <div style={S.preview}>
          <iframe srcDoc={previewHtml} title="Report Preview" style={{width:"100%",height:"100%",border:"none"}} sandbox="allow-same-origin"/>
        </div>

        <div style={S.foot}>
          <p style={{fontSize:11,color:"#64748B",margin:"0 0 9px",textAlign:"center"}}>
            Downloads include <strong>all {active.length} path{active.length!==1?"s":""}</strong> · A4 Portrait format
          </p>
          <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>

            <button type="button" disabled={!!loading} onClick={()=>handle("pdf")}
              style={{display:"flex",alignItems:"center",gap:10,padding:"10px 22px",borderRadius:10,border:"1.5px solid #FECDD3",background:"#FFF1F2",cursor:loading?"not-allowed":"pointer",minWidth:175,opacity:loading&&loading!=="pdf"?.6:1}}>
              <div style={{width:34,height:34,borderRadius:8,background:"#FEE2E2",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                {loading==="pdf"?<Loader2 size={16} color="#E11D48" style={{animation:"spin .7s linear infinite"}}/>:<FileText size={16} color="#E11D48"/>}
              </div>
              <div style={{textAlign:"left"}}>
                <div style={{fontSize:13,fontWeight:700,color:"#0F172A"}}>Print / Save PDF</div>
                <div style={{fontSize:10,color:"#94A3B8",marginTop:1}}>Opens print dialog · A4 Portrait</div>
              </div>
            </button>

            <button type="button" disabled={!!loading} onClick={()=>handle("word")}
              style={{display:"flex",alignItems:"center",gap:10,padding:"10px 22px",borderRadius:10,border:"1.5px solid #BFDBFE",background:"#EFF6FF",cursor:loading?"not-allowed":"pointer",minWidth:175,opacity:loading&&loading!=="word"?.6:1}}>
              <div style={{width:34,height:34,borderRadius:8,background:"#DBEAFE",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                {loading==="word"?<Loader2 size={16} color="#1D4ED8" style={{animation:"spin .7s linear infinite"}}/>:<FileIcon size={16} color="#1D4ED8"/>}
              </div>
              <div style={{textAlign:"left"}}>
                <div style={{fontSize:13,fontWeight:700,color:"#0F172A"}}>Download Word</div>
                <div style={{fontSize:10,color:"#94A3B8",marginTop:1}}>Editable .docx · A4 Portrait</div>
              </div>
            </button>

          </div>
        </div>
      </div>
    </div>
  );
}
import { useState, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap, Box, Wind, Gauge, MapPin, Waves, Navigation,
  ChevronDown, ChevronUp, Loader2, Calculator,
  Info, Plus, Trash2, Layers,
} from "lucide-react";
import toast from "react-hot-toast";
import { createCalculationApi, updateCalculationApi, runCalculationApi } from "@/api/calculationApi";

const BANDS     = [63, 125, 250, 500, 1000, 2000, 4000, 8000];
const BAND_KEYS = ["hz63","hz125","hz250","hz500","hz1000","hz2000","hz4000","hz8000"];
const A_WEIGHT  = [-26.2, -16.1, -8.6, -3.2, 0, 1.2, 1.0, -1.1];

const A_WEIGHTING = {
  hz63:-26.2, hz125:-16.1, hz250:-8.6, hz500:-3.2,
  hz1000:0,   hz2000:1.2,  hz4000:1.0, hz8000:-1.1,
};

const NOISE_INPUT_TYPES = [
  { value:"swl_db",  label:"SWL dB"   },
  { value:"swl_dba", label:"SWL dB(A)"},
  { value:"spl_db",  label:"SPL dB"   },
  { value:"spl_dba", label:"SPL dB(A)"},
];
const DISTANCE_MODES = ["spl_db","spl_dba"];

function round1(n) { return Math.round(n * 10) / 10; }

function computeSWLFromRaw(noiseInputType, rawBand, distance_m) {
  const r = distance_m > 0 ? distance_m : 1;
  const distanceTerm = 10 * Math.log10(4 * Math.PI * r * r);
  const out = {};
  BAND_KEYS.forEach(k => {
    const raw  = rawBand?.[k] ?? 0;
    const corr = A_WEIGHTING[k];
    let swl;
    if      (noiseInputType === "swl_dba") swl = raw - corr;
    else if (noiseInputType === "spl_db")  swl = raw + distanceTerm;
    else if (noiseInputType === "spl_dba") swl = (raw - corr) + distanceTerm;
    else                                   swl = raw;
    out[k] = round1(swl);
  });
  return out;
}

/* ── Conversion preview table (from existing form) ─────────── */
const thS = { border:"1px solid #E2E8F0", padding:"6px 8px", background:"#F1F5F9",
  fontWeight:700, color:"#475569", textAlign:"center", whiteSpace:"nowrap" };
const tdS = { border:"1px solid #E2E8F0", padding:"6px 8px", textAlign:"center", color:"#334155" };

function ConversionPreviewTable({ noiseInputType, rawBand, distance_m, resultBand }) {
  if (noiseInputType === "swl_db") return null;
  const r = distance_m > 0 ? distance_m : 1;
  const distanceTerm = round1(10 * Math.log10(4 * Math.PI * r * r));
  const entryLabel = {
    swl_dba:"Entered SWL dB(A)",
    spl_db: "Entered SPL dB",
    spl_dba:"Entered SPL dB(A)",
  }[noiseInputType];
  const rows = [{ label: entryLabel, values: BAND_KEYS.map(k => rawBand?.[k] ?? 0) }];
  if (noiseInputType === "swl_dba") {
    rows.push({ label:"Resulting SWL (dB)", values: BAND_KEYS.map(k => resultBand?.[k] ?? 0), highlight:true });
  } else if (noiseInputType === "spl_db") {
    rows.push({ label:`+10·log₁₀(4πr²)  @ r=${r}m`, values: BAND_KEYS.map(() => distanceTerm) });
    rows.push({ label:"Resulting SWL (dB)", values: BAND_KEYS.map(k => resultBand?.[k] ?? 0), highlight:true });
  } else if (noiseInputType === "spl_dba") {
    rows.push({ label:"SPL (dB) after A-Weighting", values: BAND_KEYS.map(k => round1((rawBand?.[k]??0) - A_WEIGHTING[k])) });
    rows.push({ label:`+10·log₁₀(4πr²)  @ r=${r}m`, values: BAND_KEYS.map(() => distanceTerm) });
    rows.push({ label:"Resulting SWL (dB)", values: BAND_KEYS.map(k => resultBand?.[k] ?? 0), highlight:true });
  }
  return (
    <div style={{ overflowX:"auto", marginTop:14 }}>
      <table style={{ borderCollapse:"collapse", width:"100%", minWidth:640, fontFamily:"Inter,sans-serif", fontSize:12 }}>
        <thead>
          <tr>
            <th style={{...thS, textAlign:"left"}}>Band</th>
            {BANDS.map(b => <th key={b} style={thS}>{b}Hz</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ background: row.highlight ? "#E3F8F5" : (i%2?"#F8FAFC":"#fff") }}>
              <td style={{...tdS, fontWeight:600, textAlign:"left", whiteSpace:"nowrap"}}>{row.label}</td>
              {row.values.map((v, j) => (
                <td key={j} style={{...tdS, fontWeight:row.highlight?700:500, color:row.highlight?"#0E9F8E":"#334155"}}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const EMPTY_BAND = { hz63:0, hz125:0, hz250:0, hz500:0, hz1000:0, hz2000:0, hz4000:0, hz8000:0 };

// ── Lined duct default coefficients (from doc image) ──────────
// B = Coeff A (manufacturer), C = Coeff B (constant), D = Coeff C (constant)
const LINED_DEFAULT = {
  A: [0.04, 0.08, 0.14, 0.22, 0.32, 0.40, 0.53, 0.53],   // Coeff A (B in formula)
  B: [1.959, 1.41, 0.824, 0.5, 0.695, 0.802, 0.451, 0.219], // Coeff B (C in formula)
  C: [0.917, 0.941, 1.079, 1.087, 0, 0, 0, 0],              // Coeff C (D in formula)
};

// ── Elbow IL lookup tables ─────────────────────────────────────
// Rows: width ≤200, 201-400, 401-800, ≥801 mm; Cols: 63 125 250 500 1k 2k 4k 8k Hz
const ELBOW_WIDTH_RANGES = ["≤200 mm", "201–400 mm", "401–800 mm", "≥801 mm"];
const ELBOW_WIDTH_BREAKS = [200, 400, 800]; // upper bounds for each row except last
const ELBOW_UNLINED_TBL = [
  [0,0,0,1,5,8,4,3],[0,1,5,5,8,4,3,3],[0,5,5,8,4,3,3,3],[1,5,8,4,3,3,3,3],
];
const ELBOW_LINED_TBL = [
  [0,0,0,1,6,11,10,10],[0,1,6,6,11,10,10,10],[0,6,6,11,10,10,10,10],[1,6,11,10,10,10,10,10],
];

// ── Live duct IL calculation ───────────────────────────────────
function mmToFt(mm) { return mm / 304.8; }
function mToFt(m)   { return m  / 0.3048; }

function calcUnlinedIL(width_mm, height_mm, length_m) {
  const W = mmToFt(width_mm||0);
  const H = mmToFt(height_mm||0);
  const L = mToFt(length_m||0);
  if (W <= 0 || H <= 0 || L <= 0) return null;
  const P = 2 * (W + H);
  const S = W * H;
  const PS = P / S;
  return BANDS.map(f => {
    let il;
    if (PS >= 3) {
      il = -1 * 17.0 * Math.pow(PS, -0.25) * Math.pow(f, -0.85) * L;
    } else {
      il = -1 * 1.64 * Math.pow(PS, 0.73) * Math.pow(f, -0.58) * L;
    }
    return Math.round(il * 100) / 100;
  });
}

function calcLinedIL(width_mm, height_mm, length_m, thickness_in, coeffAOverride) {
  const W = mmToFt(width_mm||0);
  const H = mmToFt(height_mm||0);
  const L = mToFt(length_m||0);
  const t = Number(thickness_in) || 1;
  if (W <= 0 || H <= 0 || L <= 0) return null;
  const P = 2 * (W + H);
  const S = W * H;
  const PS = P / S;
  return BANDS.map((_, i) => {
    const B = (coeffAOverride?.[BAND_KEYS[i]] && coeffAOverride[BAND_KEYS[i]] !== 0)
      ? coeffAOverride[BAND_KEYS[i]]
      : LINED_DEFAULT.A[i];
    const C = LINED_DEFAULT.B[i];
    const D = LINED_DEFAULT.C[i];
    const il = -1 * B * Math.pow(PS, C) * Math.pow(t, D) * L;
    return Math.round(il * 100) / 100;
  });
}

function getElbowRowIdx(width_mm) {
  const w = Number(width_mm)||0;
  if (w <= 200) return 0;
  if (w <= 400) return 1;
  if (w <= 800) return 2;
  return 3;
}

function calcElbowIL(width_mm, elbows, lined) {
  const n = Number(elbows)||0;
  if (n <= 0) return null;
  const ri = getElbowRowIdx(width_mm);
  const tbl = lined ? ELBOW_LINED_TBL : ELBOW_UNLINED_TBL;
  return tbl[ri].map(v => v * n);
}

function combineDuctIL(ductIL, elbowIL) {
  if (!ductIL && !elbowIL) return null;
  return BAND_KEYS.map((_, i) => {
    const d = ductIL  ? ductIL[i]  : 0;
    const e = elbowIL ? elbowIL[i] : 0;
    return Math.round((d + e) * 100) / 100;
  });
}

// ── Radiated Noise Path — Transmission Loss ──────────────────
// NC table from PDF: key = NC level (= STC), values = per-band dB at [63,125,250,500,1k,2k,4k,8k Hz]
// Green column in PDF = NC/STC level; band values = yellow-highlighted rows
// ── NC TABLE — exact values extracted from NC_80_db__dbA_values.pdf ──────────────
// Each row: { nc, left[8], dba[8], dbaTotal }
// nc       = NC level (integer, 15–80)
// left[8]  = LEFT table: per-band dB values [63,125,250,500,1000,2000,4000,8000 Hz] — Receiver Location
// dba[8]   = RIGHT table: per-band dB(A) yellow values [63,125,250,500,1000,2000,4000,8000 Hz] — Transmission Loss
// dbaTotal = RIGHT table: rightmost "dba" column — this is the GREEN number the user sees/enters
const NC_ROWS = [
  { nc:15, left:[47.0,36.0,29.0,22.0,17.0,14.0,12.0,11.0],   dba:[20.8,19.9,20.4,18.8,17.0,15.2,13.0,12.1],   dbaTotal:27.18 },
  { nc:16, left:[47.8,36.8,29.8,22.8,18.0,15.0,13.0,12.0],   dba:[21.6,20.7,21.2,19.6,18.0,16.2,14.0,13.1],   dbaTotal:28.03 },
  { nc:17, left:[49.08,38.08,31.08,24.08,19.6,16.6,14.6,13.6],dba:[22.88,21.98,22.48,20.88,19.6,17.8,15.6,14.7],dbaTotal:29.39 },
  { nc:18, left:[50.23,39.23,32.23,25.23,21.04,18.04,16.04,15.04],dba:[24.03,23.13,23.63,22.03,21.04,19.24,17.04,16.14],dbaTotal:30.61 },
  { nc:19, left:[50.85,39.85,32.85,25.85,21.81,18.81,16.81,15.81],dba:[24.65,23.75,24.25,22.65,21.81,20.01,17.81,16.91],dbaTotal:31.27 },
  { nc:20, left:[51.0,40.0,33.0,26.0,22.0,19.0,17.0,16.0],   dba:[24.8,23.9,24.4,22.8,22.0,20.2,18.0,17.1],   dbaTotal:31.43 },
  { nc:21, left:[51.6,40.8,33.8,27.0,23.0,20.0,18.0,17.0],   dba:[25.4,24.7,25.2,23.8,23.0,21.2,19.0,18.1],   dbaTotal:32.27 },
  { nc:22, left:[52.56,42.08,35.08,28.6,24.6,21.6,19.6,18.6],dba:[26.36,25.98,26.48,25.4,24.6,22.8,20.6,19.7], dbaTotal:33.63 },
  { nc:23, left:[53.42,43.23,36.23,30.04,26.04,23.04,21.04,20.04],dba:[27.22,27.13,27.63,26.84,26.04,24.24,22.04,21.14],dbaTotal:34.86 },
  { nc:24, left:[53.88,43.85,36.85,30.81,26.81,23.81,21.81,20.81],dba:[27.68,27.75,28.25,27.61,26.81,25.01,22.81,21.91],dbaTotal:35.53 },
  { nc:25, left:[54.0,44.0,37.0,31.0,27.0,24.0,22.0,21.0],   dba:[27.8,27.9,28.4,27.8,27.0,25.2,23.0,22.1],   dbaTotal:35.69 },
  { nc:26, left:[54.6,44.8,37.8,31.8,27.8,25.0,23.2,22.2],   dba:[28.4,28.7,29.2,28.6,27.8,26.2,24.2,23.3],   dbaTotal:36.52 },
  { nc:27, left:[55.56,46.08,39.08,33.08,29.08,26.6,25.12,24.12],dba:[29.36,29.98,30.48,29.88,29.08,27.8,26.12,25.22],dbaTotal:37.85 },
  { nc:28, left:[56.42,47.23,40.23,34.23,30.23,28.04,26.85,25.85],dba:[30.22,31.13,31.63,31.03,30.23,29.24,27.85,26.95],dbaTotal:39.07 },
  { nc:29, left:[56.88,47.85,40.85,34.85,30.85,28.81,27.77,26.77],dba:[30.68,31.75,32.25,31.65,30.85,30.01,28.77,27.87],dbaTotal:39.73 },
  { nc:30, left:[57.0,48.0,41.0,35.0,31.0,29.0,28.0,27.0],   dba:[30.8,31.9,32.4,31.8,31.0,30.2,29.0,28.1],   dbaTotal:39.89 },
  { nc:31, left:[57.6,48.8,41.8,36.0,32.0,30.0,29.0,28.0],   dba:[31.4,32.7,33.2,32.8,32.0,31.2,30.0,29.1],   dbaTotal:40.77 },
  { nc:32, left:[58.56,50.08,43.08,37.6,33.6,31.6,30.6,29.6],dba:[32.36,33.98,34.48,34.4,33.6,32.8,31.6,30.7], dbaTotal:42.20 },
  { nc:33, left:[59.42,51.23,44.23,39.04,35.04,33.04,32.04,31.04],dba:[33.22,35.13,35.63,35.84,35.04,34.24,33.04,32.14],dbaTotal:43.49 },
  { nc:34, left:[59.88,51.85,44.85,39.81,35.81,33.81,32.81,31.81],dba:[33.68,35.75,36.25,36.61,35.81,35.01,33.81,32.91],dbaTotal:44.19 },
  { nc:35, left:[60.0,52.0,45.0,40.0,36.0,34.0,33.0,32.0],   dba:[33.8,35.9,36.4,36.8,36.0,35.2,34.0,33.1],   dbaTotal:44.36 },
  { nc:36, left:[60.8,52.8,46.0,41.0,37.0,35.0,34.0,33.0],   dba:[34.6,36.7,37.4,37.8,37.0,36.2,35.0,34.1],   dbaTotal:45.31 },
  { nc:37, left:[62.08,54.08,47.6,42.6,38.6,36.6,35.6,34.6], dba:[35.88,37.98,39.0,39.4,38.6,37.8,36.6,35.7],  dbaTotal:46.85 },
  { nc:38, left:[63.23,55.23,49.04,44.04,40.04,38.04,37.04,36.04],dba:[37.03,39.13,40.44,40.84,40.04,39.24,38.04,37.14],dbaTotal:48.23 },
  { nc:39, left:[63.85,55.85,49.81,44.81,40.81,38.81,37.81,36.81],dba:[37.65,39.75,41.21,41.61,40.81,40.01,38.81,37.91],dbaTotal:48.96 },
  { nc:40, left:[64.0,56.0,50.0,45.0,41.0,39.0,38.0,37.0],   dba:[37.8,39.9,41.4,41.8,41.0,40.2,39.0,38.1],   dbaTotal:49.15 },
  { nc:41, left:[64.6,56.8,50.8,45.8,42.0,40.0,39.0,38.0],   dba:[38.4,40.7,42.2,42.6,42.0,41.2,40.0,39.1],   dbaTotal:50.03 },
  { nc:42, left:[65.56,58.08,52.08,47.08,43.6,41.6,40.6,39.6],dba:[39.36,41.98,43.48,43.88,43.6,42.8,41.6,40.7],dbaTotal:51.44 },
  { nc:43, left:[66.42,59.23,53.23,48.23,45.04,43.04,42.04,41.04],dba:[40.22,43.13,44.63,45.03,45.04,44.24,43.04,42.14],dbaTotal:52.72 },
  { nc:44, left:[66.88,59.85,53.85,48.85,45.81,43.81,42.81,41.81],dba:[40.68,43.75,45.25,45.65,45.81,45.01,43.81,42.91],dbaTotal:53.40 },
  { nc:45, left:[67.0,60.0,54.0,49.0,46.0,44.0,43.0,42.0],   dba:[40.8,43.9,45.4,45.8,46.0,45.2,44.0,43.1],   dbaTotal:53.57 },
  { nc:46, left:[67.8,60.8,54.8,50.0,47.0,45.0,44.0,43.0],   dba:[41.6,44.7,46.2,46.8,47.0,46.2,45.0,44.1],   dbaTotal:54.51 },
  { nc:47, left:[69.08,62.08,56.08,51.6,48.6,46.6,45.6,44.6],dba:[42.88,45.98,47.48,48.4,48.6,47.8,46.6,45.7], dbaTotal:56.02 },
  { nc:48, left:[70.23,63.23,57.23,53.04,50.04,48.04,47.04,46.04],dba:[44.03,47.13,48.63,49.84,50.04,49.24,48.04,47.14],dbaTotal:57.38 },
  { nc:49, left:[70.85,63.85,57.85,53.81,50.81,48.81,47.81,46.81],dba:[44.65,47.75,49.25,50.61,50.81,50.01,48.81,47.91],dbaTotal:58.10 },
  { nc:50, left:[71.0,64.0,58.0,54.0,51.0,49.0,48.0,47.0],   dba:[44.8,47.9,49.4,50.8,51.0,50.2,49.0,48.1],   dbaTotal:58.29 },
  { nc:51, left:[71.6,64.6,58.8,54.8,52.0,50.0,49.0,48.0],   dba:[45.4,48.5,50.2,51.6,52.0,51.2,50.0,49.1],   dbaTotal:59.17 },
  { nc:52, left:[72.56,65.56,60.08,56.08,53.6,51.6,50.6,49.6],dba:[46.36,49.46,51.48,52.88,53.6,52.8,51.6,50.7],dbaTotal:60.60 },
  { nc:53, left:[73.42,66.42,61.23,57.23,55.04,53.04,52.04,51.04],dba:[47.22,50.32,52.63,54.03,55.04,54.24,53.04,52.14],dbaTotal:61.89 },
  { nc:54, left:[73.88,66.88,61.85,57.85,55.81,53.81,52.81,51.81],dba:[47.68,50.78,53.25,54.65,55.81,55.01,53.81,52.91],dbaTotal:62.59 },
  { nc:55, left:[74.0,67.0,62.0,58.0,56.0,54.0,53.0,52.0],   dba:[47.8,50.9,53.4,54.8,56.0,55.2,54.0,53.1],   dbaTotal:62.76 },
  { nc:56, left:[74.6,67.8,63.0,59.0,57.0,55.0,54.0,53.0],   dba:[48.4,51.7,54.4,55.8,57.0,56.2,55.0,54.1],   dbaTotal:63.74 },
  { nc:57, left:[75.56,69.08,64.6,60.6,58.6,56.6,55.6,54.6], dba:[49.36,52.98,56.0,57.4,58.6,57.8,56.6,55.7],  dbaTotal:65.30 },
  { nc:58, left:[76.42,70.23,66.04,62.04,60.04,58.04,57.04,56.04],dba:[50.22,54.13,57.44,58.84,60.04,59.24,58.04,57.14],dbaTotal:66.71 },
  { nc:59, left:[76.88,70.85,66.81,62.81,60.81,58.81,57.81,56.81],dba:[50.68,54.75,58.21,59.61,60.81,60.01,58.81,57.91],dbaTotal:67.46 },
  { nc:60, left:[77.0,71.0,67.0,63.0,61.0,59.0,58.0,57.0],   dba:[50.8,54.9,58.4,59.8,61.0,60.2,59.0,58.1],   dbaTotal:67.65 },
  { nc:61, left:[77.6,71.8,67.8,64.0,62.0,60.0,59.0,58.0],   dba:[51.4,55.7,59.2,60.8,62.0,61.2,60.0,59.1],   dbaTotal:68.61 },
  { nc:62, left:[78.56,73.08,69.08,65.6,63.6,61.6,60.6,59.6],dba:[52.36,56.98,60.48,62.4,63.6,62.8,61.6,60.7], dbaTotal:70.15 },
  { nc:63, left:[79.42,74.23,70.23,67.04,65.04,63.04,62.04,61.04],dba:[53.22,58.13,61.63,63.84,65.04,64.24,63.04,62.14],dbaTotal:71.53 },
  { nc:64, left:[79.88,74.85,70.85,67.81,65.81,63.81,62.81,61.81],dba:[53.68,58.75,62.25,64.61,65.81,65.01,63.81,62.91],dbaTotal:72.27 },
  { nc:65, left:[80.0,75.0,71.0,68.0,66.0,64.0,63.0,62.0],   dba:[53.8,58.9,62.4,64.8,66.0,65.2,64.0,63.1],   dbaTotal:72.46 },
  { nc:66, left:[81.0,76.0,72.0,69.0,67.0,65.0,64.0,63.0],   dba:[54.8,59.9,63.4,65.8,67.0,66.2,65.0,64.1],   dbaTotal:73.46 },
  { nc:67, left:[81.0,77.0,73.0,70.0,68.0,66.0,65.0,64.0],   dba:[54.8,60.9,64.4,66.8,68.0,67.2,66.0,65.1],   dbaTotal:74.45 },
  { nc:68, left:[82.0,77.0,73.0,71.0,69.0,67.0,66.0,65.0],   dba:[55.8,60.9,64.4,67.8,69.0,68.2,67.0,66.1],   dbaTotal:75.32 },
  { nc:69, left:[82.0,78.0,74.0,72.0,70.0,68.0,67.0,66.0],   dba:[55.8,61.9,65.4,68.8,70.0,69.2,68.0,67.1],   dbaTotal:76.31 },
  { nc:70, left:[83.0,79.0,75.0,73.0,71.0,69.0,68.0,67.0],   dba:[56.8,62.9,66.4,69.8,71.0,70.2,69.0,68.1],   dbaTotal:77.31 },
  { nc:71, left:[84.0,80.0,76.0,74.0,72.0,70.0,69.0,68.0],   dba:[57.8,63.9,67.4,70.8,72.0,71.2,70.0,69.1],   dbaTotal:78.31 },
  { nc:72, left:[84.0,81.0,77.0,75.0,73.0,71.0,70.0,69.0],   dba:[57.8,64.9,68.4,71.8,73.0,72.2,71.0,70.1],   dbaTotal:79.30 },
  { nc:73, left:[85.0,81.0,77.0,76.0,74.0,72.0,71.0,70.0],   dba:[58.8,64.9,68.4,72.8,74.0,73.2,72.0,71.1],   dbaTotal:80.19 },
  { nc:74, left:[85.0,82.0,78.0,77.0,75.0,73.0,72.0,71.0],   dba:[58.8,65.9,69.4,73.8,75.0,74.2,73.0,72.1],   dbaTotal:81.19 },
  { nc:75, left:[86.0,83.0,79.0,78.0,76.0,74.0,73.0,72.0],   dba:[59.8,66.9,70.4,74.8,76.0,75.2,74.0,73.1],   dbaTotal:82.19 },
  { nc:76, left:[87.0,84.0,80.0,79.0,77.0,75.0,74.0,73.0],   dba:[60.8,67.9,71.4,75.8,77.0,76.2,75.0,74.1],   dbaTotal:83.19 },
  { nc:77, left:[87.0,85.0,81.0,80.0,78.0,76.0,75.0,74.0],   dba:[60.8,68.9,72.4,76.8,78.0,77.2,76.0,75.1],   dbaTotal:84.18 },
  { nc:78, left:[88.0,85.0,81.0,81.0,79.0,77.0,76.0,75.0],   dba:[61.8,68.9,72.4,77.8,79.0,78.2,77.0,76.1],   dbaTotal:85.10 },
  { nc:79, left:[88.0,86.0,82.0,82.0,80.0,78.0,77.0,76.0],   dba:[61.8,69.9,73.4,78.8,80.0,79.2,78.0,77.1],   dbaTotal:86.09 },
  { nc:80, left:[89.0,87.0,83.0,83.0,81.0,79.0,78.0,77.0],   dba:[62.8,70.9,74.4,79.8,81.0,80.2,79.0,78.1],   dbaTotal:87.09 },
];

// ── Lookup helpers ────────────────────────────────────────────────────────────
// Find nearest NC_ROW by STC value.
// The STC column in the PDF = floor(dbaTotal).  e.g. NC18 dbaTotal=30.61 → STC 30.
// So we find the row whose floor(dbaTotal) is nearest to the integer STC the user types.
// When tied, prefer the lower NC (earliest in array).
function findRowByDbaTotal(stcInput) {
  const v = Math.round(Number(stcInput) || 0);
  return NC_ROWS.reduce((best, row) => {
    const bDiff = Math.abs(Math.floor(best.dbaTotal) - v);
    const rDiff = Math.abs(Math.floor(row.dbaTotal) - v);
    return rDiff < bDiff ? row : best;
  });
}
// Find nearest NC_ROW by NC level (integer key) — for the left (NC) table
function findRowByNC(nc) {
  const v = Number(nc) || 15;
  return NC_ROWS.reduce((best, row) =>
    Math.abs(row.nc - v) < Math.abs(best.nc - v) ? row : best
  );
}

// Keep legacy names used elsewhere in this file
// NC_TABLE / NC_TABLE_DBA — still needed for getNCCriteria fallback; build from NC_ROWS
const NC_TABLE     = Object.fromEntries(NC_ROWS.map(r => [r.nc, r.left]));
const NC_TABLE_DBA = Object.fromEntries(NC_ROWS.map(r => [r.nc, r.dba]));

function stcToDbaPerBand(val) { return findRowByDbaTotal(val).dba; }
function stcToBandTL(val)     { return findRowByDbaTotal(val).dba.map(v => -v); }
function ncCurveBands(val)    { return findRowByDbaTotal(val).left; }
function getNCForSTC(val)     { return findRowByDbaTotal(val).nc;
}

// NC Criteria table (right side of PDF) — per-band SPL limit for each NC level
// Columns: [63, 125, 250, 500, 1000, 2000, 4000, 8000 Hz]
const NC_CRITERIA = {
  15:[47.42,20.80,17.00,15.20,14.00,12.10,12.10,27.18],
  16:[48.22,21.60,20.70,21.20,19.60,18.00,16.20,14.00],
  17:[49.50,22.88,21.98,22.48,20.88,19.00,17.80,15.60],
  18:[50.65,24.03,23.13,23.63,22.03,21.04,19.24,17.04],
  19:[51.26,24.65,23.85,24.29,22.65,21.81,20.01,17.81],
  20:[51.42,24.80,23.90,24.40,22.80,22.00,20.20,18.00],
  21:[52.04,25.40,24.70,25.20,23.80,23.00,21.20,18.10],
  22:[53.03,26.36,25.98,26.48,25.40,24.60,22.80,20.60],
  23:[53.93,27.22,27.13,27.63,26.84,26.04,24.24,22.04],
  24:[54.41,27.68,27.85,28.25,27.61,26.81,24.81,22.81],
  25:[54.53,27.80,27.90,28.40,27.80,27.00,25.20,23.00],
  26:[55.15,28.40,28.40,28.80,28.60,27.20,25.20,23.20],
  27:[56.15,29.36,29.98,30.48,29.36,29.08,27.80,26.12],
  28:[57.05,30.22,31.13,31.63,31.03,30.23,27.85,26.95],
  29:[57.54,30.68,31.75,32.25,31.65,30.85,30.01,28.77],
  30:[57.66,30.81,31.80,32.30,31.80,31.00,29.20,28.10],
  31:[58.29,31.40,32.70,33.20,32.80,32.00,31.20,30.00],
  32:[59.29,32.36,33.20,33.80,34.40,32.00,31.20,30.00],
  33:[60.22,33.22,35.13,35.63,35.84,35.04,34.24,33.04],
  34:[60.71,33.68,35.75,36.25,36.61,35.81,35.01,33.81],
  35:[60.83,33.80,35.90,36.40,36.80,36.00,35.20,33.10],
  36:[61.64,34.60,36.70,37.40,37.80,37.00,36.20,35.00],
  37:[62.93,35.88,37.98,39.00,39.40,38.60,37.80,36.60],
  38:[64.10,37.03,39.13,40.84,40.84,40.04,39.24,38.04],
  39:[64.72,37.68,41.21,41.63,40.81,40.81,40.81,38.81],
  40:[64.88,37.80,39.90,41.40,41.80,41.00,40.20,39.00],
  41:[65.52,38.40,40.60,42.60,42.60,42.00,41.20,39.00],
  42:[66.54,39.36,41.98,43.48,43.88,43.60,42.80,41.60],
  43:[67.47,40.22,43.13,44.63,45.03,45.04,44.24,43.04],
  44:[67.97,40.68,43.75,45.25,45.65,45.81,45.01,43.81],
  45:[67.97,40.80,43.90,45.40,45.80,46.00,45.01,43.81],
  46:[68.90,41.60,44.70,46.80,46.80,47.00,46.20,45.00],
  47:[70.19,42.88,47.48,47.48,49.84,48.60,47.48,45.70],
  48:[71.35,44.03,47.13,48.63,49.84,50.04,49.24,48.04],
  49:[71.97,44.65,47.90,50.61,50.61,50.81,50.01,48.84],
  50:[72.12,44.80,47.90,49.40,50.80,51.00,50.20,49.00],
  51:[72.74,45.40,49.46,51.48,52.88,53.60,52.80,51.60],
  52:[73.73,46.36,49.46,51.48,52.88,53.60,52.80,51.60],
  53:[74.63,47.22,50.32,52.63,54.03,55.04,54.24,53.04],
  54:[75.11,47.68,50.90,53.25,54.65,55.81,55.01,53.84],
  55:[75.23,47.80,50.90,53.40,54.80,56.00,55.20,54.00],
  56:[75.90,48.40,51.70,54.80,55.80,57.00,55.20,55.00],
  57:[76.98,49.36,52.98,56.40,57.40,57.80,57.60,56.60],
  58:[77.97,50.22,53.13,57.44,58.84,58.84,58.04,57.04],
  59:[78.49,50.68,54.13,57.81,59.61,60.81,59.01,58.81],
  60:[78.63,50.80,54.75,58.21,59.61,60.81,59.01,58.81],
  61:[79.31,51.40,55.70,59.20,60.80,62.00,61.20,60.00],
  62:[80.40,52.36,57.40,60.60,63.40,63.40,62.40,61.40],
  63:[81.39,53.22,58.13,61.63,63.84,65.04,64.24,63.04],
  64:[81.39,53.68,58.75,62.23,64.61,65.81,64.61,64.00],
  65:[82.06,53.80,58.90,62.40,64.80,66.00,65.20,64.00],
  66:[83.06,54.80,59.90,63.40,65.80,67.00,66.20,65.00],
  67:[83.46,54.80,60.90,64.40,66.80,68.00,66.20,66.10],
  68:[84.17,55.80,61.90,65.80,67.80,69.20,67.20,66.10],
  69:[84.59,55.80,61.90,65.40,68.80,70.00,69.20,68.00],
  70:[85.59,56.80,62.90,66.40,69.80,71.00,70.20,69.00],
  71:[86.59,57.80,63.90,67.40,70.80,72.00,71.20,70.00],
  72:[87.07,57.80,64.90,68.40,71.80,73.00,72.20,71.00],
  73:[87.75,57.80,64.90,68.40,72.80,74.00,72.20,71.00],
  74:[88.25,58.80,65.90,69.40,73.80,74.00,73.20,72.00],
  75:[89.25,59.80,66.90,70.40,74.80,76.00,74.20,73.00],
  76:[90.25,60.80,67.90,71.40,75.80,75.00,75.00,74.00],
  77:[90.80,60.80,68.90,72.40,76.80,78.00,75.00,74.00],
  78:[91.46,61.80,68.90,72.40,77.80,79.00,77.20,76.00],
  79:[92.04,61.80,68.90,74.40,79.80,80.00,77.20,76.00],
  80:[93.04,62.80,70.90,74.40,79.80,81.00,80.20,79.00],
};

function getNCCriteria(nc) {
  const levels = Object.keys(NC_CRITERIA).map(Number);
  const closest = levels.reduce((prev,curr) =>
    Math.abs(curr-nc) < Math.abs(prev-nc) ? curr : prev
  );
  return NC_CRITERIA[closest];
}

// Determine NC rating of an actual SPL per band: find highest NC curve not exceeded
function calcNCRating(lpBand) {
  const levels = Object.keys(NC_CRITERIA).map(Number).sort((a,b)=>a-b);
  for (const nc of levels) {
    const crit = NC_CRITERIA[nc];
    const exceeded = BAND_KEYS.some((k,i) => (lpBand[k]??0) > crit[i]);
    if (!exceeded) return nc;
  }
  return ">80";
}

// ── Full client-side Lp chain ─────────────────────────────────
// Returns { hz63, hz125, … hz8000 } — Total Lp at receiver
function calcLiveReceiverLp(form) {
  const isDuctPath = DUCT_PATHS.includes(form.noisePath);
  const swl = { ...form.generator.swl };

  // 2. Duct IL — only for exhaust/intake paths
  const ductIL = BAND_KEYS.map(() => 0);
  if (isDuctPath) {
    form.ducts.forEach(duct => {
      const isDuctLined = duct.lining === "lined";
      let il;
      if (isDuctLined) {
        const res = calcLinedIL(duct.width_mm, duct.height_mm, duct.length_m, duct.liningThickness_in, duct.coeffA);
        il = res ? BAND_KEYS.map((_,i) => res[i] ?? 0) : BAND_KEYS.map(()=>0);
      } else {
        il = BAND_KEYS.map(() => 0);
      }
      const elbowArr = calcElbowIL(duct.width_mm, duct.elbows, isDuctLined);
      const elbowIL = elbowArr || BAND_KEYS.map(() => 0);
      BAND_KEYS.forEach((_,i) => { ductIL[i] += (il[i]||0) + (elbowIL[i]||0); });
    });
  }

  // 3. ERL — only for duct paths
  const erlArr = isDuctPath
    ? (calcERL(form.erl.width_mm, form.erl.height_mm) || BAND_KEYS.map(()=>0))
    : BAND_KEYS.map(()=>0);

  // 4. Space Room (Schultz) OR Distance Effect — mutual exclusive
  const useSpaceRoom = form.roomOrDistance === "spaceRoom";
  const schultz = useSpaceRoom
    ? (liveSchultzOffsets(form.room.length_m, form.room.width_m, form.room.height_m, form.room.distance_m) || BAND_KEYS.map(()=>0))
    : BAND_KEYS.map(()=>0);
  const deObj = !useSpaceRoom
    ? calcDistanceEffect(form.distanceEffect.distance_m, form.distanceEffect.directivity)
    : null;
  const deArr = deObj ? BAND_KEYS.map(k => deObj[k]||0) : BAND_KEYS.map(()=>0);

  // 5. Attenuator IL
  const attArr = BAND_KEYS.map(k => Number(form.attenuator.il?.[k])||0);

  // 6. Through-path TL (wall/door/ceiling)
  //    STC/dbaTotal (green column, right table) → look up by dbaTotal → apply dB(A) values as negative attenuation
  function stcToTL(stcInput, fallback) {
    const val = Number(stcInput) || fallback;
    const row = findRowByDbaTotal(val);
    return row.dba.map(v => -v);
  }
  let throughTL = BAND_KEYS.map(()=>0);
  if (form.noisePath === "through_wall") {
    throughTL = stcToTL(form.throughPath?.wall_stc, 45);
  } else if (form.noisePath === "through_door") {
    throughTL = stcToTL(form.throughPath?.door_stc, 35);
  } else if (form.noisePath === "through_ceiling_above" || form.noisePath === "through_ceiling_below") {
    // Ceiling: user enters manual per-band TL values (negative = attenuation)
    const cb = form.throughPath?.ceiling_bands || {};
    throughTL = BAND_KEYS.map(k => -(Number(cb[k]) || 0));
  }

  // 7. Combine
  const lp = {};
  BAND_KEYS.forEach((k,i) => {
    const swlV = Number(swl[k])||0;
    lp[k] = round1(
      swlV
      + (ductIL[i]||0)
      + (erlArr[i]||0)
      + (schultz[i]||0)
      + (deArr[i]||0)
      - (attArr[i]||0)
      + (throughTL[i]||0)
    );
  });
  return lp;
}

// Through Ceiling (Above/Below) — Ground Floor Slab values
const CEILING_TL = [-36, -37, -41, -45, -49, -53, -57, -61];
// Through False Ceiling — Gypsum ceiling values
const FALSE_CEILING_TL = [-18, -21, -25, -25, -27, -27, -28, -28];

// ── Construction type: free-text label + STC input (no preset dropdown) ──────
// User types the construction description; STC drives live per-band TL from NC_TABLE
// wall_label / door_label / ceiling_label are stored to backend as descriptive text

// ── End Reflection Loss ───────────────────────────────────────
// ERL = 10·log₁₀[ 1 + (a1·co / π·f·D)^a2 ] × −1
// a1=0.7, a2=2, co=1125.33 ft/s, D=√(4·Area/π) in ft
const ERL_A1 = 0.7;
const ERL_A2 = 2;
const ERL_CO = 1125.33; // ft/s

function calcERL(width_mm, height_mm) {
  const W = mmToFt(width_mm||0);
  const H = mmToFt(height_mm||0);
  if (W <= 0 || H <= 0) return null;
  const area = W * H;
  const D = Math.sqrt(4 * area / Math.PI); // D = √(4·Area/π) in ft
  return BANDS.map(f => {
    const inner = (ERL_A1 * ERL_CO) / (Math.PI * f * D);
    const erl = 10 * Math.log10(1 + Math.pow(inner, ERL_A2)) * -1; // multiply by -1
    return Math.round(erl * 100) / 100;
  });
}

// ── Distance Effect ───────────────────────────────────────────
// IL = 10 · log(Q / 4πr²)
function calcDistanceEffect(distance_m, directivity) {
  const r = Number(distance_m) || 1;
  const Q = Number(directivity) || 1;
  if (r <= 0) return null;
  const il = 10 * Math.log10(Q / (4 * Math.PI * r * r));
  const val = Math.round(il * 100) / 100;
  return Object.fromEntries(BAND_KEYS.map(k => [k, val]));
}

const defaultDuct = (idx = 0) => ({
  label:            `Duct ${idx + 1}`,
  width_mm:         0,
  height_mm:        0,
  length_m:         0,
  lining:           "unlined",
  liningThickness_in: 1,
  elbows:           0,
  terminationType:  "wall",
  coeffA:           { ...EMPTY_BAND },
  _showCoeff:       false,
});

const NOISE_PATHS = [
  { value:"exhaust",          label:"Exhaust Air" },
  { value:"intake",           label:"Intake Air" },
  { value:"through_wall",     label:"Through Wall" },
  { value:"through_door",     label:"Through Door" },
  { value:"through_ceiling_above", label:"Through Ceiling Above" },
  { value:"through_ceiling_below", label:"Through Ceiling Below" },
];

// Paths that use duct / ERL routing
const DUCT_PATHS = ["exhaust","intake"];

const DEFAULT = {
  noisePath:       "exhaust",
  roomOrDistance:  "spaceRoom",  // "spaceRoom" | "distanceEffect"
  generator: {
    noiseInputType: "swl_db", measurementDistance_m: 1,
    equipmentId:"", modelNumber:"", ratedKva:0, buildingRef:"", swl_dba:0,
    rawBand: { ...EMPTY_BAND },
    swl:     { ...EMPTY_BAND },
  },
  room:       { length_m:0, width_m:0, height_m:0, distance_m:3 },
  ducts:      [defaultDuct(0)],
  erl:        { width_mm:0, height_mm:0 },
  attenuator:     { model:"", width_mm:0, height_mm:0, length_mm:0, pressureDrop_pa:0, il:{ ...EMPTY_BAND } },
  receiver:       { description:"", distance_m:3, directivity:2, requiredNC:65, requiredNR:65, required_dba:65, ncNrChoice:"NC" },
  distanceEffect: { distance_m:3, directivity:1 },
  // Through-wall / door / ceiling path TL inputs (stored to backend)
  throughPath: {
    wall_label:    "",   // free-text: e.g. "230mm Brick Wall"
    wall_stc:      45,   // STC (green column, right table) → Transmission Loss bands
    door_label:    "",   // free-text: e.g. "Solid Core Timber Door"
    door_stc:      35,
    ceiling_label: "",   // free-text: e.g. "150mm Concrete Slab"
    ceiling_stc:   45,   // STC rating (stored to backend / report)
    ceiling_bands: { ...EMPTY_BAND },  // manual per-band TL dB — user types each value
  },
};

/* ─── Live Schultz preview ──────────────────────────────────── */
function liveSchultzOffsets(length_m, width_m, height_m, distance_m) {
  const V = Number(length_m) * Number(width_m) * Number(height_m);
  const r = Number(distance_m) || 3;
  if (V <= 0) return null;
  return BANDS.map(f =>
    -10 * Math.log10(r) - 5 * Math.log10(V) - 3 * Math.log10(f) + 12
  );
}

/* ─── BAND INPUT — fully uncontrolled, commits on blur ─────── */
function BandInput({ bandKey, value, onCommit, onLiveCommit }) {
  const [local, setLocal] = useState(String(value ?? 0));
  const [focus, setFocus] = useState(false);
  const prevVal = useRef(value);

  if (!focus && prevVal.current !== value) {
    prevVal.current = value;
    setLocal(String(value ?? 0));
  }

  return (
    <input
      type="number"
      value={local}
      step="0.1"
      onChange={e => {
        setLocal(e.target.value);
        if (onLiveCommit) {
          const f = parseFloat(e.target.value);
          if (!isNaN(f)) onLiveCommit(f);
        }
      }}
      onFocus={e => { setFocus(true); setLocal(String(value??0)); setTimeout(()=>e.target.select(),0); }}
      onBlur={() => {
        setFocus(false);
        const f = isNaN(parseFloat(local)) ? 0 : parseFloat(local);
        setLocal(String(f)); prevVal.current = f; onCommit(f);
      }}
      onKeyDown={e => e.key==="Enter" && e.target.blur()}
      style={{
        width:"100%", padding:"8px 4px",
        border:`1.5px solid ${focus?"#0E9F8E":"#E2E8F0"}`,
        borderRadius:7, fontSize:13, fontWeight:600, color:"#0F172A",
        background:"#fff", outline:"none", fontFamily:"Inter,sans-serif",
        textAlign:"center",
        boxShadow:focus?"0 0 0 3px rgba(14,159,142,.12)":"none",
        transition:"border-color .15s, box-shadow .15s",
        MozAppearance:"textfield",
      }}
    />
  );
}

function BandGrid({ label, values, onChange, onLiveChange, note, readOnly, highlightColor }) {
  const handleCommit = useCallback((k,v) => onChange({ ...values, [k]:v }), [values, onChange]);
  const handleLive   = useCallback((k,v) => onLiveChange && onLiveChange({ ...values, [k]:v }), [values, onLiveChange]);
  return (
    <div>
      {label && (
        <p style={{ fontSize:12.5, fontWeight:700, color:"#334155",
          fontFamily:"Plus Jakarta Sans,sans-serif", margin:"0 0 10px" }}>
          {label}
        </p>
      )}
      {note && (
        <p style={{ fontSize:11.5, color:"#64748B", fontFamily:"Inter,sans-serif", margin:"0 0 10px" }}>
          {note}
        </p>
      )}
      <div style={{ overflowX:"auto", paddingBottom:4, WebkitOverflowScrolling:"touch" }}>
        <table style={{ borderCollapse:"collapse", minWidth:480 }}>
          <thead>
            <tr>
              {BANDS.map((b,i) => (
                <th key={b} style={{
                  padding:"4px 4px 6px", textAlign:"center", fontSize:11, fontWeight:700,
                  color: highlightColor || "#0E9F8E",
                  fontFamily:"Inter,sans-serif",
                  background: highlightColor ? `${highlightColor}18` : "#E3F8F5",
                  borderRadius:6, minWidth:60, width:70,
                }}>
                  {b} Hz
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {BAND_KEYS.map(k => (
                <td key={k} style={{ padding:"4px 3px" }}>
                  {readOnly ? (
                    <div style={{
                      width:"100%", padding:"8px 4px",
                      border:"1.5px solid #E2E8F0", borderRadius:7,
                      fontSize:13, fontWeight:700,
                      color: highlightColor || "#0F172A",
                      background: highlightColor ? `${highlightColor}08` : "#F8FAFC",
                      textAlign:"center", fontFamily:"Inter,sans-serif",
                    }}>
                      {typeof values[k] === "number" ? values[k].toFixed(1) : (values[k] ?? "—")}
                    </div>
                  ) : (
                    <BandInput
                      bandKey={k} value={values[k]??0}
                      onCommit={v=>handleCommit(k,v)}
                      onLiveCommit={onLiveChange ? v=>handleLive(k,v) : undefined}
                    />
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── STANDARD INPUTS ───────────────────────────────────────── */
function NumInput({ label, value, onChange, onLiveChange, unit, step=0.1, min }) {
  const [local, setLocal] = useState(String(value ?? 0));
  const [focus, setFocus] = useState(false);
  const prevVal = useRef(value);
  if (!focus && prevVal.current !== value) { prevVal.current = value; setLocal(String(value??0)); }
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
      {label && <label style={{ fontSize:11.5, fontWeight:600, color:"#475569", fontFamily:"Inter,sans-serif" }}>{label}</label>}
      <div style={{ position:"relative" }}>
        <input
          type="number" value={local} min={min} step={step}
          onFocus={e => { setFocus(true); setLocal(String(value??0)); setTimeout(()=>e.target.select(),0); }}
          onChange={e => {
            setLocal(e.target.value);
            if (onLiveChange) {
              const f = parseFloat(e.target.value);
              if (!isNaN(f)) onLiveChange(f);
            }
          }}
          onBlur={e => {
            setFocus(false);
            const f = isNaN(parseFloat(e.target.value)) ? 0 : parseFloat(e.target.value);
            setLocal(String(f)); prevVal.current = f; onChange(f);
          }}
          onKeyDown={e => e.key==="Enter" && e.target.blur()}
          style={{
            width:"100%", padding:unit?"9px 36px 9px 10px":"9px 10px",
            border:`1.5px solid ${focus?"#0E9F8E":"#E2E8F0"}`,
            borderRadius:7, fontSize:13.5, background:"#fff", color:"#0F172A",
            outline:"none", fontFamily:"Inter,sans-serif",
            boxShadow:focus?"0 0 0 3px rgba(14,159,142,.1)":"none",
            transition:"border-color .15s, box-shadow .15s",
            MozAppearance:"textfield",
          }}
        />
        {unit && <span style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", fontSize:10.5, color:"#94A3B8", fontFamily:"Inter,sans-serif", pointerEvents:"none" }}>{unit}</span>}
      </div>
    </div>
  );
}

function TextInput({ label, value, onChange, placeholder }) {
  const [f,setF] = useState(false);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
      {label && <label style={{ fontSize:11.5, fontWeight:600, color:"#475569", fontFamily:"Inter,sans-serif" }}>{label}</label>}
      <input type="text" value={value} placeholder={placeholder||""}
        onChange={e=>onChange(e.target.value)}
        onFocus={()=>setF(true)} onBlur={()=>setF(false)}
        style={{
          padding:"9px 10px", border:`1.5px solid ${f?"#0E9F8E":"#E2E8F0"}`,
          borderRadius:7, fontSize:13.5, background:"#fff", color:"#0F172A",
          outline:"none", fontFamily:"Inter,sans-serif",
          transition:"border-color .15s", boxShadow:f?"0 0 0 3px rgba(14,159,142,.1)":"none",
        }}
      />
    </div>
  );
}

function SelectInput({ label, value, onChange, options }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
      {label && <label style={{ fontSize:11.5, fontWeight:600, color:"#475569", fontFamily:"Inter,sans-serif" }}>{label}</label>}
      <select value={value} onChange={e=>onChange(e.target.value)}
        style={{ padding:"9px 10px", border:"1.5px solid #E2E8F0", borderRadius:7, fontSize:13.5, background:"#fff", color:"#0F172A", outline:"none", fontFamily:"Inter,sans-serif", cursor:"pointer" }}>
        {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Section({ icon:Icon, title, color="#0E9F8E", badge, children, defaultOpen=true }) {
  const [open,setOpen] = useState(defaultOpen);
  return (
    <div style={{ background:"#fff", borderRadius:14, border:"1px solid #E2E8F0", overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,.05)" }}>
      <button onClick={()=>setOpen(!open)} type="button" style={{
        width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"13px 16px", background:`${color}0D`, border:"none",
        borderBottom:open?"1px solid #E2E8F0":"none", cursor:"pointer",
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:30, height:30, borderRadius:8, background:`${color}22`, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <Icon size={15} color={color} />
          </div>
          <span style={{ fontFamily:"Plus Jakarta Sans,sans-serif", fontWeight:700, fontSize:13.5, color:"#0F172A" }}>{title}</span>
          {badge && (
            <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:99, background:`${color}22`, color:color, fontFamily:"Inter,sans-serif" }}>
              {badge}
            </span>
          )}
        </div>
        {open ? <ChevronUp size={15} color="#94A3B8" /> : <ChevronDown size={15} color="#94A3B8" />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height:0,opacity:0 }} animate={{ height:"auto",opacity:1 }}
            exit={{ height:0,opacity:0 }} transition={{ duration:.2 }} style={{ overflow:"hidden" }}>
            <div style={{ padding:"16px 16px 18px" }}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
export default function AcousticInputForm({ projectId, existing, onSaved, onResults }) {
  const [form, setForm] = useState(() => {
    if (existing) {
      const ducts = Array.isArray(existing.ducts) && existing.ducts.length
        ? existing.ducts.map((d,i) => ({ ...defaultDuct(i), ...d, _showCoeff:false, _showElbow:false }))
        : [defaultDuct(0)];
      const g = existing.generator || {};
      const rawBand = g.rawBand ?? g.swl ?? { ...EMPTY_BAND };
      const noiseInputType = g.noiseInputType ?? "swl_db";
      const measurementDistance_m = g.measurementDistance_m ?? 1;
      return {
        ...DEFAULT,
        noisePath: existing.noisePath ?? "exhaust",
        generator: {
          ...DEFAULT.generator, ...g,
          rawBand,
          swl: computeSWLFromRaw(noiseInputType, rawBand, measurementDistance_m),
        },
        room:       { ...DEFAULT.room, distance_m:3, ...existing.room },
        ducts,
        erl:        { ...DEFAULT.erl, ...existing.erl },
        attenuator:     { ...DEFAULT.attenuator,     ...existing.attenuator     },
        receiver:       { ...DEFAULT.receiver,       ...existing.receiver       },
        distanceEffect: { ...DEFAULT.distanceEffect, ...existing.distanceEffect },
        roomOrDistance: existing.roomOrDistance ?? "spaceRoom",
        throughPath: { ...DEFAULT.throughPath, ...(existing.throughPath||{}) },
      };
    }
    return { ...DEFAULT };
  });

  const [saving,  setSaving]  = useState(false);
  const [running, setRunning] = useState(false);

  // Live receiver Lp — recomputes on every form change, no backend needed
  const liveLp = useMemo(() => calcLiveReceiverLp(form), [form]);

  // Setters
  const setG = (k,v) => setForm(f => {
    const g = {...f.generator, [k]:v};
    // recompute swl whenever input type, rawBand, or distance changes
    g.swl = computeSWLFromRaw(g.noiseInputType, g.rawBand, g.measurementDistance_m);
    return {...f, generator:g};
  });
  const setGW = useCallback(v => setForm(f => {
    const g = {...f.generator, rawBand:v};
    g.swl = computeSWLFromRaw(g.noiseInputType, v, g.measurementDistance_m);
    return {...f, generator:g};
  }), []);
  const setRm  = (k,v) => setForm(f=>({...f, room:{...f.room,[k]:v}}));
  const setErl = (k,v) => setForm(f=>({...f, erl:{...f.erl,[k]:v}}));
  const setA   = (k,v) => setForm(f=>({...f, attenuator:{...f.attenuator,[k]:v}}));
  const setDE  = (k,v) => setForm(f=>({...f, distanceEffect:{...f.distanceEffect,[k]:v}}));
  const setAW = useCallback(v=>setForm(f=>({...f, attenuator:{...f.attenuator, il:v}})),[]);
  const setRc = (k,v) => setForm(f=>({...f, receiver:{...f.receiver,[k]:v}}));
  const setTP = (k,v) => setForm(f=>({...f, throughPath:{...f.throughPath,[k]:v}}));

  // Duct helpers
  const addDuct = () => setForm(f => ({ ...f, ducts:[...f.ducts, defaultDuct(f.ducts.length)] }));
  const removeDuct = (i) => setForm(f => ({ ...f, ducts:f.ducts.filter((_,idx)=>idx!==i) }));
  const patchDuct = (i,patch) => setForm(f => {
    const d=[...f.ducts]; d[i]={...d[i],...patch}; return {...f,ducts:d};
  });
  const patchDuctCoeffA = (i,band) => setForm(f => {
    const d=[...f.ducts]; d[i]={...d[i],coeffA:{...d[i].coeffA,...band}}; return {...f,ducts:d};
  });

  const needsDistance = DISTANCE_MODES.includes(form.generator.noiseInputType);

  // Live Schultz preview
  const schultzOffsets = useMemo(() =>
    liveSchultzOffsets(form.room.length_m, form.room.width_m, form.room.height_m, form.room.distance_m),
    [form.room.length_m, form.room.width_m, form.room.height_m, form.room.distance_m]
  );
  const volume = (form.room.length_m||0)*(form.room.width_m||0)*(form.room.height_m||0);

  // Convert offsets array → band object for display
  const schultzBandObj = useMemo(() => {
    if (!schultzOffsets) return null;
    return Object.fromEntries(BAND_KEYS.map((k,i)=>[k, schultzOffsets[i]]));
  }, [schultzOffsets]);

  // Strip internal UI keys before sending to backend
  const buildPayload = () => ({
    ...form,
    ducts: form.ducts.map(({_showCoeff,_showElbow,...d})=>d),
  });

  const handleRun = async () => {
    setRunning(true);
    try {
      const { data } = await runCalculationApi(projectId, buildPayload());
      onResults(data.results, form.receiver);
      toast.success("Calculation complete");
    } catch(err) {
      toast.error(err.response?.data?.message || "Calculation failed");
    } finally { setRunning(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = buildPayload();
      let calc;
      if (existing?._id) {
        const { data } = await updateCalculationApi(projectId, existing._id, payload);
        calc = data.calculation;
      } else {
        const { data } = await createCalculationApi(projectId, payload);
        calc = data.calculation;
      }
      onResults(calc.results, form.receiver);
      onSaved(calc);
      toast.success(existing?._id ? "Updated & calculated" : "Saved & calculated");
    } catch(err) {
      toast.error(err.response?.data?.message || "Save failed");
    } finally { setSaving(false); }
  };

  const g2 = { display:"grid", gridTemplateColumns:"1fr 1fr",         gap:12 };
  const g3 = { display:"grid", gridTemplateColumns:"1fr 1fr 1fr",     gap:12 };
  const g4 = { display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:12 };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

      {/* Suppress spinners */}
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { display:none; -webkit-appearance:none; }
        input[type=number] { -moz-appearance:textfield; }
      `}</style>

      {/* ── Noise Path ── */}
      <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E2E8F0", padding:"13px 16px" }}>
        <p style={{ fontSize:11, fontWeight:700, color:"#475569", textTransform:"uppercase", letterSpacing:".05em", fontFamily:"Inter,sans-serif", margin:"0 0 10px" }}>Noise Path</p>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {NOISE_PATHS.map(p=>(
            <button key={p.value} type="button" onClick={()=>setForm(f=>({...f,noisePath:p.value}))}
              style={{
                padding:"7px 16px", borderRadius:8,
                border:`1.5px solid ${form.noisePath===p.value?"#0E9F8E":"#E2E8F0"}`,
                background:form.noisePath===p.value?"#E3F8F5":"#fff",
                color:form.noisePath===p.value?"#0E9F8E":"#64748B",
                fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"Inter,sans-serif", transition:"all .15s",
              }}>{p.label}</button>
          ))}
        </div>
      </div>

      {/* ── 1. Generator ── */}
      <Section icon={Zap} title="Generator Data" color="#0E9F8E">
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div style={g2}>
            <TextInput label="Equipment ID" value={form.generator.equipmentId} onChange={v=>setG("equipmentId",v)} placeholder="e.g. 1100KVA STANDBY GEN"/>
            <TextInput label="Model Number" value={form.generator.modelNumber}  onChange={v=>setG("modelNumber",v)}  placeholder="e.g. 12M26D968E200"/>
          </div>
          <div style={g3}>
            <NumInput  label="Rated kVA"    value={form.generator.ratedKva}    onChange={v=>setG("ratedKva",v)}    unit="kVA" step={1}/>
            <NumInput  label="Overall SWL"  value={form.generator.swl_dba}     onChange={v=>setG("swl_dba",v)}     unit="dB(A)" step={0.1}/>
            <TextInput label="Building Ref" value={form.generator.buildingRef} onChange={v=>setG("buildingRef",v)} placeholder="e.g. Ground Floor"/>
          </div>

          {/* Noise Data Type — simple segmented buttons (same as existing form) */}
          <div>
            <p style={{ fontSize:12, fontWeight:700, color:"#334155", fontFamily:"Plus Jakarta Sans,sans-serif", margin:"0 0 8px" }}>Noise Data Type</p>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {NOISE_INPUT_TYPES.map(t => (
                <button key={t.value} type="button" onClick={()=>setG("noiseInputType",t.value)}
                  style={{
                    padding:"7px 14px", borderRadius:8,
                    border:`1.5px solid ${form.generator.noiseInputType===t.value?"#0E9F8E":"#E2E8F0"}`,
                    background:form.generator.noiseInputType===t.value?"#E3F8F5":"#fff",
                    color:form.generator.noiseInputType===t.value?"#0E9F8E":"#64748B",
                    fontSize:13, fontWeight:600, cursor:"pointer",
                    fontFamily:"Inter,sans-serif", transition:"all .15s",
                  }}>{t.label}</button>
              ))}
            </div>
          </div>

          {/* Measurement distance — only for SPL modes */}
          {needsDistance && (
            <div style={{ maxWidth:220 }}>
              <NumInput label="Measurement Distance (r)" value={form.generator.measurementDistance_m}
                onChange={v=>setG("measurementDistance_m",v)} unit="m" step={0.1} min={0.1}/>
            </div>
          )}

          {/* Octave Band Input */}
          <div style={{ background:"#F8FAFC", borderRadius:10, padding:"14px 16px", border:"1px solid #E2E8F0" }}>
            <BandGrid
              label={{
                swl_dba:"SWL per Band — dB(A)",
                spl_db: "SPL per Band — dB @ measurement distance r",
                spl_dba:"SPL per Band — dB(A) @ measurement distance r",
                swl_db: "SWL per Band — dB re 1pW",
              }[form.generator.noiseInputType]}
              values={form.generator.rawBand}
              onChange={setGW}
            />
            {/* Conversion preview table — shows step-by-step conversion for non-SWL-dB types */}
            <ConversionPreviewTable
              noiseInputType={form.generator.noiseInputType}
              rawBand={form.generator.rawBand}
              distance_m={form.generator.measurementDistance_m}
              resultBand={form.generator.swl}
            />
          </div>
        </div>
      </Section>

      {/* ── Transmission Loss — Through Wall / Door / Ceiling ── */}
      {(form.noisePath === "through_wall" || form.noisePath === "through_door" ||
        form.noisePath === "through_ceiling_above" || form.noisePath === "through_ceiling_below") && (() => {

        const isWall    = form.noisePath === "through_wall";
        const isDoor    = form.noisePath === "through_door";
        const ceilLabel = form.noisePath === "through_ceiling_above" ? "Ceiling Above" : "Ceiling Below";
        const sectionLabel = isWall ? "Through Wall" : isDoor ? "Through Door" : `Through ${ceilLabel}`;

        // Color / accent per path
        const color     = isWall ? "#3B82F6" : isDoor ? "#8B5CF6" : "#0E9F8E";
        const bgLight   = isWall ? "#EFF6FF"  : isDoor ? "#F5F3FF"  : "#ECFDF5";
        const border    = isWall ? "#BFDBFE"  : isDoor ? "#DDD6FE"  : "#A7F3D0";
        const textColor = isWall ? "#1D4ED8"  : isDoor ? "#6D28D9"  : "#065F46";
        const chipBg    = isWall ? "#DBEAFE"  : isDoor ? "#EDE9FE"  : "#D1FAE5";

        // Keys for this path
        const labelKey  = isWall ? "wall_label"    : isDoor ? "door_label"    : "ceiling_label";
        const stcKey    = isWall ? "wall_stc"       : isDoor ? "door_stc"       : null;
        const typeLabel = isWall ? "Wall Type"      : isDoor ? "Door Type"      : "Ceiling Type";

        // Wall/Door: STC value (right table, green dbaTotal column) → Transmission Loss bands
        const stcVal   = stcKey ? (Number(form.throughPath?.[stcKey]) || (isWall ? 45 : 35)) : null;
        const stcRow   = stcVal != null ? findRowByDbaTotal(stcVal) : null;
        const stcNC    = stcRow ? stcRow.nc : null;
        const dbaArr   = stcRow ? stcRow.dba : null;

        // Ceiling: manual per-band TL values
        const ceilingBands = form.throughPath?.ceiling_bands || { ...EMPTY_BAND };

        return (
          <Section icon={Layers} title={`Transmission Loss — ${sectionLabel}`} color={color}>
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

              {/* Construction type — free text input, stored to backend */}
              <div>
                <p style={{ fontSize:12, fontWeight:700, color:"#334155", fontFamily:"Plus Jakarta Sans,sans-serif", margin:"0 0 6px" }}>
                  {typeLabel}
                </p>
                <input
                  type="text"
                  placeholder={isWall ? "e.g. 230mm Brick Wall" : isDoor ? "e.g. Solid Core Timber Door" : "e.g. 150mm Concrete Slab"}
                  value={form.throughPath?.[labelKey] ?? ""}
                  onChange={e => setTP(labelKey, e.target.value)}
                  style={{
                    width:"100%", maxWidth:380, padding:"9px 13px", borderRadius:9, fontSize:13.5,
                    fontFamily:"Inter,sans-serif", border:"1.5px solid #E2E8F0", outline:"none",
                    background:"#F8FAFC", color:"#1E293B", boxSizing:"border-box",
                    transition:"border .15s",
                  }}
                  onFocus={e=>{ e.target.style.borderColor=color; e.target.style.background="#fff"; }}
                  onBlur={e=>{ e.target.style.borderColor="#E2E8F0"; e.target.style.background="#F8FAFC"; }}
                />
                <p style={{ fontSize:11, color:"#94A3B8", margin:"5px 0 0", fontFamily:"Inter,sans-serif" }}>
                  Describe the construction — saved to report.
                </p>
              </div>

              {/* Wall / Door: STC input + auto band lookup */}
              {!isDoor && !isWall ? null : (
                <>
                  <div style={{ display:"flex", alignItems:"flex-end", gap:12, flexWrap:"wrap" }}>
                    <div style={{ maxWidth:220 }}>
                      <NumInput
                        label="STC / dB(A) Total"
                        value={stcVal}
                        onChange={v=>setTP(stcKey,v)}
                        onLiveChange={v=>setTP(stcKey,v)}
                        unit="" step={1}
                      />
                    </div>
                    <span style={{ fontSize:12, fontWeight:700, padding:"5px 13px", borderRadius:99,
                      background:"#FEF9C3", color:"#92400E", fontFamily:"Inter,sans-serif",
                      marginBottom:2, border:"1px solid #FDE68A" }}>
                      → NC {stcNC}
                    </span>
                  </div>
                  <p style={{ fontSize:11, color:"#94A3B8", margin:"-8px 0 0", fontFamily:"Inter,sans-serif" }}>
                    Enter the dB(A) total (green column, right table) — band values are looked up automatically.
                  </p>

                  {/* Per-band dB(A) yellow values — Transmission Loss */}
                  <div style={{ background:bgLight, borderRadius:10, padding:"14px 16px", border:`1px solid ${border}` }}>
                    <p style={{ fontSize:11, fontWeight:700, color:textColor, margin:"0 0 12px",
                      fontFamily:"Inter,sans-serif", textTransform:"uppercase", letterSpacing:".04em" }}>
                      dB(A) Transmission Loss — NC {stcNC}
                    </p>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(8,1fr)", gap:5 }}>
                      {BANDS.map((b,i) => (
                        <div key={b} style={{ textAlign:"center" }}>
                          <div style={{ fontSize:10, fontWeight:700, color:"#64748B",
                            fontFamily:"Inter,sans-serif", marginBottom:4 }}>{b} Hz</div>
                          <div style={{ background:"#FEF9C3", color:"#92400E", borderRadius:6, padding:"7px 2px",
                            fontSize:13, fontWeight:700, fontFamily:"Inter,sans-serif", border:"1px solid #FDE68A" }}>
                            {dbaArr ? dbaArr[i] : "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Ceiling: STC input + manual per-band TL input */}
              {(form.noisePath === "through_ceiling_above" || form.noisePath === "through_ceiling_below") && (
                <>
                  {/* STC input */}
                  <div style={{ display:"flex", alignItems:"flex-end", gap:12, flexWrap:"wrap" }}>
                    <div style={{ maxWidth:220 }}>
                      <NumInput
                        label="STC Rating"
                        value={Number(form.throughPath?.ceiling_stc) || 45}
                        onChange={v=>setTP("ceiling_stc",v)}
                        onLiveChange={v=>setTP("ceiling_stc",v)}
                        unit="" step={1}
                      />
                    </div>
                  </div>

                  {/* Manual per-band TL */}
                  <div style={{ background:bgLight, borderRadius:10, padding:"14px 16px", border:`1px solid ${border}` }}>
                    <p style={{ fontSize:11, fontWeight:700, color:textColor, margin:"0 0 4px",
                      fontFamily:"Inter,sans-serif", textTransform:"uppercase", letterSpacing:".04em" }}>
                      Transmission Loss — Enter dB per band
                    </p>
                    <p style={{ fontSize:11, color:"#94A3B8", margin:"0 0 12px", fontFamily:"Inter,sans-serif" }}>
                      Type the TL value for each octave band manually.
                    </p>
                    <BandGrid
                      values={ceilingBands}
                      onChange={v => setForm(f => ({ ...f, throughPath:{ ...f.throughPath, ceiling_bands:v } }))}
                      onLiveChange={v => setForm(f => ({ ...f, throughPath:{ ...f.throughPath, ceiling_bands:v } }))}
                      highlightColor={color}
                    />
                  </div>
                </>
              )}

            </div>
          </Section>
        );
      })()}


      {/* ── 2. Duct(s) — only for exhaust/intake paths ── */}
      {DUCT_PATHS.includes(form.noisePath) && <Section icon={Wind} title={`Duct(s) / Opening`} color="#8B5CF6"
        badge={`${form.ducts.length} duct${form.ducts.length!==1?"s":""}`}>
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

          {form.ducts.map((duct, idx) => {
            const lined   = duct.lining === "lined";
            const ductIL  = lined
              ? calcLinedIL(duct.width_mm, duct.height_mm, duct.length_m, duct.liningThickness_in, duct.coeffA)
              : calcUnlinedIL(duct.width_mm, duct.height_mm, duct.length_m);
            const elbowIL = calcElbowIL(duct.width_mm, duct.elbows, lined);
            const totalIL = combineDuctIL(ductIL, elbowIL);
            const ductBandObj  = ductIL  ? Object.fromEntries(BAND_KEYS.map((k,i)=>[k, ductIL[i]]))  : null;
            const elbowBandObj = elbowIL ? Object.fromEntries(BAND_KEYS.map((k,i)=>[k, elbowIL[i]])) : null;
            const totalBandObj = totalIL ? Object.fromEntries(BAND_KEYS.map((k,i)=>[k, totalIL[i]])) : null;
            const ri = getElbowRowIdx(duct.width_mm);
            const elbowTbl = lined ? ELBOW_LINED_TBL : ELBOW_UNLINED_TBL;
            const hasGeom = Number(duct.width_mm)>0 && Number(duct.height_mm)>0 && Number(duct.length_m)>0;

            return (
              <div key={idx} style={{ border:"1px solid #E9D5FF", borderRadius:10, background:"#FAFAFF", overflow:"hidden" }}>
                {/* Duct header */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", background:"#8B5CF60D", borderBottom:"1px solid #E9D5FF" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:99, background:"#8B5CF622", color:"#7C3AED", fontFamily:"Inter,sans-serif" }}>#{idx+1}</span>
                    <input
                      value={duct.label}
                      onChange={e=>patchDuct(idx,{label:e.target.value})}
                      style={{ border:"none", background:"transparent", fontSize:13, fontWeight:700, color:"#0F172A", outline:"none", fontFamily:"Inter,sans-serif", width:130 }}
                    />
                  </div>
                  {form.ducts.length > 1 && (
                    <button type="button" onClick={()=>removeDuct(idx)}
                      style={{ display:"flex", alignItems:"center", gap:4, padding:"4px 10px", borderRadius:6, border:"1px solid #FCA5A5", background:"#FEF2F2", color:"#DC2626", fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:"Inter,sans-serif" }}>
                      <Trash2 size={12} /> Remove
                    </button>
                  )}
                </div>

                <div style={{ padding:"14px", display:"flex", flexDirection:"column", gap:12 }}>

                  {/* ① Geometry — all with onLiveChange for instant preview */}
                  <div style={g4}>
                    <NumInput label="Width"  value={duct.width_mm}  onChange={v=>patchDuct(idx,{width_mm:v})}  onLiveChange={v=>patchDuct(idx,{width_mm:v})}  unit="mm" step={10} />
                    <NumInput label="Height" value={duct.height_mm} onChange={v=>patchDuct(idx,{height_mm:v})} onLiveChange={v=>patchDuct(idx,{height_mm:v})} unit="mm" step={10} />
                    <NumInput label="Length" value={duct.length_m}  onChange={v=>patchDuct(idx,{length_m:v})}  onLiveChange={v=>patchDuct(idx,{length_m:v})}  unit="m"  step={0.5} />
                    <NumInput label="No. of 90° Elbows" value={duct.elbows} onChange={v=>patchDuct(idx,{elbows:v})} onLiveChange={v=>patchDuct(idx,{elbows:v})} step={1} min={0} />
                  </div>

                  {/* ② Lining + Termination */}
                  <div style={g2}>
                    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                      <label style={{ fontSize:11.5, fontWeight:600, color:"#475569", fontFamily:"Inter,sans-serif" }}>Duct Lining</label>
                      <div style={{ display:"flex", gap:8 }}>
                        {[{value:"unlined",label:"Unlined"},{value:"lined",label:"Lined"}].map(opt=>(
                          <button key={opt.value} type="button" onClick={()=>patchDuct(idx,{lining:opt.value})}
                            style={{
                              padding:"7px 18px", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer",
                              fontFamily:"Inter,sans-serif", transition:"all .15s",
                              border:`1.5px solid ${duct.lining===opt.value?"#8B5CF6":"#E2E8F0"}`,
                              background:duct.lining===opt.value?"#EDE9FE":"#fff",
                              color:duct.lining===opt.value?"#7C3AED":"#64748B",
                            }}>{opt.label}</button>
                        ))}
                      </div>
                    </div>
                    <SelectInput label="Termination" value={duct.terminationType} onChange={v=>patchDuct(idx,{terminationType:v})}
                      options={[{value:"wall",label:"In wall / louver"},{value:"free_space",label:"Free space"}]} />
                  </div>

                  {/* ③ Lined duct extras: thickness + Coeff A override */}
                  {lined && (
                    <div style={{ background:"#F8F5FF", borderRadius:8, border:"1px solid #DDD6FE", padding:12, display:"flex", flexDirection:"column", gap:10 }}>
                      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
                        <div>
                          <p style={{ fontSize:12, fontWeight:700, color:"#4C1D95", fontFamily:"Inter,sans-serif", margin:"0 0 2px" }}>
                            Formula: IL = B × (P/S)<sup>C</sup> × t<sup>D</sup> × l
                          </p>
                          <p style={{ fontSize:11, color:"#6D28D9", fontFamily:"Inter,sans-serif", margin:0, lineHeight:1.5 }}>
                            B = Coeff A (manufacturer) · C = Coeff B (constant) · D = Coeff C (constant)<br/>
                            t = lining thickness (in) · l = duct length (ft)
                          </p>
                        </div>
                        <div style={{ minWidth:160 }}>
                          <NumInput label="Lining Thickness" value={duct.liningThickness_in}
                            onChange={v=>patchDuct(idx,{liningThickness_in:v})}
                            onLiveChange={v=>patchDuct(idx,{liningThickness_in:v})}
                            unit="in" step={0.5} min={0.5}/>
                        </div>
                      </div>

                      {/* Coeff A override — live */}
                      <div>
                        <p style={{ fontSize:10.5, fontWeight:700, color:"#2563EB", fontFamily:"Inter,sans-serif", margin:"0 0 5px" }}>
                          Override Coeff A (B) per band — leave 0 to use default
                        </p>
                        <BandGrid
                          values={duct.coeffA}
                          onChange={v=>patchDuctCoeffA(idx,v)}
                          onLiveChange={v=>patchDuctCoeffA(idx,v)}
                          highlightColor="#7C3AED"
                        />
                      </div>
                    </div>
                  )}

                  {/* ④ Elbow IL table — always visible when elbows > 0 */}
                  {Number(duct.elbows) > 0 && (
                    <div style={{ background:"#FFFBEB", borderRadius:8, border:"1px solid #FDE68A", padding:12 }}>
                      <p style={{ fontSize:11.5, fontWeight:700, color:"#92400E", fontFamily:"Inter,sans-serif", margin:"0 0 8px" }}>
                        Elbow IL Lookup — {lined?"Lined":"Unlined"} · per 90° elbow (dB) · {Number(duct.elbows)} elbow{Number(duct.elbows)!==1?"s":""}
                        <span style={{ fontWeight:500, color:"#B45309" }}> · highlighted row = current duct width</span>
                      </p>
                      <div style={{ overflowX:"auto" }}>
                        <table style={{ borderCollapse:"collapse", minWidth:520 }}>
                          <thead>
                            <tr>
                              <th style={{ padding:"5px 10px", textAlign:"left", fontSize:10.5, fontWeight:700, color:"#78350F", background:"#FDE68A", border:"1px solid #FCD34D", whiteSpace:"nowrap" }}>Width range</th>
                              {BANDS.map(b=><th key={b} style={{ padding:"5px 8px", textAlign:"center", fontSize:10.5, fontWeight:700, color:"#78350F", background:"#FDE68A", border:"1px solid #FCD34D", minWidth:44 }}>{b} Hz</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {elbowTbl.map((row,r)=>(
                              <tr key={r} style={{ background:r===ri?"#FEF3C7":"#fff" }}>
                                <td style={{ padding:"5px 10px", fontSize:11.5, fontWeight:r===ri?700:400, color:"#78350F", border:"1px solid #FDE68A", whiteSpace:"nowrap" }}>{ELBOW_WIDTH_RANGES[r]}</td>
                                {row.map((v,c)=><td key={c} style={{ padding:"5px 8px", textAlign:"center", fontSize:12, fontWeight:r===ri?700:400, color:r===ri?"#92400E":"#374151", border:"1px solid #FDE68A" }}>{v}</td>)}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* ⑤ Live IL result preview */}
                  {hasGeom && (
                    <div style={{ background:"#F0FDF4", borderRadius:10, border:"1px solid #86EFAC", padding:14 }}>
                      <p style={{ fontSize:12, fontWeight:700, color:"#15803D", fontFamily:"Plus Jakarta Sans,sans-serif", margin:"0 0 10px", display:"flex", alignItems:"center", gap:6 }}>
                        <span style={{ fontSize:14 }}>📉</span> Live Duct IL — {lined?"Lined":"Unlined"} · results update instantly
                      </p>

                      {ductBandObj && (
                        <div style={{ marginBottom:10 }}>
                          <p style={{ fontSize:10.5, fontWeight:700, color:"#166534", fontFamily:"Inter,sans-serif", margin:"0 0 5px" }}>
                            {lined?"Lined Duct IL (dB)":"Unlined Duct IL (dB)"}
                          </p>
                          <BandGrid values={ductBandObj} onChange={()=>{}} readOnly highlightColor="#16A34A"/>
                        </div>
                      )}

                      {elbowBandObj && (
                        <div style={{ marginBottom:10 }}>
                          <p style={{ fontSize:10.5, fontWeight:700, color:"#166534", fontFamily:"Inter,sans-serif", margin:"0 0 5px" }}>
                            Elbow IL — {Number(duct.elbows)} × 90° elbow{Number(duct.elbows)!==1?"s":""} (dB)
                          </p>
                          <BandGrid values={elbowBandObj} onChange={()=>{}} readOnly highlightColor="#16A34A"/>
                        </div>
                      )}

                      {ductBandObj && elbowBandObj && totalBandObj && (
                        <div style={{ borderTop:"1.5px solid #86EFAC", paddingTop:10, marginTop:2 }}>
                          <p style={{ fontSize:10.5, fontWeight:700, color:"#15803D", fontFamily:"Inter,sans-serif", margin:"0 0 5px" }}>
                            Total Duct IL — Duct + Elbows (dB)
                          </p>
                          <BandGrid values={totalBandObj} onChange={()=>{}} readOnly highlightColor="#047857"/>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              </div>
            );
          })}

          {/* Add duct button */}
          <button type="button" onClick={addDuct}
            style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 16px", borderRadius:9, border:"1.5px dashed #8B5CF6", background:"#8B5CF608", color:"#7C3AED", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"Inter,sans-serif", alignSelf:"flex-start" }}>
            <Plus size={15}/> Add Another Duct
          </button>
        </div>
      </Section>}

      {/* ── 3. End Reflection Factor — only for exhaust/intake paths ── */}
      {DUCT_PATHS.includes(form.noisePath) && <Section icon={Waves} title="End Reflection Factor" color="#06B6D4" defaultOpen={false}>
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <div style={{ background:"#ECFEFF", borderRadius:10, padding:"12px 14px", border:"1px solid #A5F3FC", fontSize:12.5, color:"#0E7490", fontFamily:"Inter,sans-serif" }}>
            <strong>ERL</strong> = 10·log₁₀[ 1 + (a₁·c₀ / π·f·D)² ] × −1 &nbsp;&nbsp;
            where D = √(4·Area/π) in ft, a₁ = 0.7, c₀ = 1125.33 ft/s
          </div>
          <div style={g2}>
            <NumInput label="Duct Width"  value={form.erl.width_mm}  onChange={v=>setErl("width_mm",v)}  onLiveChange={v=>setErl("width_mm",v)}  unit="mm" step={10} />
            <NumInput label="Duct Height" value={form.erl.height_mm} onChange={v=>setErl("height_mm",v)} onLiveChange={v=>setErl("height_mm",v)} unit="mm" step={10} />
          </div>
          {(() => {
            const erlVals = calcERL(form.erl.width_mm, form.erl.height_mm);
            if (!erlVals) return (
              <div style={{ fontSize:12.5, color:"#64748B", fontFamily:"Inter,sans-serif", padding:"8px 0" }}>
                Enter duct width and height to see End Reflection Loss per octave band.
              </div>
            );
            const erlObj = Object.fromEntries(BAND_KEYS.map((k,i)=>[k, erlVals[i]]));
            return (
              <div style={{ background:"#ECFEFF", borderRadius:10, padding:"14px", border:"1px solid #A5F3FC" }}>
                <BandGrid
                  label="End Reflection Loss (dB)"
                  values={erlObj}
                  onChange={()=>{}}
                  readOnly
                  highlightColor="#0891B2"
                />
              </div>
            );
          })()}
        </div>
      </Section>}

      {/* ── 4 & 5. Space Room OR Distance Effect — toggle ── */}
      <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E2E8F0", padding:"13px 16px" }}>
        <p style={{ fontSize:11, fontWeight:700, color:"#475569", textTransform:"uppercase", letterSpacing:".05em", fontFamily:"Inter,sans-serif", margin:"0 0 10px" }}>
          Room / Distance Method — choose one
        </p>
        <div style={{ display:"flex", gap:8 }}>
          {[{value:"spaceRoom",label:"Space Room"},{value:"distanceEffect",label:"Distance Effect"}].map(opt=>(
            <button key={opt.value} type="button" onClick={()=>setForm(f=>({...f,roomOrDistance:opt.value}))}
              style={{
                padding:"7px 18px", borderRadius:8,
                border:`1.5px solid ${form.roomOrDistance===opt.value?"#3B82F6":"#E2E8F0"}`,
                background:form.roomOrDistance===opt.value?"#EFF6FF":"#fff",
                color:form.roomOrDistance===opt.value?"#2563EB":"#64748B",
                fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"Inter,sans-serif", transition:"all .15s",
              }}>{opt.label}</button>
          ))}
        </div>
      </div>

      {form.roomOrDistance === "spaceRoom" && <Section icon={Box} title="Space Room" color="#3B82F6" defaultOpen={false}>
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <div style={g4}>
            <NumInput label="Length"          value={form.room.length_m}   onChange={v=>setRm("length_m",v)}   onLiveChange={v=>setRm("length_m",v)}   unit="m" step={0.5} />
            <NumInput label="Width"           value={form.room.width_m}    onChange={v=>setRm("width_m",v)}    onLiveChange={v=>setRm("width_m",v)}    unit="m" step={0.5} />
            <NumInput label="Ceiling Height"  value={form.room.height_m}   onChange={v=>setRm("height_m",v)}   onLiveChange={v=>setRm("height_m",v)}   unit="m" step={0.5} />
            <NumInput label="Distance to Receiver" value={form.room.distance_m} onChange={v=>setRm("distance_m",v)} onLiveChange={v=>setRm("distance_m",v)} unit="m" step={0.5} min={0.5} />
          </div>
          <div style={{ background:"#EFF6FF", borderRadius:10, padding:"10px 14px", border:"1px solid #BFDBFE", display:"flex", alignItems:"flex-start", gap:8, fontSize:12.5, color:"#1D4ED8", fontFamily:"Inter,sans-serif" }}>
            <Info size={15} style={{ marginTop:1, flexShrink:0 }} />
            <span>Schultz Room Equation: L<sub>p</sub> = L<sub>w</sub> − 10·log(r) − 5·log(V) − 3·log(f) + 12 &nbsp;·&nbsp; Volume = {round1((form.room.length_m||0)*(form.room.width_m||0)*(form.room.height_m||0))} m³</span>
          </div>
          {schultzBandObj ? (
            <div style={{ background:"#EFF6FF", borderRadius:10, padding:"14px", border:"1px solid #BFDBFE" }}>
              <BandGrid label="Live Schultz Offset per Octave Band (dB)" values={schultzBandObj} onChange={()=>{}} readOnly highlightColor="#3B82F6"/>
            </div>
          ) : (
            <div style={{ fontSize:12.5, color:"#64748B", fontFamily:"Inter,sans-serif", padding:"8px 0" }}>
              Enter room dimensions and distance to see live Schultz correction per octave band.
            </div>
          )}
        </div>
      </Section>}

      {form.roomOrDistance === "distanceEffect" && <Section icon={Navigation} title="Distance Effect" color="#10B981" defaultOpen={false}>
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <div style={{ background:"#ECFDF5", borderRadius:10, padding:"12px 14px", border:"1px solid #A7F3D0", fontSize:12.5, color:"#065F46", fontFamily:"Inter,sans-serif" }}>
            <strong>IL</strong> = 10·log₁₀(Q / 4πr²) &nbsp;&nbsp;
            where Q = directivity factor, r = distance from source to receiver (m)
          </div>
          <div style={g2}>
            <NumInput label="Distance to Receiver" value={form.distanceEffect.distance_m}  onChange={v=>setDE("distance_m",v)}  onLiveChange={v=>setDE("distance_m",v)}  unit="m" step={0.5} min={0.1} />
            <SelectInput label="Directivity Q" value={form.distanceEffect.directivity} onChange={v=>setDE("directivity",parseFloat(v))}
              options={[
                {value:1, label:"Q=1 (free field / open space 4π)"},
                {value:2, label:"Q=2 (half space 2π — near wall/ground)"},
                {value:4, label:"Q=4 (quarter space — corner)"},
                {value:8, label:"Q=8 (eighth space — tri-corner)"},
              ]} />
          </div>
          {(() => {
            const deObj = calcDistanceEffect(form.distanceEffect.distance_m, form.distanceEffect.directivity);
            if (!deObj) return null;
            const singleVal = deObj[BAND_KEYS[0]];
            return (
              <div style={{ background:"#ECFDF5", borderRadius:10, padding:"14px", border:"1px solid #A7F3D0" }}>
                <p style={{ fontSize:11.5, fontWeight:700, color:"#065F46", fontFamily:"Inter,sans-serif", margin:"0 0 8px" }}>
                  Distance Correction = {singleVal} dB &nbsp;
                  <span style={{ fontWeight:400, color:"#047857" }}>(same value for all octave bands — frequency-independent)</span>
                </p>
                <BandGrid label="Distance Effect IL (dB)" values={deObj} onChange={()=>{}} readOnly highlightColor="#059669"/>
              </div>
            );
          })()}
        </div>
      </Section>}

      {/* ── 6. Receiver ── */}
      <Section icon={MapPin} title="Receiver Location" color="#EF4444">
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {/* Distance first */}
          <div style={g2}>
            <NumInput label="Distance to Receiver" value={form.receiver.distance_m} onChange={v=>setRc("distance_m",v)} onLiveChange={v=>setRc("distance_m",v)} unit="m" step={0.5} min={0.5} />
            <SelectInput label="Directivity Q" value={form.receiver.directivity} onChange={v=>setRc("directivity",parseFloat(v))}
              options={[{value:1,label:"Q=1 (free field)"},{value:2,label:"Q=2 (near wall/ground)"},{value:4,label:"Q=4 (corner)"}]} />
          </div>
          <div style={g2}>
            <TextInput label="Receiver Description" value={form.receiver.description} onChange={v=>setRc("description",v)} placeholder="e.g. 3m from exhaust louver at nearest facade" />
            <NumInput label="dB(A) limit" value={form.receiver.required_dba} onChange={v=>setRc("required_dba",v)} unit="dB(A)" step={1} />
          </div>

          {/* NC / NR toggle + required value */}
          <div style={{ display:"flex", alignItems:"flex-end", gap:12, flexWrap:"wrap" }}>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              <label style={{ fontSize:11.5, fontWeight:600, color:"#475569", fontFamily:"Inter,sans-serif" }}>Rating Curve</label>
              <div style={{ display:"flex", gap:6 }}>
                {["NC","NR"].map(opt=>(
                  <button key={opt} type="button" onClick={()=>setRc("ncNrChoice",opt)}
                    style={{
                      padding:"8px 20px", borderRadius:8, fontSize:13, fontWeight:700,
                      fontFamily:"Inter,sans-serif", cursor:"pointer",
                      border:`1.5px solid ${form.receiver.ncNrChoice===opt?"#EF4444":"#E2E8F0"}`,
                      background:form.receiver.ncNrChoice===opt?"#FEF2F2":"#fff",
                      color:form.receiver.ncNrChoice===opt?"#EF4444":"#64748B",
                      transition:"all .15s",
                    }}>{opt}</button>
                ))}
              </div>
            </div>
            {form.receiver.ncNrChoice==="NC" ? (
              <div style={{ flex:1, minWidth:140 }}>
                <NumInput label="Required NC" value={form.receiver.requiredNC} onChange={v=>setRc("requiredNC",v)} step={5} unit="NC" />
              </div>
            ) : (
              <div style={{ flex:1, minWidth:140 }}>
                <NumInput label="Required NR" value={form.receiver.requiredNR} onChange={v=>setRc("requiredNR",v)} step={5} unit="NR" />
              </div>
            )}
          </div>

          {/* ── NC Summary Table ── */}
          {form.receiver.ncNrChoice === "NC" && (() => {
            const reqNC      = Number(form.receiver.requiredNC) || 50;
            const reqVals    = getNCCriteria(reqNC);
            const actualVals = BAND_KEYS.map(k => round1(liveLp[k] ?? 0));
            const reductionVals = actualVals.map((v,i) => round1(v - reqVals[i]));
            const ncRating   = calcNCRating(liveLp);

            return (
              <div style={{ background:"#FFF7ED", borderRadius:12, border:"1px solid #FED7AA", padding:"14px 16px" }}>
                <p style={{ fontSize:12, fontWeight:700, color:"#C2410C", margin:"0 0 12px", fontFamily:"Inter,sans-serif", textTransform:"uppercase", letterSpacing:".04em" }}>
                  NC Noise Level Summary
                </p>

                {/* Band header row */}
                <div style={{ overflowX:"auto" }}>
                  <table style={{ borderCollapse:"collapse", width:"100%", minWidth:560, fontFamily:"Inter,sans-serif", fontSize:11.5 }}>
                    <thead>
                      <tr>
                        <th style={{ padding:"5px 8px", textAlign:"left", background:"#FEF3C7", border:"1px solid #FDE68A", fontWeight:700, color:"#92400E", whiteSpace:"nowrap", minWidth:160 }}>Description</th>
                        {BANDS.map(b => (
                          <th key={b} style={{ padding:"5px 6px", textAlign:"center", background:"#FEF3C7", border:"1px solid #FDE68A", fontWeight:700, color:"#92400E", minWidth:54 }}>{b} Hz</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>

                      {/* Row 1 — Total Lp at receiver (live) */}
                      <tr>
                        <td style={{ padding:"5px 8px", fontWeight:600, color:"#1E293B", border:"1px solid #FDE68A", background:"#fff", whiteSpace:"nowrap" }}>
                          Total Lp at Receiver (dB)
                        </td>
                        {actualVals.map((v,i) => (
                          <td key={i} style={{ padding:"5px 6px", textAlign:"center", border:"1px solid #FDE68A", background:"#fff", color:"#0F172A", fontWeight:600 }}>
                            {v}
                          </td>
                        ))}
                      </tr>

                      {/* Row 2 — Required Noise Level from NC table */}
                      <tr>
                        <td style={{ padding:"5px 8px", fontWeight:600, color:"#1E293B", border:"1px solid #FDE68A", background:"#F0FDF4", whiteSpace:"nowrap" }}>
                          Required Noise Level: NC {reqNC}
                        </td>
                        {reqVals.map((v,i) => (
                          <td key={i} style={{ padding:"5px 6px", textAlign:"center", border:"1px solid #FDE68A", background:"#F0FDF4", color:"#166534", fontWeight:600 }}>
                            {round1(v)}
                          </td>
                        ))}
                      </tr>

                      {/* Row 3 — Additional dB reduction required (highlighted yellow) */}
                      <tr>
                        <td style={{ padding:"5px 8px", fontWeight:700, color:"#92400E", border:"1px solid #FDE68A", background:"#FEF08A", whiteSpace:"nowrap" }}>
                          Additional dB Reduction Required
                        </td>
                        {reductionVals ? reductionVals.map((v,i) => (
                          <td key={i} style={{ padding:"5px 6px", textAlign:"center", border:"1px solid #FDE68A", background: v > 0 ? "#FEF08A" : "#DCFCE7", color: v > 0 ? "#92400E" : "#166534", fontWeight:700 }}>
                            {v > 0 ? `+${v}` : v}
                          </td>
                        )) : BAND_KEYS.map(k => (
                          <td key={k} style={{ padding:"5px 6px", textAlign:"center", border:"1px solid #FDE68A", background:"#FEF9C3", color:"#A16207" }}>
                            <span style={{ color:"#94A3B8" }}>—</span>
                          </td>
                        ))}
                      </tr>

                    </tbody>
                  </table>
                </div>

                {/* NC Rating badge */}
                <div style={{ marginTop:10, display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                  {ncRating !== null ? (
                    <span style={{ fontSize:13, fontWeight:700, padding:"4px 14px", borderRadius:99, fontFamily:"Inter,sans-serif",
                      background: ncRating === ">80" || (typeof ncRating === "number" && ncRating > reqNC) ? "#FEE2E2" : "#DCFCE7",
                      color: ncRating === ">80" || (typeof ncRating === "number" && ncRating > reqNC) ? "#991B1B" : "#166534",
                      border: `1px solid ${ncRating === ">80" || (typeof ncRating === "number" && ncRating > reqNC) ? "#FECACA" : "#86EFAC"}`,
                    }}>
                      Calculated NC: {ncRating} &nbsp;
                      {typeof ncRating === "number" && ncRating <= reqNC ? "✓ Within limit" : "✗ Exceeds NC " + reqNC}
                    </span>
                  ) : (
                    <span style={{ fontSize:12, color:"#94A3B8", fontFamily:"Inter,sans-serif", fontStyle:"italic" }}>
                      Run calculation to see Lp at receiver and dB reduction required
                    </span>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </Section>

      {/* ── 7. Attenuator ── */}
      <Section icon={Gauge} title="Attenuator / Acoustic Louver" color="#F59E0B" defaultOpen={false}>
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <div style={g3}>
            <TextInput label="Model" value={form.attenuator.model} onChange={v=>setA("model",v)} placeholder="e.g. A37" />
            <NumInput  label="Width"  value={form.attenuator.width_mm}  onChange={v=>setA("width_mm",v)}  unit="mm" step={100} />
            <NumInput  label="Height" value={form.attenuator.height_mm} onChange={v=>setA("height_mm",v)} unit="mm" step={100} />
          </div>
          <div style={g2}>
            <NumInput label="Length"        value={form.attenuator.length_mm}      onChange={v=>setA("length_mm",v)}        unit="mm" step={100} />
            <NumInput label="Pressure Drop" value={form.attenuator.pressureDrop_pa} onChange={v=>setA("pressureDrop_pa",v)} unit="Pa" step={5} />
          </div>
          <div style={{ background:"#FFFBEB", borderRadius:10, padding:"14px", border:"1px solid #FDE68A" }}>
            <BandGrid
              label="Attenuator Insertion Loss per Octave Band"
              values={form.attenuator.il}
              onChange={setAW}
              note="Enter positive values — e.g. 12 means 12 dB attenuation at that frequency."
              highlightColor="#D97706"
            />
          </div>
        </div>
      </Section>

      {/* ── Buttons ── */}
      <div style={{ display:"flex", gap:12, justifyContent:"flex-end", paddingTop:4 }}>
        <motion.button onClick={handleRun} disabled={running||saving} type="button"
          whileHover={!running?{scale:1.02}:{}} whileTap={!running?{scale:0.98}:{}}
          style={{ display:"flex", alignItems:"center", gap:8, padding:"11px 22px", borderRadius:10, border:"1.5px solid #0E9F8E", background:"#E3F8F5", color:"#0E9F8E", fontSize:14, fontWeight:700, fontFamily:"Plus Jakarta Sans,sans-serif", cursor:running?"not-allowed":"pointer" }}>
          {running ? <Loader2 size={16} style={{animation:"spin .7s linear infinite"}}/> : <Calculator size={16}/>}
          {running?"Calculating…":"Run Calculation"}
        </motion.button>

        <motion.button onClick={handleSave} disabled={saving||running} type="button"
          whileHover={!saving?{scale:1.02,y:-1}:{}} whileTap={!saving?{scale:0.98}:{}}
          style={{ display:"flex", alignItems:"center", gap:8, padding:"11px 28px", borderRadius:10, border:"none", background:saving?"#CBD5E1":"linear-gradient(135deg,#0E9F8E,#0B8276)", color:"#fff", fontSize:14, fontWeight:700, fontFamily:"Plus Jakarta Sans,sans-serif", boxShadow:saving?"none":"0 4px 14px rgba(14,159,142,.3)", cursor:saving?"not-allowed":"pointer" }}>
          {saving&&<Loader2 size={16} style={{animation:"spin .7s linear infinite"}}/>}
          {saving?"Saving…":existing?._id?"Update & Calculate":"Save & Calculate"}
        </motion.button>
      </div>
    </div>
  );
}
import { useState, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap, Box, Wind, Gauge, MapPin, Waves,
  ChevronDown, ChevronUp, Loader2, Calculator,
  Info, Plus, Trash2,
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
    rows.push({ label:"A-Weighting Correction", values: BAND_KEYS.map(k => A_WEIGHTING[k]) });
    rows.push({ label:"Resulting SWL (dB)", values: BAND_KEYS.map(k => resultBand?.[k] ?? 0), highlight:true });
  } else if (noiseInputType === "spl_db") {
    rows.push({ label:`+10·log₁₀(4πr²)  @ r=${r}m`, values: BAND_KEYS.map(() => distanceTerm) });
    rows.push({ label:"Resulting SWL (dB)", values: BAND_KEYS.map(k => resultBand?.[k] ?? 0), highlight:true });
  } else if (noiseInputType === "spl_dba") {
    rows.push({ label:"A-Weighting Correction", values: BAND_KEYS.map(k => A_WEIGHTING[k]) });
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
    const il = B * Math.pow(PS, C) * Math.pow(t, D) * L;
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

// ── End Reflection Loss ───────────────────────────────────────
// ERL = 10·log₁₀[ 1 + (a1·co / π·f·D)^a2 ] − 1
// a1=0.7, a2=2, co=1125.33 ft/s, D=√(4·Area) in ft
const ERL_A1 = 0.7;
const ERL_A2 = 2;
const ERL_CO = 1125.33; // ft/s

function calcERL(width_mm, height_mm) {
  const W = mmToFt(width_mm||0);
  const H = mmToFt(height_mm||0);
  if (W <= 0 || H <= 0) return null;
  const area = W * H;
  const D = Math.sqrt(4 * area / Math.PI);
  return BANDS.map(f => {
    const inner = (ERL_A1 * ERL_CO) / (Math.PI * f * D);
    const erl = 10 * Math.log10(1 + Math.pow(inner, ERL_A2)) - 1;
    return Math.round(erl * 100) / 100;
  });
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

const DEFAULT = {
  noisePath:  "exhaust",
  generator: {
    noiseInputType: "swl_db", measurementDistance_m: 1,
    equipmentId:"", modelNumber:"", ratedKva:0, buildingRef:"", swl_dba:0,
    rawBand: { ...EMPTY_BAND },
    swl:     { ...EMPTY_BAND },
  },
  room:       { length_m:0, width_m:0, height_m:0, distance_m:3 },
  ducts:      [defaultDuct(0)],
  erl:        { width_mm:0, height_mm:0 },
  attenuator: { model:"", width_mm:0, height_mm:0, length_mm:0, pressureDrop_pa:0, il:{ ...EMPTY_BAND } },
  receiver:   { description:"", distance_m:3, directivity:2, requiredNC:65, requiredNR:65, required_dba:65, ncNrChoice:"NC" },
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
                  <div style={{ fontSize:9.5, color:"#64748B", fontWeight:500, marginTop:1 }}>
                    A={A_WEIGHT[i]>0?"+":""}{A_WEIGHT[i]}
                  </div>
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
        attenuator: { ...DEFAULT.attenuator, ...existing.attenuator },
        receiver:   { ...DEFAULT.receiver,   ...existing.receiver   },
      };
    }
    return { ...DEFAULT };
  });

  const [saving,  setSaving]  = useState(false);
  const [running, setRunning] = useState(false);

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
  const setAW = useCallback(v=>setForm(f=>({...f, attenuator:{...f.attenuator, il:v}})),[]);
  const setRc = (k,v) => setForm(f=>({...f, receiver:{...f.receiver,[k]:v}}));

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

  const handleRun = async () => {
    setRunning(true);
    try {
      const payload = { ...form, ducts: form.ducts.map(({_showCoeff,_showElbow,...rest})=>rest) };
      const { data } = await runCalculationApi(projectId, payload);
      onResults(data.results, form.receiver);
      toast.success("Calculation complete");
    } catch(err) {
      toast.error(err.response?.data?.message || "Calculation failed");
    } finally { setRunning(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...form, ducts: form.ducts.map(({_showCoeff,_showElbow,...rest})=>rest) };
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
          {[{value:"exhaust",label:"Exhaust Air"},{value:"intake",label:"Intake Air"},{value:"radiated",label:"Radiated"}].map(p=>(
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

      {/* ── 2. Duct(s) ── */}
      <Section icon={Wind} title={`Duct(s) / Opening`} color="#8B5CF6"
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

                      {/* Default coefficient tables */}
                      {[
                        ["Coeff A (B) — Manufacturer value", LINED_DEFAULT.A],
                        ["Coeff B (C) — Constant",           LINED_DEFAULT.B],
                        ["Coeff C (D) — Constant",           LINED_DEFAULT.C],
                      ].map(([lbl, vals]) => (
                        <div key={lbl}>
                          <p style={{ fontSize:10.5, fontWeight:700, color:"#6D28D9", fontFamily:"Inter,sans-serif", margin:"0 0 5px" }}>{lbl}</p>
                          <div style={{ overflowX:"auto" }}>
                            <table style={{ borderCollapse:"collapse", minWidth:480 }}>
                              <thead><tr>{BANDS.map(b=><th key={b} style={{ padding:"3px 8px", textAlign:"center", fontSize:10.5, fontWeight:700, color:"#7C3AED", background:"#EDE9FE", border:"1px solid #DDD6FE", minWidth:56 }}>{b} Hz</th>)}</tr></thead>
                              <tbody><tr>{vals.map((v,i)=><td key={i} style={{ padding:"4px 6px", textAlign:"center", fontSize:11.5, fontWeight:600, color:"#4C1D95", border:"1px solid #DDD6FE", background:"#FAF8FF" }}>{v}</td>)}</tr></tbody>
                            </table>
                          </div>
                        </div>
                      ))}

                      {/* Coeff A override — live */}
                      <div>
                        <p style={{ fontSize:10.5, fontWeight:700, color:"#2563EB", fontFamily:"Inter,sans-serif", margin:"0 0 5px" }}>
                          Override Coeff A (B) per band — enter 0 to use default table above
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
      </Section>

      {/* ── 3. End Reflection Factor ── */}
      <Section icon={Waves} title="End Reflection Factor" color="#06B6D4" defaultOpen={false}>
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <div style={{ background:"#ECFEFF", borderRadius:10, padding:"12px 14px", border:"1px solid #A5F3FC", fontSize:12.5, color:"#0E7490", fontFamily:"Inter,sans-serif" }}>
            <strong>ERL</strong> = 10·log₁₀[ 1 + (a₁·c₀ / π·f·D)² ] − 1 &nbsp;&nbsp;
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
      </Section>

      {/* ── 4. Plant Room / Space Room ── */}
      <Section icon={Box} title="Plant Room / Space Room" color="#3B82F6" defaultOpen={false}>
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
              <BandGrid
                label="Live Schultz Offset per Octave Band (dB)"
                values={schultzBandObj}
                onChange={()=>{}}
                readOnly
                highlightColor="#3B82F6"
              />
            </div>
          ) : (
            <div style={{ fontSize:12.5, color:"#64748B", fontFamily:"Inter,sans-serif", padding:"8px 0" }}>
              Enter room dimensions and distance to see live Schultz correction per octave band.
            </div>
          )}
        </div>
      </Section>

      {/* ── 5. Receiver ── */}
      <Section icon={MapPin} title="Receiver Location" color="#EF4444">
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <TextInput label="Receiver Description" value={form.receiver.description} onChange={v=>setRc("description",v)} placeholder="e.g. 3m from exhaust louver at nearest facade" />
          <div style={g3}>
            <NumInput label="Distance to Receiver" value={form.receiver.distance_m} onChange={v=>setRc("distance_m",v)} onLiveChange={v=>setRc("distance_m",v)} unit="m" step={0.5} min={0.5} />
            <SelectInput label="Directivity Q" value={form.receiver.directivity} onChange={v=>setRc("directivity",parseFloat(v))}
              options={[{value:1,label:"Q=1 (free field)"},{value:2,label:"Q=2 (near wall/ground)"},{value:4,label:"Q=4 (corner)"}]} />
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
        </div>
      </Section>

      {/* ── 6. Attenuator ── */}
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
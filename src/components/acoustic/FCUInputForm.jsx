import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wind, ArrowRight, ChevronDown, ChevronUp,
  RefreshCw, Info, AlertCircle,
} from "lucide-react";

/* ─── Constants ─────────────────────────────────────────── */
const BANDS     = [63,125,250,500,1000,2000,4000,8000];
const BAND_KEYS = ["hz63","hz125","hz250","hz500","hz1000","hz2000","hz4000","hz8000"];

/* Environmental Correction Factor (fixed per band) */
const ENV_CF = [-4,-2,-1,0,0,0,0,0];

/* Lined duct IL per metre: f(W,H) → insertion loss/m per band
   Using ASHRAE rectangular duct lined IL lookup (approximate)
   Formula: IL/m = factor × (P/A)^0.5 where P=perimeter, A=area
   We use a simplified table approach matching the sheet values */
function linedDuctIL(wMM, hMM, lengthM) {
  const w = wMM/1000, h = hMM/1000;
  if (!w || !h || !lengthM) return BANDS.map(()=>0);
  const r = Math.min(w,h)/Math.max(w,h);
  // per-band base IL dB/m for 25mm lining (ASHRAE Table 10.4 approximation)
  const base = [0.66,1.64,3.28,5.91,8.20,6.56,3.28,1.64];
  // size correction: smaller duct → more IL
  const dh = 2*w*h/(w+h); // hydraulic diameter
  const sc = Math.min(2.0, 0.3/dh);
  return base.map(b => -(b * sc * lengthM));
}

/* Un-lined duct IL */
function unlinedDuctIL(wMM, hMM, lengthM) {
  const w = wMM/1000, h = hMM/1000;
  if (!w || !h || !lengthM) return BANDS.map(()=>0);
  const area = w * h;
  // ASHRAE unlined: very small, ~0.1 dB/m at low freq
  const base = [0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1];
  const sc = Math.min(2.0, 0.09/area);
  return base.map(b => -(b * sc * lengthM));
}

/* Lined Elbow 90° attenuation (ASHRAE Table 10.9) */
function linedElbowIL(wMM) {
  const w = wMM; // mm
  if (!w) return BANDS.map(()=>0);
  // f/fc where fc = c/2w; lookup table for lined square elbow
  const il = [0,0,-1,-6,-10,-10,-10,-10];
  return il;
}

/* Branch duct power division */
function branchDivision(wMM, hMM, qty) {
  if (!wMM || !hMM || !qty || qty<2) return BANDS.map(()=>0);
  // equal branch: -10log(N)
  const loss = -10*Math.log10(qty);
  return BANDS.map(()=>loss);
}

/* Flexible duct IL (per ASHRAE) */
function flexDuctIL(wMM, lengthM) {
  if (!wMM || !lengthM) return BANDS.map(()=>0);
  // flexible duct ~2 dB/m at 63Hz up to 8 dB/m at 500Hz
  const base = [2.0,3.0,4.0,5.0,8.0,9.0,10.0,10.0]; // per ASHRAE
  return base.map(b => -(b * lengthM));
}

/* Un-lined plenum IL */
function unlinedPlenumIL(wMM, hMM, lengthM) {
  const w = wMM/1000, h = hMM/1000;
  if (!w || !h || !lengthM) return BANDS.map(()=>0);
  const area = w*h;
  const base = [0.05,0.05,0.05,0.03,0.02,0.01,0.01,0.01];
  const sc = Math.min(3.0, 0.1/area);
  return base.map(b => -(b*sc*lengthM));
}

/* Space/Room Effect: Lp = Lw - 10log(Q/4πr² + 4/R) */
function spaceRoomEffect(roomLenM, roomWidM, heightToCeilM, distToRecM) {
  if (!roomLenM || !roomWidM) return BANDS.map(()=>0);
  const area  = roomLenM * roomWidM;
  const perimeter = 2*(roomLenM+roomWidM);
  const vol   = area * (heightToCeilM||2.7);
  const alpha = 0.15; // average absorption
  const R     = (alpha * 6 * vol) / (1 - alpha);
  const r     = distToRecM || 1.5;
  const Q     = 2;
  const val   = 10*Math.log10(Q/(4*Math.PI*r*r) + 4/R);
  return BANDS.map(()=>parseFloat(val.toFixed(2)));
}

/* R/A duct space/distance: 10log(Q/4πr²) */
function raDistEffect(distDuctToGrillM) {
  const r = distDuctToGrillM || 2.5;
  const Q = 2;
  const val = 10*Math.log10(Q/(4*Math.PI*r*r));
  return BANDS.map(()=>parseFloat(val.toFixed(2)));
}

/* End Reflection Factor — NC + grill size */
const END_REFLECTION_TABLE = {
  // key: "NC_W_L" (NC value, grill width mm, grill length mm)
  // Simplified: NC 19 → grill 1400×50 → [10.85,9.85,8.85,5.85,1.81,0.81,0.81,0.81]
  default: (ncVal, wMM, lMM) => {
    if (!wMM || !lMM) return BANDS.map(()=>0);
    const area = (wMM/1000)*(lMM/1000);
    // ERF increases at low freq, decreases at high
    const base=[10,8,6,4,2,1,0,0];
    return base.map(b=>b);
  }
};
function endReflectionFactor(ncVal, wMM, lMM) {
  if (!wMM || !lMM) return BANDS.map(()=>0);
  // Simplified NC-based end reflection from ASHRAE
  const area = (wMM/1000)*(lMM/1000);
  const scale = Math.sqrt(area/0.07);
  const base = [10.85,9.85,8.85,5.85,1.81,0.81,0.81,0.81];
  return base.map(b=>b*scale);
}

/* Radiated path: False ceiling TL */
const FALSE_CEILING_TL = {
  "12.5mm Gypsum Board":    [-18,-21,-25,-25,-27,-27,-28,-28],
  "12.5mm Gypsum (transition)": [-18,-21,-25,-25,-27,-27,-28,-28],
  "5mm Gypsum Board":       [-10,-13,-16,-18,-21,-23,-25,-25],
  "9mm Plasterboard":       [-14,-17,-21,-23,-26,-27,-28,-28],
  "15mm Gypsum Board":      [-20,-23,-27,-28,-30,-30,-31,-31],
};
const CEILING_OPTIONS = Object.keys(FALSE_CEILING_TL);

/* NC Criteria rows (same NR_ROWS from DG form) */
const NC_TABLE = [
  {nc:15, left:[47,36,29,22,17,14,12,11]},
  {nc:20, left:[51,40,33,26,22,19,17,16]},
  {nc:25, left:[54,44,37,31,27,24,22,21]},
  {nc:30, left:[57,48,41,35,31,29,28,27]},
  {nc:35, left:[60,52,45,40,36,34,33,32]},
  {nc:40, left:[64,56,50,45,41,39,38,37]},
  {nc:45, left:[67,60,54,49,46,44,43,42]},
  {nc:50, left:[71,64,58,54,51,49,48,47]},
];
function getNcCriteria(nc){
  const v=Number(nc)||25;
  return NC_TABLE.reduce((best,row)=>Math.abs(row.nc-v)<Math.abs(best.nc-v)?row:best).left;
}
function calcNcRating(lpArr){
  for(const row of NC_TABLE){
    if(!lpArr.some((v,i)=>v>row.left[i])) return row.nc;
  }
  return ">50";
}

/* Log combine */
function logCombine(arrays){
  if(!arrays.length) return BANDS.map(()=>0);
  return BANDS.map((_,i)=>{
    const sum=arrays.reduce((acc,arr)=>acc+Math.pow(10,(arr[i]||0)/10),0);
    return parseFloat((10*Math.log10(sum)).toFixed(1));
  });
}
function addBands(a,b){ return a.map((v,i)=>parseFloat((v+(b[i]||0)).toFixed(2))); }

/* ─── Default form state ─────────────────────────────────── */
function defaultFCUForm() {
  return {
    // Equipment info
    equipmentId: "",
    description: "",
    equipmentLocation: "",
    modelNumber: "",
    // SWL (8 bands)
    swl: Object.fromEntries(BAND_KEYS.map(k=>[k,""])),
    // Supply Duct (Path 1)
    supply: {
      // Lined Duct
      linedW:"", linedH:"", linedL:"",
      // Lined Elbow
      elbowW:"", hasElbow: false,
      // Un-Lined Duct
      unlinedW:"", unlinedH:"", unlinedL:"",
      // Branch
      branchW:"", branchH:"", branchQty:"",
      // Flex Duct
      flexW:"", flexL:"",
      // Un-Lined Plenum
      plenumW:"", plenumH:"", plenumL:"",
      // Room / Space
      roomLen:"", roomWid:"", roomHeight:"2.7", distToRec:"1.5",
      // End Reflection
      erfNC:"", erfW:"", erfL:"",
    },
    // Return Path (Path 2)
    returnPath: {
      distDuctToGrill:"", roomLen:"", roomWid:"", roomHeight:"2.7", distToRec:"1.5",
      erfNC:"", erfW:"", erfL:"",
    },
    // Radiated / Through False Ceiling (Path 3)
    radiated: {
      ceilingMaterial: CEILING_OPTIONS[0],
      roomLen:"", roomWid:"", roomHeight:"-", distToRec:"-",
    },
    // Required NC
    requiredNC:"25",
    // Which paths are active
    activePaths: { supply:true, returnPath:true, radiated:true },
  };
}

/* ─── Calculation engine ─────────────────────────────────── */
function calcFCU(form, roomType) {
  const swlArr = BAND_KEYS.map(k=>Number(form.swl[k])||0);
  const sp = form.supply;
  const rp = form.returnPath;
  const rd = form.radiated;

  // ── Supply Duct ──
  const s_swl      = swlArr;
  const s_env      = ENV_CF;
  const s_lined    = linedDuctIL(Number(sp.linedW),Number(sp.linedH),Number(sp.linedL));
  const s_elbow    = sp.hasElbow ? linedElbowIL(Number(sp.elbowW)) : BANDS.map(()=>0);
  const s_unlined  = unlinedDuctIL(Number(sp.unlinedW),Number(sp.unlinedH),Number(sp.unlinedL));
  const s_branch   = branchDivision(Number(sp.branchW),Number(sp.branchH),Number(sp.branchQty));
  const s_flex     = flexDuctIL(Number(sp.flexW),Number(sp.flexL));
  const s_plenum   = unlinedPlenumIL(Number(sp.plenumW),Number(sp.plenumH),Number(sp.plenumL));
  const s_space    = spaceRoomEffect(Number(sp.roomLen),Number(sp.roomWid),Number(sp.roomHeight||2.7),Number(sp.distToRec||1.5));
  const s_total    = s_swl.map((_,i)=>s_swl[i]+s_env[i]+s_lined[i]+s_elbow[i]+s_unlined[i]+s_branch[i]+s_flex[i]+s_plenum[i]+s_space[i]);
  const s_erf      = endReflectionFactor(sp.erfNC, Number(sp.erfW), Number(sp.erfL));
  const s_final    = s_total.map((v,i)=>parseFloat((v+s_erf[i]).toFixed(2)));

  // ── Return Path ──
  const r_swl      = swlArr;
  const r_env      = ENV_CF;
  const r_dist     = raDistEffect(Number(rp.distDuctToGrill));
  const r_space    = spaceRoomEffect(Number(rp.roomLen),Number(rp.roomWid),Number(rp.roomHeight||2.7),Number(rp.distToRec||1.5));
  const r_total    = r_swl.map((_,i)=>r_swl[i]+r_env[i]+r_dist[i]+r_space[i]);
  const r_erf      = endReflectionFactor(rp.erfNC, Number(rp.erfW), Number(rp.erfL));
  const r_final    = r_total.map((v,i)=>parseFloat((v+r_erf[i]).toFixed(2)));

  // ── Radiated ──
  const rd_tl      = FALSE_CEILING_TL[rd.ceilingMaterial] || BANDS.map(()=>0);
  const rd_total   = swlArr.map((v,i)=>parseFloat((v+rd_tl[i]).toFixed(2)));
  const rd_final   = rd_total; // no ERF for radiated

  // ── Combination ──
  const active = [];
  if (form.activePaths.supply)     active.push({ label:"SUPPLY DUCT",          arr:s_final });
  if (form.activePaths.returnPath) active.push({ label:"RETURN PATH",          arr:r_final });
  if (form.activePaths.radiated)   active.push({ label:"THROUGH FALSE CEILING", arr:rd_final });

  const combined  = active.length ? logCombine(active.map(a=>a.arr)) : BANDS.map(()=>0);
  const reqNC     = Number(form.requiredNC)||25;
  const ncCrit    = getNcCriteria(reqNC);
  const addlRed   = combined.map((v,i)=>Math.max(0,parseFloat((v-ncCrit[i]).toFixed(1))));
  const calcNC    = calcNcRating(combined);

  return {
    supply:   { swl:s_swl, env:s_env, lined:s_lined, elbow:s_elbow, unlined:s_unlined,
                branch:s_branch, flex:s_flex, plenum:s_plenum, space:s_space,
                total:s_total, erf:s_erf, final:s_final },
    returnPath:{ swl:r_swl, env:r_env, dist:r_dist, space:r_space,
                 total:r_total, erf:r_erf, final:r_final },
    radiated:  { swl:swlArr, tl:rd_tl, total:rd_total, final:rd_final },
    combined, active, ncCrit, addlRed, calcNC,
  };
}

/* ─── Shared UI helpers ──────────────────────────────────── */
const TEAL   = "#0E9F8E";
const BLUE   = "#6366F1";
const AMBER  = "#F59E0B";
const GRAY   = "#64748B";
const BG     = "#F8FAFC";

function fmt(v){ return v===undefined||v===null||isNaN(v)||!isFinite(v)?"—":parseFloat(v.toFixed(2)); }
function fmtN(v){ return v===undefined||v===null||isNaN(v)||!isFinite(v)?"—":Math.round(v); }

function BandHeader({ accent="#0F172A" }){
  return (
    <tr>
      {["63","125","250","500","1k","2k","4k","8k"].map((f,i)=>(
        <th key={i} style={{
          width:70, textAlign:"center", padding:"5px 4px",
          fontSize:11, fontWeight:700, color:accent,
          background:"#F1F5F9", borderBottom:"1px solid #E2E8F0",
        }}>{f} Hz</th>
      ))}
    </tr>
  );
}

function CalcRow({ label, values, highlight, indent=false, dimLabel=false }){
  return (
    <tr style={{ background: highlight ? "#FFF9C4" : "transparent" }}>
      <td style={{
        padding:"5px 10px 5px "+(indent?"22px":"10px"),
        fontSize:11.5, color: dimLabel?"#94A3B8":"#334155",
        fontWeight: highlight?700:400,
        borderBottom:"1px solid #F1F5F9", whiteSpace:"nowrap",
        minWidth:220,
      }}>{label}</td>
      {(values||[]).map((v,i)=>(
        <td key={i} style={{
          textAlign:"center", padding:"5px 4px",
          fontSize:11.5, fontWeight: highlight?700:400,
          color: highlight?"#0F172A": v<0?"#64748B":"#0F172A",
          borderBottom:"1px solid #F1F5F9",
          background: highlight?"#FFF176":"transparent",
        }}>{fmt(v)}</td>
      ))}
    </tr>
  );
}

function NumberInput({ value, onChange, placeholder="", min, max, style={} }){
  return (
    <input type="number" value={value} onChange={e=>onChange(e.target.value)}
      placeholder={placeholder} min={min} max={max}
      style={{
        width:"100%", padding:"6px 8px", border:"1.5px solid #E2E8F0",
        borderRadius:7, fontSize:12, color:"#0F172A", background:"#fff",
        outline:"none", textAlign:"center", ...style,
      }} />
  );
}

function TextInput({ value, onChange, placeholder="", style={} }){
  return (
    <input type="text" value={value} onChange={e=>onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width:"100%", padding:"7px 10px", border:"1.5px solid #E2E8F0",
        borderRadius:7, fontSize:12.5, color:"#0F172A", background:"#fff",
        outline:"none", ...style,
      }} />
  );
}

function FieldRow({ label, children }){
  return (
    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
      <span style={{ fontSize:12, color:"#64748B", width:160, flexShrink:0 }}>{label}</span>
      <div style={{ flex:1 }}>{children}</div>
    </div>
  );
}

function SWLInputRow({ swl, onChange }){
  return (
    <div>
      <div style={{ fontSize:12, fontWeight:600, color:"#334155", marginBottom:6 }}>
        Sound Power Level dB(A) — Octave Bands
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(8,1fr)", gap:6 }}>
        {BAND_KEYS.map((k,i)=>(
          <div key={k}>
            <div style={{ fontSize:10, color:"#94A3B8", textAlign:"center", marginBottom:2 }}>
              {BANDS[i]} Hz
            </div>
            <NumberInput value={swl[k]} onChange={v=>onChange(k,v)} placeholder="—"/>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Collapsible section */
function Section({ title, color=TEAL, bg="#E3F8F5", children, defaultOpen=true }){
  const [open,setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderRadius:12, border:`1.5px solid ${color}33`, marginBottom:16, overflow:"hidden" }}>
      <button onClick={()=>setOpen(o=>!o)}
        style={{
          width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"11px 16px", background:bg, border:"none", cursor:"pointer",
        }}>
        <span style={{ fontSize:13, fontWeight:700, color, fontFamily:"var(--font-display,Inter,sans-serif)" }}>
          {title}
        </span>
        {open ? <ChevronUp size={16} color={color}/> : <ChevronDown size={16} color={color}/>}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}}
            exit={{height:0,opacity:0}} transition={{duration:.2}}>
            <div style={{ padding:"16px", background:"#fff" }}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* Path-specific sub-duct input group */
function DuctInputGroup({ title, sp, onChange, showElbow=true }){
  const upd = (k,v) => onChange(k,v);
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
      {/* Lined Duct */}
      <div style={{ background:"#F8FAFC", borderRadius:9, padding:12, border:"1px solid #E2E8F0" }}>
        <div style={{ fontSize:11.5, fontWeight:700, color:TEAL, marginBottom:8 }}>Lined Duct</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
          {[["linedW","W (mm)"],["linedH","H (mm)"],["linedL","L (m)"]].map(([k,lbl])=>(
            <div key={k}>
              <div style={{fontSize:10,color:"#94A3B8",marginBottom:2}}>{lbl}</div>
              <NumberInput value={sp[k]} onChange={v=>upd(k,v)} placeholder="0"/>
            </div>
          ))}
        </div>
        {showElbow && (
          <div style={{ marginTop:8 }}>
            <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:11.5, color:"#64748B", cursor:"pointer" }}>
              <input type="checkbox" checked={sp.hasElbow||false} onChange={e=>upd("hasElbow",e.target.checked)}/>
              Lined Elbow 90°
            </label>
            {sp.hasElbow && (
              <div style={{ marginTop:6 }}>
                <div style={{fontSize:10,color:"#94A3B8",marginBottom:2}}>Elbow W (mm)</div>
                <NumberInput value={sp.elbowW} onChange={v=>upd("elbowW",v)} placeholder="0"/>
              </div>
            )}
          </div>
        )}
      </div>
      {/* Un-Lined Duct */}
      <div style={{ background:"#F8FAFC", borderRadius:9, padding:12, border:"1px solid #E2E8F0" }}>
        <div style={{ fontSize:11.5, fontWeight:700, color:GRAY, marginBottom:8 }}>Un-Lined Duct</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
          {[["unlinedW","W (mm)"],["unlinedH","H (mm)"],["unlinedL","L (m)"]].map(([k,lbl])=>(
            <div key={k}>
              <div style={{fontSize:10,color:"#94A3B8",marginBottom:2}}>{lbl}</div>
              <NumberInput value={sp[k]} onChange={v=>upd(k,v)} placeholder="0"/>
            </div>
          ))}
        </div>
      </div>
      {/* Branch */}
      <div style={{ background:"#F8FAFC", borderRadius:9, padding:12, border:"1px solid #E2E8F0" }}>
        <div style={{ fontSize:11.5, fontWeight:700, color:"#8B5CF6", marginBottom:8 }}>Branch Duct Division</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
          {[["branchW","W (mm)"],["branchH","H (mm)"],["branchQty","No. of Branches"]].map(([k,lbl])=>(
            <div key={k}>
              <div style={{fontSize:10,color:"#94A3B8",marginBottom:2}}>{lbl}</div>
              <NumberInput value={sp[k]} onChange={v=>upd(k,v)} placeholder="0"/>
            </div>
          ))}
        </div>
      </div>
      {/* Flex Duct */}
      <div style={{ background:"#F8FAFC", borderRadius:9, padding:12, border:"1px solid #E2E8F0" }}>
        <div style={{ fontSize:11.5, fontWeight:700, color:"#0EA5E9", marginBottom:8 }}>Flexible Duct</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
          {[["flexW","W (mm)"],["flexL","L (m)"]].map(([k,lbl])=>(
            <div key={k}>
              <div style={{fontSize:10,color:"#94A3B8",marginBottom:2}}>{lbl}</div>
              <NumberInput value={sp[k]} onChange={v=>upd(k,v)} placeholder="0"/>
            </div>
          ))}
        </div>
      </div>
      {/* Un-Lined Plenum */}
      <div style={{ background:"#F8FAFC", borderRadius:9, padding:12, border:"1px solid #E2E8F0" }}>
        <div style={{ fontSize:11.5, fontWeight:700, color:"#F59E0B", marginBottom:8 }}>Un-Lined Plenum</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
          {[["plenumW","W (mm)"],["plenumH","H (mm)"],["plenumL","L (m)"]].map(([k,lbl])=>(
            <div key={k}>
              <div style={{fontSize:10,color:"#94A3B8",marginBottom:2}}>{lbl}</div>
              <NumberInput value={sp[k]} onChange={v=>upd(k,v)} placeholder="0"/>
            </div>
          ))}
        </div>
      </div>
      {/* Room Effect */}
      <div style={{ background:"#F8FAFC", borderRadius:9, padding:12, border:"1px solid #E2E8F0" }}>
        <div style={{ fontSize:11.5, fontWeight:700, color:"#10B981", marginBottom:8 }}>Room / Space Effect</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
          {[["roomLen","Room L (m)"],["roomWid","Room W (m)"],["roomHeight","Ceiling H (m)"],["distToRec","Dist to Rec (m)"]].map(([k,lbl])=>(
            <div key={k}>
              <div style={{fontSize:10,color:"#94A3B8",marginBottom:2}}>{lbl}</div>
              <NumberInput value={sp[k]} onChange={v=>upd(k,v)} placeholder={k==="roomHeight"?"2.7":k==="distToRec"?"1.5":""}/>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ERFInputGroup({ sp, onChange }){
  const upd=(k,v)=>onChange(k,v);
  return (
    <div style={{ background:"#FFF7ED", borderRadius:9, padding:12, border:"1px solid #FED7AA", marginTop:12 }}>
      <div style={{ fontSize:11.5, fontWeight:700, color:"#EA580C", marginBottom:8 }}>
        End Reflection Factor — Grill/Diffuser
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
        {[["erfNC","NC Value"],["erfW","W (mm)"],["erfL","L (mm)"]].map(([k,lbl])=>(
          <div key={k}>
            <div style={{fontSize:10,color:"#94A3B8",marginBottom:2}}>{lbl}</div>
            <NumberInput value={sp[k]} onChange={v=>upd(k,v)} placeholder="0"/>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Result table for one path */
function PathResultTable({ title, rows, accent=TEAL }){
  return (
    <div style={{ marginBottom:20 }}>
      <div style={{ fontSize:13, fontWeight:700, color:accent, marginBottom:8, padding:"6px 12px",
        background:`${accent}11`, borderRadius:7, display:"inline-block" }}>
        {title}
      </div>
      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead><BandHeader accent={accent}/></thead>
          <tbody>
            {rows.map((r,i)=>(
              <CalcRow key={i} label={r.label} values={r.values}
                highlight={r.highlight} indent={r.indent} dimLabel={r.dim}/>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────── */
export default function FCUInputForm({ project }){
  const [equipType, setEquipType] = useState("fcu"); // "fcu" | "fan"
  const [roomType,  setRoomType]  = useState("different"); // "different" | "same"
  const [form,      setForm]      = useState(defaultFCUForm());
  const [activeTab, setActiveTab] = useState("input"); // "input" | "results"

  /* Updaters */
  const setSwl    = (k,v) => setForm(f=>({...f, swl:{...f.swl,[k]:v}}));
  const setTop    = (k,v) => setForm(f=>({...f,[k]:v}));
  const setSupply = (k,v) => setForm(f=>({...f, supply:{...f.supply,[k]:v}}));
  const setReturn = (k,v) => setForm(f=>({...f, returnPath:{...f.returnPath,[k]:v}}));
  const setRad    = (k,v) => setForm(f=>({...f, radiated:{...f.radiated,[k]:v}}));
  const togglePath= (p)   => setForm(f=>({...f, activePaths:{...f.activePaths,[p]:!f.activePaths[p]}}));
  const resetForm = ()    => { setForm(defaultFCUForm()); };

  /* Live calculation */
  const calc = useMemo(()=>calcFCU(form, roomType), [form, roomType]);

  /* ── Render ── */
  const accentColor = equipType==="fcu" ? TEAL : BLUE;

  return (
    <div style={{ fontFamily:"Inter,sans-serif", color:"#0F172A", maxWidth:1100, margin:"0 auto" }}>

      {/* ─ Equipment Type Toggle ─ */}
      <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap", alignItems:"center" }}>
        <span style={{ fontSize:12, fontWeight:700, color:"#94A3B8", textTransform:"uppercase", letterSpacing:".05em" }}>
          Equipment:
        </span>
        {[{v:"fcu",l:"FCU (Fan Coil Unit)",c:TEAL},{v:"fan",l:"Fan",c:BLUE}].map(opt=>(
          <button key={opt.v} onClick={()=>setEquipType(opt.v)} style={{
            padding:"7px 18px", borderRadius:9999, fontSize:12.5, fontWeight:600,
            background: equipType===opt.v ? opt.c : "#fff",
            color:      equipType===opt.v ? "#fff" : "#64748B",
            border:     equipType===opt.v ? `1.5px solid ${opt.c}` : "1.5px solid #E2E8F0",
            cursor:"pointer", transition:"all .15s",
          }}>{opt.l}</button>
        ))}
        <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
          <span style={{ fontSize:12, fontWeight:700, color:"#94A3B8", textTransform:"uppercase", letterSpacing:".05em" }}>
            Method:
          </span>
          {[{v:"different",l:"Different Room"},{v:"same",l:"Same Room"}].map(opt=>(
            <button key={opt.v} onClick={()=>setRoomType(opt.v)} style={{
              padding:"7px 18px", borderRadius:9999, fontSize:12.5, fontWeight:600,
              background: roomType===opt.v ? accentColor : "#fff",
              color:      roomType===opt.v ? "#fff" : "#64748B",
              border:     roomType===opt.v ? `1.5px solid ${accentColor}` : "1.5px solid #E2E8F0",
              cursor:"pointer", transition:"all .15s",
            }}>{opt.l}</button>
          ))}
        </div>
      </div>

      {/* ─ Tab bar ─ */}
      <div style={{ display:"flex", gap:0, borderBottom:"2px solid #E2E8F0", marginBottom:20 }}>
        {["input","results"].map(t=>(
          <button key={t} onClick={()=>setActiveTab(t)} style={{
            padding:"10px 24px", fontSize:13, fontWeight:700, border:"none",
            background:"transparent", cursor:"pointer", textTransform:"capitalize",
            color: activeTab===t ? accentColor : "#64748B",
            borderBottom: activeTab===t ? `2.5px solid ${accentColor}` : "2.5px solid transparent",
            marginBottom:-2,
          }}>{t==="input"?"Input Form":"Calculation Results"}</button>
        ))}
        <button onClick={resetForm} style={{
          marginLeft:"auto", display:"flex", alignItems:"center", gap:5,
          padding:"6px 14px", borderRadius:8, border:"1.5px solid #E2E8F0",
          background:"#fff", fontSize:12, color:"#64748B", cursor:"pointer",
        }}>
          <RefreshCw size={12}/> Reset
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab==="input" ? (
          <motion.div key="input" initial={{opacity:0,x:-10}} animate={{opacity:1,x:0}} exit={{opacity:0,x:10}} transition={{duration:.18}}>

            {/* ─ Equipment Info ─ */}
            <Section title="Equipment Information" color={accentColor} bg={equipType==="fcu"?"#E3F8F5":"#EEF2FF"}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                {[["equipmentId","Equipment ID"],["modelNumber","Model Number"],["description","Description"],["equipmentLocation","Equipment Location"]].map(([k,lbl])=>(
                  <div key={k}>
                    <div style={{fontSize:11,color:"#94A3B8",marginBottom:4}}>{lbl}</div>
                    <TextInput value={form[k]} onChange={v=>setTop(k,v)} placeholder={lbl}/>
                  </div>
                ))}
              </div>
            </Section>

            {/* ─ SWL ─ */}
            <Section title={`Sound Power Level — ${equipType.toUpperCase()}`} color={accentColor} bg={equipType==="fcu"?"#E3F8F5":"#EEF2FF"}>
              <SWLInputRow swl={form.swl} onChange={setSwl}/>
            </Section>

            {/* ─ Path Active Toggles ─ */}
            <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
              <span style={{ fontSize:12, fontWeight:700, color:"#94A3B8", alignSelf:"center" }}>Active Paths:</span>
              {[
                {k:"supply",     l:"Path 1 — Supply Duct"},
                {k:"returnPath", l:"Path 2 — Return Path"},
                {k:"radiated",   l:"Path 3 — Radiated / False Ceiling"},
              ].map(({k,l})=>(
                <button key={k} onClick={()=>togglePath(k)} style={{
                  padding:"5px 14px", borderRadius:9999, fontSize:12, fontWeight:600,
                  background: form.activePaths[k] ? accentColor+"22" : "#fff",
                  color:      form.activePaths[k] ? accentColor : "#94A3B8",
                  border:     form.activePaths[k] ? `1.5px solid ${accentColor}` : "1.5px solid #E2E8F0",
                  cursor:"pointer",
                }}>{l}</button>
              ))}
            </div>

            {/* ─ Supply Duct ─ */}
            {form.activePaths.supply && (
              <Section title="Path 1 — Supply Duct" color={TEAL} bg="#E3F8F5">
                <DuctInputGroup sp={form.supply} onChange={setSupply} showElbow={true}/>
                <ERFInputGroup sp={form.supply} onChange={setSupply}/>
              </Section>
            )}

            {/* ─ Return Path ─ */}
            {form.activePaths.returnPath && (
              <Section title="Path 2 — Return Path" color={BLUE} bg="#EEF2FF">
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                  <div style={{ background:"#F8FAFC", borderRadius:9, padding:12, border:"1px solid #E2E8F0" }}>
                    <div style={{ fontSize:11.5, fontWeight:700, color:BLUE, marginBottom:8 }}>R/A Duct to Grill</div>
                    <div>
                      <div style={{fontSize:10,color:"#94A3B8",marginBottom:2}}>Distance Duct → Grill (m)</div>
                      <NumberInput value={form.returnPath.distDuctToGrill} onChange={v=>setReturn("distDuctToGrill",v)} placeholder="2.5"/>
                    </div>
                  </div>
                  <div style={{ background:"#F8FAFC", borderRadius:9, padding:12, border:"1px solid #E2E8F0" }}>
                    <div style={{ fontSize:11.5, fontWeight:700, color:"#10B981", marginBottom:8 }}>Room / Space</div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                      {[["roomLen","Room L (m)"],["roomWid","Room W (m)"],["roomHeight","Ceiling H (m)"],["distToRec","Dist to Rec (m)"]].map(([k,lbl])=>(
                        <div key={k}>
                          <div style={{fontSize:10,color:"#94A3B8",marginBottom:2}}>{lbl}</div>
                          <NumberInput value={form.returnPath[k]} onChange={v=>setReturn(k,v)} placeholder={k==="roomHeight"?"2.7":"1.5"}/>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <ERFInputGroup sp={form.returnPath} onChange={setReturn}/>
              </Section>
            )}

            {/* ─ Radiated / False Ceiling ─ */}
            {form.activePaths.radiated && (
              <Section title="Path 3 — Radiated / Through False Ceiling" color={AMBER} bg="#FFFBEB">
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                  <div>
                    <div style={{fontSize:11,color:"#94A3B8",marginBottom:4}}>Ceiling Material (TL source)</div>
                    <select value={form.radiated.ceilingMaterial}
                      onChange={e=>setRad("ceilingMaterial",e.target.value)}
                      style={{
                        width:"100%", padding:"8px 10px", border:"1.5px solid #E2E8F0",
                        borderRadius:7, fontSize:12.5, background:"#fff", color:"#0F172A",
                      }}>
                      {CEILING_OPTIONS.map(o=>(
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                    <div style={{ marginTop:8, fontSize:11, color:"#94A3B8" }}>
                      TL values per octave band:
                    </div>
                    <div style={{ display:"flex", gap:4, marginTop:4, flexWrap:"wrap" }}>
                      {(FALSE_CEILING_TL[form.radiated.ceilingMaterial]||[]).map((v,i)=>(
                        <span key={i} style={{ fontSize:10.5, background:"#FFF3CD", borderRadius:5,
                          padding:"2px 6px", border:"1px solid #FED7AA", color:"#92400E" }}>
                          {BANDS[i]}Hz: {v}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div style={{ background:"#F8FAFC", borderRadius:9, padding:12, border:"1px solid #E2E8F0" }}>
                    <div style={{fontSize:11.5, fontWeight:700, color:AMBER, marginBottom:8}}>Room Dimensions (optional)</div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                      {[["roomLen","Room L (m)"],["roomWid","Room W (m)"]].map(([k,lbl])=>(
                        <div key={k}>
                          <div style={{fontSize:10,color:"#94A3B8",marginBottom:2}}>{lbl}</div>
                          <NumberInput value={form.radiated[k]} onChange={v=>setRad(k,v)} placeholder="—"/>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Section>
            )}

            {/* ─ Required NC ─ */}
            <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #E2E8F0", padding:16, marginBottom:16 }}>
              <div style={{fontSize:13,fontWeight:700,color:"#0F172A",marginBottom:10}}>Required Noise Criterion (NC)</div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {[15,20,25,30,35,40,45,50].map(nc=>(
                  <button key={nc} onClick={()=>setTop("requiredNC",String(nc))} style={{
                    padding:"5px 14px", borderRadius:9999, fontSize:12.5, fontWeight:600,
                    background: form.requiredNC===String(nc) ? accentColor : "#F1F5F9",
                    color:      form.requiredNC===String(nc) ? "#fff" : "#64748B",
                    border:     form.requiredNC===String(nc) ? `1.5px solid ${accentColor}` : "1.5px solid transparent",
                    cursor:"pointer",
                  }}>NC {nc}</button>
                ))}
              </div>
            </div>

          </motion.div>
        ) : (
          <motion.div key="results" initial={{opacity:0,x:10}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-10}} transition={{duration:.18}}>

            {/* Supply Duct Results */}
            {form.activePaths.supply && (
              <PathResultTable title="Path 1 — Supply Duct" accent={TEAL} rows={[
                {label:"Sound Power Level (dB)", values:calc.supply.swl},
                {label:"Environmental Correction Factor", values:calc.supply.env, dim:true},
                {label:"Lined Duct Insertion Loss", values:calc.supply.lined, indent:true},
                ...(form.supply.hasElbow?[{label:"Lined Elbow 90° Attenuation", values:calc.supply.elbow, indent:true}]:[]),
                {label:"Un-Lined Duct Insertion Loss", values:calc.supply.unlined, indent:true},
                {label:"Branch Duct Division", values:calc.supply.branch, indent:true},
                {label:"Flexible Duct Insertion Loss", values:calc.supply.flex, indent:true},
                {label:"Un-Lined Plenum Insertion Loss", values:calc.supply.plenum, indent:true},
                {label:"Space / Room Effect @ Receiver", values:calc.supply.space, indent:true},
                {label:"Total Transmission Loss Lp @ Receiver", values:calc.supply.total, highlight:false},
                {label:`End Reflection Factor (NC ${form.supply.erfNC||"—"}) — Grill/Diffuser`, values:calc.supply.erf, indent:true},
                {label:"Calculated Final Noise", values:calc.supply.final, highlight:true},
              ]}/>
            )}

            {/* Return Path Results */}
            {form.activePaths.returnPath && (
              <PathResultTable title="Path 2 — Return Path" accent={BLUE} rows={[
                {label:"Sound Power Level (dB)", values:calc.returnPath.swl},
                {label:"Environmental Correction Factor", values:calc.returnPath.env, dim:true},
                {label:"Space/Distance Effect in R/A Duct → Grill (10Log Q/4πr²)", values:calc.returnPath.dist, indent:true},
                {label:"Space / Room Effect @ Receiver", values:calc.returnPath.space, indent:true},
                {label:"Total Transmission Loss Lp @ Receiver", values:calc.returnPath.total},
                {label:`End Reflection Factor (NC ${form.returnPath.erfNC||"—"}) — Grill/Diffuser`, values:calc.returnPath.erf, indent:true},
                {label:"Calculated Final Noise", values:calc.returnPath.final, highlight:true},
              ]}/>
            )}

            {/* Radiated Results */}
            {form.activePaths.radiated && (
              <PathResultTable title="Path 3 — Radiated / Through False Ceiling" accent={AMBER} rows={[
                {label:"Sound Power Level (dB)", values:calc.radiated.swl},
                {label:`TL — ${form.radiated.ceilingMaterial}`, values:calc.radiated.tl, indent:true},
                {label:"Total Lp @ Receiver", values:calc.radiated.total, highlight:true},
              ]}/>
            )}

            {/* Combination Table */}
            <div style={{ background:"#fff", borderRadius:12, border:`1.5px solid ${accentColor}44`, overflow:"hidden", marginBottom:20 }}>
              <div style={{ padding:"10px 16px", background:`${accentColor}11`, borderBottom:`1.5px solid ${accentColor}22` }}>
                <span style={{ fontSize:13, fontWeight:700, color:accentColor }}>
                  Combination of Path Results — Logarithmic Addition (dB)
                </span>
              </div>
              <div style={{ padding:16, overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ width:40, padding:"5px 10px", fontSize:11, fontWeight:700, color:"#94A3B8", background:"#F8FAFC", borderBottom:"1px solid #E2E8F0", textAlign:"left" }}>Path</th>
                      <th style={{ padding:"5px 10px", fontSize:11, fontWeight:700, color:"#94A3B8", background:"#F8FAFC", borderBottom:"1px solid #E2E8F0", textAlign:"left", minWidth:200 }}>Description</th>
                      <BandHeader accent="#0F172A"/>
                    </tr>
                  </thead>
                  <tbody>
                    {calc.active.map((a,i)=>(
                      <tr key={i}>
                        <td style={{ padding:"5px 10px", fontSize:11.5, color:"#64748B", borderBottom:"1px solid #F1F5F9" }}>{i+1}</td>
                        <td style={{ padding:"5px 10px", fontSize:11.5, color:"#334155", borderBottom:"1px solid #F1F5F9", fontWeight:600 }}>{a.label}</td>
                        {a.arr.map((v,j)=>(
                          <td key={j} style={{ textAlign:"center", padding:"5px 4px", fontSize:11.5, borderBottom:"1px solid #F1F5F9" }}>{fmt(v)}</td>
                        ))}
                      </tr>
                    ))}
                    {/* Total Lp */}
                    <tr style={{ background:"#F0FDF4" }}>
                      <td colSpan={2} style={{ padding:"6px 10px", fontSize:12, fontWeight:700, color:"#0F172A" }}>Total Lp at Receiver Location</td>
                      {calc.combined.map((v,i)=>(
                        <td key={i} style={{ textAlign:"center", padding:"6px 4px", fontSize:12, fontWeight:700, color:"#0F172A" }}>{fmt(v)}</td>
                      ))}
                    </tr>
                    {/* Required NC */}
                    <tr>
                      <td colSpan={2} style={{ padding:"6px 10px", fontSize:11.5, color:"#64748B" }}>
                        Required Noise Level: <strong style={{color:accentColor}}>NC {form.requiredNC}</strong>
                      </td>
                      {calc.ncCrit.map((v,i)=>(
                        <td key={i} style={{ textAlign:"center", padding:"6px 4px", fontSize:11.5, color:"#64748B" }}>{v}</td>
                      ))}
                    </tr>
                    {/* Additional Reduction */}
                    <tr>
                      <td colSpan={2} style={{ padding:"6px 10px", fontSize:11.5, color:"#64748B" }}>Additional dB Reduction Required</td>
                      {calc.addlRed.map((v,i)=>(
                        <td key={i} style={{ textAlign:"center", padding:"6px 4px", fontSize:11.5, color: v>0?"#EF4444":"#10B981", fontWeight: v>0?700:400 }}>{v}</td>
                      ))}
                    </tr>
                    {/* Calculated NC */}
                    <tr style={{ background: calc.calcNC<=Number(form.requiredNC)?"#D1FAE5":"#FEE2E2" }}>
                      <td colSpan={2} style={{ padding:"8px 10px", fontSize:13, fontWeight:800, color:"#0F172A" }}>
                        Calculated NC Level
                      </td>
                      <td colSpan={8} style={{ textAlign:"center", padding:"8px 4px", fontSize:16, fontWeight:800,
                        color: calc.calcNC<=Number(form.requiredNC) ? "#059669" : "#DC2626" }}>
                        NC {calc.calcNC}
                        <span style={{ fontSize:12, fontWeight:500, marginLeft:8, color:"#64748B" }}>
                          (Required: NC {form.requiredNC})
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Summary card */}
            <div style={{
              borderRadius:12, border:`2px solid ${calc.calcNC<=Number(form.requiredNC)?TEAL:"#EF4444"}`,
              padding:"16px 20px", display:"flex", alignItems:"center", gap:14,
              background: calc.calcNC<=Number(form.requiredNC) ? "#F0FDF4" : "#FEF2F2",
            }}>
              {calc.calcNC<=Number(form.requiredNC)
                ? <Wind size={28} color={TEAL}/>
                : <AlertCircle size={28} color="#EF4444"/>}
              <div>
                <div style={{ fontSize:14, fontWeight:800, color:"#0F172A", marginBottom:2 }}>
                  {calc.calcNC<=Number(form.requiredNC)
                    ? `✓ Satisfactory — Calculated NC ${calc.calcNC} meets NC ${form.requiredNC}`
                    : `✗ Exceeds Limit — Calculated NC ${calc.calcNC} exceeds NC ${form.requiredNC}`}
                </div>
                <div style={{ fontSize:12, color:"#64748B" }}>
                  Equipment: {form.equipmentId||"—"} | Model: {form.modelNumber||"—"} | {form.description||"—"} @ {form.equipmentLocation||"—"}
                </div>
              </div>
            </div>

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
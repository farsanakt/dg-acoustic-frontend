import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wind, Waves, ChevronDown, ChevronUp, Calculator, Layers, Info, Zap } from "lucide-react";

const BANDS     = [63, 125, 250, 500, 1000, 2000, 4000, 8000];
const BAND_KEYS = ["hz63","hz125","hz250","hz500","hz1000","hz2000","hz4000","hz8000"];

// SWL_nonA = SWL_A - A_WEIGHT_STD  e.g. 34.6-(-26.2)=60.8 ✓
const A_WEIGHT_STD     = [-26.2,-16.1,-8.6,-3.2,0,1.2,1.0,-1.1];
const A_WEIGHT_DISPLAY = [26.2,16.1,8.6,3.2,0,-1.2,-1.0,1.1];
const ENV_CF           = [-4,-2,-1,0,0,0,0,0];

// Lined duct ASHRAE regression: IL = -A*(P/S ft-1)^B * t^C * L_m
// Calibrated from AAPL sheet (400x300, 1m → [-1.6,-0.8,-1.8,-2.2,-4.4,-6.3,-4.2,-3.1])
const LINED_A = [0.1333,0.1337,0.6328,1.1667,1.8219,2.2776,2.3701,2.3480];
const LINED_B = [1.959,1.41,0.824,0.5,0.695,0.802,0.451,0.219];
const LINED_C = [0.917,0.941,1.079,1.087,0,0,0,0];

// Flexible duct IL per metre – from AAPL sheet
const FLEX_TABLE=[
  {w:150,il:[2.0,3.0,4.0,8.0,10.0,10.0,7.0,7.0]},
  {w:160,il:[2.0,3.0,4.0,8.0,10.0,10.0,7.0,7.0]},
  {w:200,il:[2.0,3.0,5.0,8.0, 9.0, 8.0,6.0,6.0]},
  {w:250,il:[2.0,3.0,6.0,8.0, 9.0, 9.0,5.0,5.0]},
  {w:300,il:[2.0,2.0,5.0,8.0, 9.0, 8.0,5.0,5.0]},
];
function getFlexPerMetre(w_mm){
  const w=Number(w_mm)||200;
  let best=FLEX_TABLE[0],minD=Math.abs(w-best.w);
  for(const r of FLEX_TABLE){const d=Math.abs(w-r.w);if(d<minD){minD=d;best=r;}}
  return best.il;
}
function calcFlexIL(w_mm,len_m){ return getFlexPerMetre(w_mm).map(v=>r2(-v*Number(len_m||0))); }

// False ceiling TL values
const FALSE_CEILING={
  "12.5mm Gypsum Board":                    [-18,-21,-25,-25,-27,-27,-28,-28],
  "12.5mm Gypsum Board (transition)":       [-18,-21,-25,-25,-27,-27,-28,-28],
  "12.5mm RG Plasterboard + 25mm absorber": [-18,-22,-27,-28,-31,-32,-33,-33],
  "9mm Plasterboard":                       [-14,-17,-21,-23,-26,-27,-28,-28],
  "15mm Gypsum Board":                      [-20,-23,-27,-28,-30,-30,-31,-31],
};

// NC curve levels (dB) — used for ERL lookup and NC rating
const NC_ROWS=[
  {nc:15, left:[47,36,29,22,17,14,12,11]},
  {nc:20, left:[51,40,33,26,22,19,17,16]},
  {nc:25, left:[54,44,37,31,27,24,22,21]},
  {nc:30, left:[57,48,41,35,31,29,28,27]},
  {nc:35, left:[60,52,45,40,36,34,33,32]},
  {nc:40, left:[64,56,50,45,41,39,38,37]},
  {nc:45, left:[67,60,54,49,46,44,43,42]},
  {nc:50, left:[71,64,58,54,51,49,48,47]},
  {nc:55, left:[74,67,62,58,56,54,53,52]},
  {nc:60, left:[77,71,67,63,61,59,58,57]},
  {nc:65, left:[80,75,71,68,66,64,63,62]},
];

// ERL table — NC-based lookup (sheet row 24: NC-18 → [50.2,39.2,32.2,25.2,21.0,18.0,16.0,15.0])
// NC-18 is not a standard NC curve but matches AAPL's diffuser data exactly
const ERL_TABLE={
  "NC-15":[47.0,36.0,29.0,22.0,17.0,14.0,12.0,11.0],
  "NC-18":[50.2,39.2,32.2,25.2,21.0,18.0,16.0,15.0],
  "NC-20":[51.0,40.0,33.0,26.0,22.0,19.0,17.0,16.0],
  "NC-25":[54.0,44.0,37.0,31.0,27.0,24.0,22.0,21.0],
  "NC-30":[57.0,48.0,41.0,35.0,31.0,29.0,28.0,27.0],
  "NC-35":[60.0,52.0,45.0,40.0,36.0,34.0,33.0,32.0],
  "NC-40":[64.0,56.0,50.0,45.0,41.0,39.0,38.0,37.0],
};
function getERL(ncRating){ return ERL_TABLE[ncRating]||ERL_TABLE["NC-18"]; }

function mmToFt(mm){return (mm||0)/304.8;}
function mToFt(m){return (m||0)*3.28084;}
function r2(n){return Math.round(n*100)/100;}
function r1(n){return Math.round(n*10)/10;}
const ZERO8=()=>BANDS.map(()=>0);

function computeNonAWeighted(arr){
  return arr.map((v,i)=>r1((v||0)-A_WEIGHT_STD[i]));
}

// Lined duct IL = -A*(P/S ft-1)^B * t^C * L_m  (L in metres, PS in ft-1, t=1 inch always)
function calcLinedIL(w_mm,h_mm,len_m){
  const W=mmToFt(w_mm),H=mmToFt(h_mm),t=1;
  const L=Number(len_m)||0;
  if(!W||!H||!L) return ZERO8();
  const P=2*(W+H),S=W*H,PS=P/S;
  return BANDS.map((_,i)=>{
    const tC=LINED_C[i]!==0?Math.pow(t,LINED_C[i]):1;
    return r2(-LINED_A[i]*Math.pow(PS,LINED_B[i])*tC*L);
  });
}

// Unlined duct IL
function calcUnlinedIL(w_mm,h_mm,len_m){
  const W=mmToFt(w_mm),H=mmToFt(h_mm),L=mToFt(len_m);
  if(!W||!H||!L) return ZERO8();
  const P=2*(W+H),S=W*H,PS=P/S;
  return BANDS.map(f=>{
    const il=PS>=3?-17.0*Math.pow(PS,-0.25)*Math.pow(f,-0.85)*L:-1.64*Math.pow(PS,0.73)*Math.pow(f,-0.58)*L;
    return r2(il);
  });
}

// Branch Power Division = 10·log(A_branch / (A_upstream + A_branch))
// Number of branches: when >1, divide equally → each branch gets IL based on 1/N of upstream flow
// Sheet formula: 10·log(A_branch / (A_upstream + A_branch)) — applies per branch outlet
function calcBranchIL(bW,bH,upW,upH,numBranches){
  const Ab=mmToFt(bW)*mmToFt(bH);
  const Au=mmToFt(upW)*mmToFt(upH);
  const N=Math.max(1,Math.round(numBranches)||1);
  if(Ab<=0||Au<=0) return 0;
  // With N branches of same size: effective upstream area splits = Au/N per branch outlet
  // But sheet shows: 10·log(A_branch/(A_upstream+A_branch)) regardless of number
  // Number of branches field is for reference/labeling only in sheet
  return r2(10*Math.log10(Ab/(Au+Ab)));
}

// Schultz Space/Room Effect: -10log(r) -5log(V) -3log(f) + 12
function calcSchultz(len,wid,hei,dist){
  const V=Number(len)*Number(wid)*Number(hei), r=Math.max(0.01,Number(dist)||1.5);
  if(V<=0) return ZERO8();
  return BANDS.map(f=>r2(-10*Math.log10(r)-5*Math.log10(V)-3*Math.log10(f)+12));
}

// Distance Effect scalar: 10·log(Q/4πr²)
function calcDistEff(dist,Q=2){
  const r=Math.max(0.01,Number(dist)||1);
  return r2(10*Math.log10(Number(Q)/(4*Math.PI*r*r)));
}

function logSum(arrays){
  if(!arrays||!arrays.length) return ZERO8();
  return BANDS.map((_,i)=>r1(10*Math.log10(arrays.reduce((s,a)=>s+Math.pow(10,(a[i]||0)/10),0))));
}
function calcNCRating(lp){
  for(const row of NC_ROWS){ if(!lp.some((v,i)=>v>row.left[i])) return row.nc; }
  return ">65";
}
function getRoomEff(mode,rL,rW,rH,rD,dD,dQ){
  if(mode==="spaceRoom") return calcSchultz(rL,rW,rH,rD);
  if(mode==="distEffect"){ const s=calcDistEff(dD,dQ); return BANDS.map(()=>s); }
  return ZERO8();
}

// ===== UI HELPERS =====
const thS={border:"1px solid #E2E8F0",padding:"6px 8px",background:"#F1F5F9",fontWeight:700,color:"#475569",textAlign:"center",fontSize:12,whiteSpace:"nowrap"};
const tdS={border:"1px solid #E2E8F0",padding:"6px 8px",textAlign:"center",color:"#334155",fontSize:12};
const tdL={...tdS,textAlign:"left",fontWeight:600,whiteSpace:"nowrap",minWidth:220};

function BandInput({value,onCommit}){
  const [local,setLocal]=useState(String(value??0));
  const [focus,setFocus]=useState(false);
  const prev=useRef(value);
  useEffect(()=>{if(!focus&&prev.current!==value){prev.current=value;setLocal(String(value??0));}},[value,focus]);
  return <input type="number" value={local} step="0.1"
    onFocus={e=>{setFocus(true);setLocal(String(value??0));setTimeout(()=>e.target.select(),0);}}
    onChange={e=>setLocal(e.target.value)}
    onBlur={()=>{setFocus(false);const f=isNaN(parseFloat(local))?0:parseFloat(local);setLocal(String(f));prev.current=f;onCommit(f);}}
    onKeyDown={e=>e.key==="Enter"&&e.target.blur()}
    style={{width:"100%",padding:"7px 4px",border:`1.5px solid ${focus?"#6366F1":"#E2E8F0"}`,borderRadius:6,fontSize:12.5,fontWeight:600,color:"#0F172A",background:"#fff",outline:"none",textAlign:"center",MozAppearance:"textfield",boxShadow:focus?"0 0 0 3px rgba(99,102,241,.1)":"none"}}/>;
}

function NumInput({label,value,onChange,unit,step=0.1,min}){
  const [local,setLocal]=useState(String(value??0));
  const [focus,setFocus]=useState(false);
  const prev=useRef(value);
  useEffect(()=>{if(!focus&&prev.current!==value){prev.current=value;setLocal(String(value??0));}},[value,focus]);
  return (
    <div style={{display:"flex",flexDirection:"column",gap:4}}>
      {label&&<label style={{fontSize:11.5,fontWeight:600,color:"#475569"}}>{label}</label>}
      <div style={{position:"relative"}}>
        <input type="number" value={focus?local:String(value??0)} min={min} step={step}
          onFocus={e=>{setFocus(true);setLocal(String(value??0));setTimeout(()=>e.target.select(),0);}}
          onChange={e=>setLocal(e.target.value)}
          onBlur={()=>{setFocus(false);const f=isNaN(parseFloat(local))?0:parseFloat(local);setLocal(String(f));prev.current=f;onChange(f);}}
          onKeyDown={e=>e.key==="Enter"&&e.target.blur()}
          style={{width:"100%",padding:unit?"9px 36px 9px 10px":"9px 10px",border:`1.5px solid ${focus?"#6366F1":"#E2E8F0"}`,borderRadius:7,fontSize:13.5,background:"#fff",color:"#0F172A",outline:"none",MozAppearance:"textfield",boxShadow:focus?"0 0 0 3px rgba(99,102,241,.1)":"none"}}/>
        {unit&&<span style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",fontSize:10.5,color:"#94A3B8",pointerEvents:"none"}}>{unit}</span>}
      </div>
    </div>
  );
}

function SelectInput({label,value,onChange,options}){
  return (
    <div style={{display:"flex",flexDirection:"column",gap:4}}>
      {label&&<label style={{fontSize:11.5,fontWeight:600,color:"#475569"}}>{label}</label>}
      <select value={value} onChange={e=>onChange(e.target.value)} style={{padding:"9px 10px",border:"1.5px solid #E2E8F0",borderRadius:7,fontSize:13.5,background:"#fff",color:"#0F172A",outline:"none",cursor:"pointer"}}>
        {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Section({icon:Icon,title,color="#6366F1",badge,children,defaultOpen=true}){
  const [open,setOpen]=useState(defaultOpen);
  return (
    <div style={{background:"#fff",borderRadius:14,border:"1px solid #E2E8F0",overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,.05)"}}>
      <button onClick={()=>setOpen(o=>!o)} type="button" style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"13px 16px",background:`${color}0D`,border:"none",borderBottom:open?"1px solid #E2E8F0":"none",cursor:"pointer"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:30,height:30,borderRadius:8,background:`${color}22`,display:"flex",alignItems:"center",justifyContent:"center"}}><Icon size={15} color={color}/></div>
          <span style={{fontFamily:"Plus Jakarta Sans,sans-serif",fontWeight:700,fontSize:13.5,color:"#0F172A"}}>{title}</span>
          {badge&&<span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:99,background:`${color}22`,color}}>{badge}</span>}
        </div>
        {open?<ChevronUp size={15} color="#94A3B8"/>:<ChevronDown size={15} color="#94A3B8"/>}
      </button>
      <AnimatePresence initial={false}>
        {open&&<motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} transition={{duration:.2}} style={{overflow:"hidden"}}><div style={{padding:"16px 16px 18px"}}>{children}</div></motion.div>}
      </AnimatePresence>
    </div>
  );
}

function ILTable({rows}){
  return (
    <div style={{overflowX:"auto",marginTop:10}}>
      <table style={{borderCollapse:"collapse",width:"100%",minWidth:640}}>
        <thead><tr><th style={{...thS,textAlign:"left"}}>Parameter</th>{BANDS.map(b=><th key={b} style={thS}>{b} Hz</th>)}</tr></thead>
        <tbody>
          {rows.map((row,ri)=>(
            <tr key={ri} style={{background:row.highlight?"#FFF9E6":ri%2===0?"#fff":"#F8FAFC"}}>
              <td style={{...tdL,color:row.color||"#334155",fontWeight:row.highlight?700:600}}>{row.label}</td>
              {(row.values||ZERO8()).map((v,ci)=><td key={ci} style={{...tdS,fontWeight:row.highlight?700:500,color:row.color||(row.highlight?"#92400E":"#334155")}}>{r2(v)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SWLTable({swlA,onSet}){
  const arr=BAND_KEYS.map(k=>Number(swlA[k])||0);
  const nonA=computeNonAWeighted(arr);
  return (
    <div style={{overflowX:"auto"}}>
      <table style={{borderCollapse:"collapse",width:"100%",minWidth:640}}>
        <thead><tr><th style={{...thS,textAlign:"left"}}>Parameter</th>{BANDS.map(b=><th key={b} style={thS}>{b} Hz</th>)}</tr></thead>
        <tbody>
          <tr>
            <td style={tdL}>Sound Power Level dB(A)</td>
            {BAND_KEYS.map(k=><td key={k} style={{...tdS,padding:"3px"}}><BandInput value={swlA[k]??0} onCommit={v=>onSet({...swlA,[k]:v})}/></td>)}
          </tr>
          <tr style={{background:"#F8FAFC"}}>
            <td style={tdL}>A-Weighting Correction</td>
            {A_WEIGHT_DISPLAY.map((v,i)=><td key={i} style={tdS}>{v}</td>)}
          </tr>
          <tr style={{background:"#E8F5E9"}}>
            <td style={{...tdL,color:"#1B5E20",fontWeight:700}}>Non A-Weighted SWL (dB)</td>
            {nonA.map((v,i)=><td key={i} style={{...tdS,color:"#1B5E20",fontWeight:700}}>{v}</td>)}
          </tr>
          <tr style={{background:"#FFF9E6"}}>
            <td style={{...tdL,color:"#92400E",fontWeight:700}}>ENV Correction Factor</td>
            {ENV_CF.map((v,i)=><td key={i} style={{...tdS,color:"#92400E",fontWeight:700}}>{v}</td>)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function RoomDistSelector({value,onChange}){
  return (
    <div style={{marginBottom:14}}>
      <p style={{fontSize:11.5,fontWeight:600,color:"#475569",margin:"0 0 8px"}}>Room / Distance Correction Method</p>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {[
          {v:"spaceRoom",label:"Space / Room Effect",    desc:"−10log(r)−5log(V)−3log(f)+12"},
          {v:"distEffect",label:"Distance Effect",        desc:"10·log(Q/4πr²) scalar"},
          {v:"none",      label:"None",                   desc:"No correction"},
        ].map(o=><button key={o.v} onClick={()=>onChange(o.v)} type="button"
          style={{padding:"7px 14px",borderRadius:9,fontSize:12.5,fontWeight:700,border:`1.5px solid ${value===o.v?"#6366F1":"#E2E8F0"}`,background:value===o.v?"#EEF2FF":"#F8FAFC",color:value===o.v?"#4338CA":"#64748B",cursor:"pointer",display:"flex",flexDirection:"column",gap:2}}>
          <span>{o.label}</span><span style={{fontSize:10,fontWeight:400,color:value===o.v?"#6366F1":"#94A3B8"}}>{o.desc}</span>
        </button>)}
      </div>
    </div>
  );
}

const emptyBand=()=>({hz63:0,hz125:0,hz250:0,hz500:0,hz1000:0,hz2000:0,hz4000:0,hz8000:0});

function defaultForm(){
  return {
    requiredNC:40,
    swlA:{hz63:34.6,hz125:38.5,hz250:43.2,hz500:49.4,hz1000:52.3,hz2000:50,hz4000:40.6,hz8000:30.1},
    // Path 1
    p1_on:true,
    p1_linedW:400, p1_linedH:300, p1_linedLen:1,
    p1_branchW:200, p1_branchH:150, p1_branchNum:1,  // branch duct + number of branches
    p1_unlinedW:200, p1_unlinedH:150, p1_unlinedLen:0.4,
    p1_flexW:200, p1_flexLen:1,
    p1_roomMode:"spaceRoom",
    p1_roomLen:2.4, p1_roomWid:9, p1_roomHei:2.7, p1_roomDist:1.5,
    p1_distDist:1, p1_distQ:2,
    // ERL = End Reflection Loss — diffuser (sheet: 1000x25mm, 1 no.) → NC-18 curve
    p1_erlW:1000, p1_erlH:25, p1_erlNum:1, p1_erlNC:"NC-18",
    // Path 2
    p2_on:true,
    p2_distDist:1, p2_distQ:2,
    p2_roomMode:"spaceRoom",
    p2_roomLen:2.4, p2_roomWid:9, p2_roomHei:2.7, p2_roomDist:1.5,
    p2_distDist2:1, p2_distQ2:2,
    // ERL for return grille (sheet: 1000x25mm, 1 no.) → NC-15 curve
    p2_erlW:1000, p2_erlH:25, p2_erlNum:1, p2_erlNC:"NC-15",
    // Path 3
    p3_on:true,
    p3_material:"12.5mm Gypsum Board",
    p3_roomMode:"spaceRoom",
    p3_roomLen:2.4, p3_roomWid:9, p3_roomHei:2.7, p3_roomDist:1.5,
    p3_distDist:1, p3_distQ:2,
  };
}

export default function FCUInputForm({project}){
  const [form,setForm]=useState(defaultForm);
  const [tab,setTab]=useState("input");
  const set=useCallback((k,v)=>setForm(f=>({...f,[k]:v})),[]);

  const SWL=computeNonAWeighted(BAND_KEYS.map(k=>Number(form.swlA[k])||0));
  const SWL_A_arr=BAND_KEYS.map(k=>Number(form.swlA[k])||0);

  // ── PATH 1 ──────────────────────────────────────────────────────────────────
  const p1_linedIL   = calcLinedIL(form.p1_linedW,form.p1_linedH,form.p1_linedLen);
  // Branch: upstream = lined duct dims (same duct before branch)
  const p1_branchDB  = calcBranchIL(form.p1_branchW,form.p1_branchH,form.p1_linedW,form.p1_linedH,form.p1_branchNum);
  const p1_unlinedIL = calcUnlinedIL(form.p1_unlinedW,form.p1_unlinedH,form.p1_unlinedLen);
  const p1_flexIL    = calcFlexIL(form.p1_flexW,form.p1_flexLen);
  const p1_roomEff   = getRoomEff(form.p1_roomMode,form.p1_roomLen,form.p1_roomWid,form.p1_roomHei,form.p1_roomDist,form.p1_distDist,form.p1_distQ);
  // Total Lp = SWL_nonA + ENV_CF + lined_IL + branch_DB + unlined_IL + flex_IL + room_eff
  const p1_totalLp   = SWL.map((_,i)=>r1(SWL[i]+ENV_CF[i]+p1_linedIL[i]+p1_branchDB+p1_unlinedIL[i]+p1_flexIL[i]+p1_roomEff[i]));
  // ERL (End Reflection Loss) = diffuser self-noise from NC-rating lookup
  const p1_erl       = getERL(form.p1_erlNC);
  // Final = logarithmic combination: 10·log10(10^(Lp/10) + 10^(ERL/10))
  const p1_final     = p1_totalLp.map((v,i)=>r2(10*Math.log10(Math.pow(10,v/10)+Math.pow(10,p1_erl[i]/10))));

  // ── PATH 2 ──────────────────────────────────────────────────────────────────
  // Path 2 uses SWL_A (original A-weighted) directly — per sheet row 30
  const p2_distEff   = calcDistEff(form.p2_distDist,form.p2_distQ);
  const p2_roomEff   = getRoomEff(form.p2_roomMode,form.p2_roomLen,form.p2_roomWid,form.p2_roomHei,form.p2_roomDist,form.p2_distDist2,form.p2_distQ2);
  // Total Lp = SWL_A + ENV_CF + dist_effect_FCU→RA + room_eff
  const p2_totalLp   = SWL_A_arr.map((_,i)=>r1(SWL_A_arr[i]+ENV_CF[i]+p2_distEff+p2_roomEff[i]));
  const p2_erl       = getERL(form.p2_erlNC);
  const p2_final     = p2_totalLp.map((v,i)=>r2(10*Math.log10(Math.pow(10,v/10)+Math.pow(10,p2_erl[i]/10))));

  // ── PATH 3 ──────────────────────────────────────────────────────────────────
  // No ENV_CF applied for radiated path (per sheet)
  const p3_ceilTL    = FALSE_CEILING[form.p3_material]||FALSE_CEILING["12.5mm Gypsum Board"];
  const p3_roomEff   = getRoomEff(form.p3_roomMode,form.p3_roomLen,form.p3_roomWid,form.p3_roomHei,form.p3_roomDist,form.p3_distDist,form.p3_distQ);
  // Total Lp = SWL_nonA + ceilTL + room_eff
  const p3_totalLp   = SWL.map((_,i)=>r1(SWL[i]+p3_ceilTL[i]+p3_roomEff[i]));

  // ── COMBINED ─────────────────────────────────────────────────────────────────
  // Log-add: Path1_final + Path2_final + Path3_totalLp
  const activePaths=[...(form.p1_on?[p1_final]:[]),...(form.p2_on?[p2_final]:[]),...(form.p3_on?[p3_totalLp]:[])];
  const combined=activePaths.length?logSum(activePaths):null;
  const calcNC=combined?calcNCRating(combined):null;
  const ncRow=NC_ROWS.find(r=>r.nc===Number(form.requiredNC))||NC_ROWS[5];
  const addlRed=combined?combined.map((v,i)=>r1(v-ncRow.left[i])):null;
  const ncPass=typeof calcNC==="number"&&calcNC<=Number(form.requiredNC);
  const ncColor=calcNC===null?"#64748B":ncPass?"#16A34A":"#DC2626";

  const TAB=({id,label})=>(
    <button onClick={()=>setTab(id)} type="button"
      style={{padding:"9px 20px",fontSize:13.5,fontWeight:tab===id?700:500,borderBottom:`2.5px solid ${tab===id?"#6366F1":"transparent"}`,color:tab===id?"#6366F1":"#64748B",background:"none",cursor:"pointer"}}>
      {label}
    </button>
  );

  const PathHeader=({color,textColor,borderColor,bg,icon:Icon,label,onKey})=>(
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px",background:bg,borderRadius:"12px 12px 0 0",border:`1px solid ${borderColor}`,borderBottom:"none"}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}><Icon size={16} color={color}/><span style={{fontFamily:"Plus Jakarta Sans,sans-serif",fontWeight:800,fontSize:14,color:textColor}}>{label}</span></div>
      <button onClick={()=>set(onKey,!form[onKey])} type="button"
        style={{padding:"4px 14px",borderRadius:99,fontSize:12,fontWeight:700,border:`1.5px solid ${form[onKey]?color:"#CBD5E1"}`,background:form[onKey]?bg:"#F8FAFC",color:form[onKey]?textColor:"#94A3B8",cursor:"pointer"}}>
        {form[onKey]?"✓ ON":"OFF"}
      </button>
    </div>
  );

  function RoomInputs({pf,mode,ddk,dqk}){
    const dk=ddk||`${pf}distDist`, qk=dqk||`${pf}distQ`;
    if(mode==="spaceRoom") return (
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,margin:"10px 0"}}>
        <NumInput label="Room Length (m)" value={form[`${pf}roomLen`]} unit="m" onChange={v=>set(`${pf}roomLen`,v)}/>
        <NumInput label="Room Width (m)"  value={form[`${pf}roomWid`]} unit="m" onChange={v=>set(`${pf}roomWid`,v)}/>
        <NumInput label="Room Height (m)" value={form[`${pf}roomHei`]} unit="m" onChange={v=>set(`${pf}roomHei`,v)}/>
        <NumInput label="Dist to Receiver (m)" value={form[`${pf}roomDist`]} unit="m" onChange={v=>set(`${pf}roomDist`,v)}/>
      </div>
    );
    if(mode==="distEffect") return (
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 2fr",gap:10,margin:"10px 0"}}>
        <NumInput label="Distance (m)" value={form[dk]||1} unit="m" onChange={v=>set(dk,v)}/>
        <NumInput label="Directivity Q" value={form[qk]||2} step={1} onChange={v=>set(qk,v)}/>
        <div style={{display:"flex",alignItems:"flex-end",paddingBottom:4}}><span style={{fontSize:12,color:"#475569"}}>= <strong style={{color:"#6366F1"}}>{r2(calcDistEff(form[dk]||1,form[qk]||2))} dB</strong></span></div>
      </div>
    );
    return <p style={{fontSize:12,color:"#94A3B8",margin:"8px 0"}}>No room/distance correction.</p>;
  }

  const InputTab=(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>

      <Section icon={Info} title="Criteria" color="#6366F1">
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <SelectInput label="Required NC Level" value={String(form.requiredNC)} onChange={v=>set("requiredNC",Number(v))} options={NC_ROWS.map(r=>({value:String(r.nc),label:`NC ${r.nc}`}))}/>
          <div style={{display:"flex",alignItems:"center"}}><div style={{padding:"10px 14px",borderRadius:9,background:"#EEF2FF",border:"1.5px solid #C7D2FE"}}><span style={{fontSize:12,color:"#64748B"}}>Method: </span><span style={{fontSize:13,fontWeight:700,color:"#4338CA"}}>Same Room</span></div></div>
        </div>
      </Section>

      <Section icon={Waves} title="Sound Power Level" color="#6366F1">
        <p style={{fontSize:12,color:"#64748B",margin:"0 0 10px"}}>Enter octave band SWL in <strong>dB(A)</strong>. Non-A-weighted SWL is computed automatically.</p>
        <SWLTable swlA={form.swlA} onSet={v=>set("swlA",v)}/>
      </Section>

      {/* ═══════════ PATH 1 — SUPPLY DUCT ═══════════ */}
      <div style={{borderLeft:"3px solid #0E9F8E",borderRadius:"0 12px 12px 0"}}>
        <PathHeader color="#0E9F8E" textColor="#065F46" borderColor="#A7F3D0" bg="#E3F8F5" icon={Wind} label="Path 1 — Supply Duct" onKey="p1_on"/>
        {form.p1_on&&<div style={{border:"1px solid #A7F3D0",borderTop:"none",borderRadius:"0 0 12px 12px",padding:"14px",display:"flex",flexDirection:"column",gap:12}}>

          {/* Lined Duct */}
          <Section icon={Wind} title="Lined Duct — Insertion Loss" color="#0E9F8E">
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:10}}>
              <NumInput label="Width (mm)"  value={form.p1_linedW}   step={1} unit="mm" onChange={v=>set("p1_linedW",v)}/>
              <NumInput label="Height (mm)" value={form.p1_linedH}   step={1} unit="mm" onChange={v=>set("p1_linedH",v)}/>
              <NumInput label="Length (m)"  value={form.p1_linedLen}         unit="m"  onChange={v=>set("p1_linedLen",v)}/>
            </div>
            <ILTable rows={[{label:"Lined Duct IL (dB)",values:p1_linedIL,color:"#0E9F8E"}]}/>
          </Section>

          {/* Branch Power Division */}
          <Section icon={Zap} title="Branch Power Division" color="#0E9F8E" badge="10·log(A₂/[A_up+A₂])">
            <p style={{fontSize:12,color:"#64748B",margin:"0 0 10px"}}>
              Branch duct dimensions. Upstream = lined duct ({form.p1_linedW}×{form.p1_linedH} mm).
            </p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:10}}>
              <NumInput label="Branch Width (mm)"  value={form.p1_branchW} step={1} unit="mm" onChange={v=>set("p1_branchW",v)}/>
              <NumInput label="Branch Height (mm)" value={form.p1_branchH} step={1} unit="mm" onChange={v=>set("p1_branchH",v)}/>
              <NumInput label="Number of Branches" value={form.p1_branchNum} step={1} min={1} onChange={v=>set("p1_branchNum",Math.max(1,Math.round(v)))}/>
            </div>
            <div style={{padding:"10px 14px",borderRadius:9,background:"#E3F8F5",border:"1px solid #A7F3D0",marginBottom:10}}>
              <span style={{fontSize:12.5,color:"#065F46"}}>
                A_branch = {r2(mmToFt(form.p1_branchW)*mmToFt(form.p1_branchH))} ft²&nbsp;|&nbsp;
                A_upstream = {r2(mmToFt(form.p1_linedW)*mmToFt(form.p1_linedH))} ft²&nbsp;|&nbsp;
                No. of branches = {form.p1_branchNum}&nbsp;|&nbsp;
                <strong>Branch IL = {r2(p1_branchDB)} dB</strong>
              </span>
            </div>
            <ILTable rows={[{label:`Branch Power Division (dB) [×${form.p1_branchNum} branch${form.p1_branchNum>1?"es":""}]`,values:BANDS.map(()=>p1_branchDB)}]}/>
          </Section>

          {/* Un-Lined Duct */}
          <Section icon={Wind} title="Un-Lined Duct — Insertion Loss" color="#0E9F8E">
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:10}}>
              <NumInput label="Width (mm)"  value={form.p1_unlinedW}   step={1} unit="mm" onChange={v=>set("p1_unlinedW",v)}/>
              <NumInput label="Height (mm)" value={form.p1_unlinedH}   step={1} unit="mm" onChange={v=>set("p1_unlinedH",v)}/>
              <NumInput label="Length (m)"  value={form.p1_unlinedLen}          unit="m"  onChange={v=>set("p1_unlinedLen",v)}/>
            </div>
            <ILTable rows={[{label:"Un-Lined Duct IL (dB)",values:p1_unlinedIL,color:"#0E9F8E"}]}/>
          </Section>

          {/* Flexible Duct */}
          <Section icon={Wind} title="Flexible Duct — Insertion Loss" color="#0E9F8E">
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <SelectInput label="Flex Duct Diameter (mm)" value={String(form.p1_flexW)} onChange={v=>set("p1_flexW",Number(v))} options={FLEX_TABLE.map(r=>({value:String(r.w),label:`Ø${r.w} mm`}))}/>
              <NumInput label="Length (m)" value={form.p1_flexLen} unit="m" onChange={v=>set("p1_flexLen",v)}/>
            </div>
            <div style={{fontSize:11.5,color:"#64748B",marginBottom:8}}>Per-metre IL: [{getFlexPerMetre(form.p1_flexW).join(", ")}] dB/m</div>
            <ILTable rows={[{label:"Flexible Duct IL (dB)",values:p1_flexIL,color:"#0E9F8E"}]}/>
          </Section>

          {/* Space/Room Effect */}
          <Section icon={Layers} title="Space / Room Effect @ Receiver (POINT SOURCE)" color="#0E9F8E">
            <RoomDistSelector value={form.p1_roomMode} onChange={v=>set("p1_roomMode",v)}/>
            <RoomInputs pf="p1_" mode={form.p1_roomMode}/>
            {form.p1_roomMode!=="none"&&<ILTable rows={[{label:form.p1_roomMode==="spaceRoom"?"Space/Room Effect (dB)":"Distance Effect (dB)",values:p1_roomEff,color:"#0E9F8E"}]}/>}
          </Section>

          {/* ERL — End Reflection Factor */}
          <Section icon={Calculator} title="End Reflection Factor (ERL) — Diffuser / Grill" color="#0E9F8E">
            <p style={{fontSize:12,color:"#64748B",margin:"0 0 10px"}}>
              Diffuser self-noise by NC rating (per AAPL sheet). Log-combined with Total Lp for final result.
            </p>
            {/* Sheet columns: Width (mm) | Height (mm) | No. — matching sheet row 24 layout */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:10}}>
              <NumInput label="Diffuser Width (mm)"  value={form.p1_erlW} step={1} unit="mm" onChange={v=>set("p1_erlW",v)}/>
              <NumInput label="Diffuser Height (mm)" value={form.p1_erlH} step={1} unit="mm" onChange={v=>set("p1_erlH",v)}/>
              <NumInput label="No. of Diffusers"     value={form.p1_erlNum} step={1} min={1} onChange={v=>set("p1_erlNum",Math.max(1,Math.round(v)))}/>
              <SelectInput label="NC Rating" value={form.p1_erlNC} onChange={v=>set("p1_erlNC",v)} options={Object.keys(ERL_TABLE).map(k=>({value:k,label:k}))}/>
            </div>
            <ILTable rows={[{label:`End Reflection Factor — ${form.p1_erlNC} (dB)`,values:p1_erl,color:"#0E9F8E"}]}/>
          </Section>

        </div>}
      </div>

      {/* ═══════════ PATH 2 — RETURN PATH ═══════════ */}
      <div style={{borderLeft:"3px solid #3B82F6",borderRadius:"0 12px 12px 0"}}>
        <PathHeader color="#3B82F6" textColor="#1E40AF" borderColor="#BFDBFE" bg="#EFF6FF" icon={Wind} label="Path 2 — Return Path" onKey="p2_on"/>
        {form.p2_on&&<div style={{border:"1px solid #BFDBFE",borderTop:"none",borderRadius:"0 0 12px 12px",padding:"14px",display:"flex",flexDirection:"column",gap:12}}>

          {/* Distance Effect FCU → R/A Grill */}
          <Section icon={Zap} title="Space / Distance Effect in R/A Duct to Grill Path" color="#3B82F6" badge="10·log(Q/4πr²)">
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 2fr",gap:10,marginBottom:10}}>
              <NumInput label="Distance FCU→R/A Grill (m)" value={form.p2_distDist} unit="m" onChange={v=>set("p2_distDist",v)}/>
              <NumInput label="Directivity Q" value={form.p2_distQ} step={1} onChange={v=>set("p2_distQ",v)}/>
              <div style={{display:"flex",alignItems:"flex-end",paddingBottom:4}}>
                <span style={{fontSize:12,color:"#475569"}}>= <strong style={{color:"#3B82F6"}}>{r2(p2_distEff)} dB</strong> per band</span>
              </div>
            </div>
            <ILTable rows={[{label:"Distance Effect IL (dB)",values:BANDS.map(()=>p2_distEff),color:"#3B82F6"}]}/>
          </Section>

          {/* Space/Room Effect */}
          <Section icon={Layers} title="Space / Room Effect @ Receiver (POINT SOURCE)" color="#3B82F6">
            <RoomDistSelector value={form.p2_roomMode} onChange={v=>set("p2_roomMode",v)}/>
            <RoomInputs pf="p2_" mode={form.p2_roomMode} ddk="p2_distDist2" dqk="p2_distQ2"/>
            {form.p2_roomMode!=="none"&&<ILTable rows={[{label:form.p2_roomMode==="spaceRoom"?"Space/Room Effect (dB)":"Distance Effect (dB)",values:p2_roomEff,color:"#3B82F6"}]}/>}
          </Section>

          {/* ERL — Return Grill */}
          <Section icon={Calculator} title="End Reflection Factor (ERL) — R/A Grill" color="#3B82F6">
            <p style={{fontSize:12,color:"#64748B",margin:"0 0 10px"}}>
              Grill self-noise by NC rating. Log-combined with Total Lp for final result.
            </p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:10}}>
              <NumInput label="Grill Width (mm)"  value={form.p2_erlW} step={1} unit="mm" onChange={v=>set("p2_erlW",v)}/>
              <NumInput label="Grill Height (mm)" value={form.p2_erlH} step={1} unit="mm" onChange={v=>set("p2_erlH",v)}/>
              <NumInput label="No. of Grills"     value={form.p2_erlNum} step={1} min={1} onChange={v=>set("p2_erlNum",Math.max(1,Math.round(v)))}/>
              <SelectInput label="NC Rating" value={form.p2_erlNC} onChange={v=>set("p2_erlNC",v)} options={Object.keys(ERL_TABLE).map(k=>({value:k,label:k}))}/>
            </div>
            <ILTable rows={[{label:`End Reflection Factor — ${form.p2_erlNC} (dB)`,values:p2_erl,color:"#3B82F6"}]}/>
          </Section>

        </div>}
      </div>

      {/* ═══════════ PATH 3 — RADIATED PATH ═══════════ */}
      <div style={{borderLeft:"3px solid #8B5CF6",borderRadius:"0 12px 12px 0"}}>
        <PathHeader color="#8B5CF6" textColor="#5B21B6" borderColor="#DDD6FE" bg="#F5F3FF" icon={Layers} label="Path 3 — Radiated Path / False Ceiling" onKey="p3_on"/>
        {form.p3_on&&<div style={{border:"1px solid #DDD6FE",borderTop:"none",borderRadius:"0 0 12px 12px",padding:"14px",display:"flex",flexDirection:"column",gap:12}}>

          {/* False Ceiling TL */}
          <Section icon={Layers} title="False Ceiling — Transmission Loss" color="#8B5CF6">
            <div style={{marginBottom:10}}>
              <SelectInput label="False Ceiling Material" value={form.p3_material} onChange={v=>set("p3_material",v)} options={Object.keys(FALSE_CEILING).map(k=>({value:k,label:k}))}/>
            </div>
            <ILTable rows={[{label:`TL — ${form.p3_material}`,values:p3_ceilTL,color:"#8B5CF6"}]}/>
          </Section>

          {/* Space/Room Effect */}
          <Section icon={Layers} title="Space / Room Effect @ Receiver (POINT SOURCE)" color="#8B5CF6">
            <RoomDistSelector value={form.p3_roomMode} onChange={v=>set("p3_roomMode",v)}/>
            <RoomInputs pf="p3_" mode={form.p3_roomMode}/>
            {form.p3_roomMode!=="none"&&<ILTable rows={[{label:form.p3_roomMode==="spaceRoom"?"Space/Room Effect (dB)":"Distance Effect (dB)",values:p3_roomEff,color:"#8B5CF6"}]}/>}
          </Section>

        </div>}
      </div>
    </div>
  );

  const ResultsTab=(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>

      {/* PATH 1 RESULTS */}
      {form.p1_on&&<Section icon={Wind} title="Path 1 — Supply Duct" color="#0E9F8E">
        <ILTable rows={[
          {label:"Sound Power Level (non A-wtd) dB",          values:SWL},
          {label:"Environmental Correction Factor",             values:ENV_CF},
          {label:"Lined Duct Insertion Loss (dB)",              values:p1_linedIL},
          {label:"Branch Power Division (dB)",                  values:BANDS.map(()=>p1_branchDB)},
          {label:"Un-Lined Duct Insertion Loss (dB)",           values:p1_unlinedIL},
          {label:"Flexible Duct Insertion Loss (dB)",           values:p1_flexIL},
          {label:form.p1_roomMode==="spaceRoom"?"Space/Room Effect @ Receiver (dB)":"Distance Effect (dB)",values:p1_roomEff},
          {label:"Total Transmission Loss Lp @ Receiver (dB)", values:p1_totalLp,highlight:true},
          {label:`End Reflection Factor (${form.p1_erlNC}) — Grill/Diffuser`,values:p1_erl},
          {label:"Calculated Final Noise (dB)",                 values:p1_final,highlight:true,color:"#065F46"},
        ]}/>
      </Section>}

      {/* PATH 2 RESULTS */}
      {form.p2_on&&<Section icon={Wind} title="Path 2 — Return Path" color="#3B82F6">
        <ILTable rows={[
          {label:"Sound Power Level dB(A)",                             values:SWL_A_arr},
          {label:"Environmental Correction Factor",                      values:ENV_CF},
          {label:"Space/Distance Effect in R/A Duct to Grill (dB)",    values:BANDS.map(()=>p2_distEff)},
          {label:form.p2_roomMode==="spaceRoom"?"Space/Room Effect @ Receiver (dB)":"Distance Effect (dB)",values:p2_roomEff},
          {label:"Total Transmission Loss Lp @ Receiver (dB)",          values:p2_totalLp,highlight:true},
          {label:`End Reflection Factor (${form.p2_erlNC}) — Grill/Diffuser`,values:p2_erl},
          {label:"Calculated Final Noise (dB)",                          values:p2_final,highlight:true,color:"#1E40AF"},
        ]}/>
      </Section>}

      {/* PATH 3 RESULTS */}
      {form.p3_on&&<Section icon={Layers} title="Path 3 — Radiated Path" color="#8B5CF6">
        <ILTable rows={[
          {label:"Sound Power Level (non A-wtd) dB",                    values:SWL},
          {label:`Transmission Loss — ${form.p3_material}`,              values:p3_ceilTL},
          {label:form.p3_roomMode==="spaceRoom"?"Space/Room Effect @ Receiver (dB)":"Distance Effect (dB)",values:p3_roomEff},
          {label:"Total Transmission Loss Lp @ Receiver (dB)",           values:p3_totalLp,highlight:true,color:"#5B21B6"},
        ]}/>
      </Section>}

      {/* COMBINED — Logarithmic Addition */}
      {combined&&<Section icon={Calculator} title="Combination of Path Results — Logarithmic Addition" color="#6366F1">
        <ILTable rows={[
          ...(form.p1_on?[{label:"Path 1 — Supply Duct  (Calculated Final Noise)",   values:p1_final,color:"#065F46"}]:[]),
          ...(form.p2_on?[{label:"Path 2 — Return Path  (Calculated Final Noise)",   values:p2_final,color:"#1E40AF"}]:[]),
          ...(form.p3_on?[{label:"Path 3 — Radiated Path  (Total Lp @ Receiver)",    values:p3_totalLp,color:"#5B21B6"}]:[]),
          {label:"Total Lp at Receiver Location (dB)",   values:combined,highlight:true},
          {label:`Required Noise Level: NC ${form.requiredNC} (dB)`,values:ncRow.left,color:"#1D4ED8"},
          {label:"Additional dB Reduction Required",      values:(addlRed||[]).map(v=>r1(v)),color:(addlRed||[]).some(v=>v>0)?"#DC2626":"#16A34A"},
        ]}/>

        {/* NC Assessment */}
        <div style={{marginTop:20,borderRadius:12,overflow:"hidden",border:`2px solid ${ncColor}`}}>
          {/* NC Curve Table */}
          <div style={{overflowX:"auto"}}>
            <table style={{borderCollapse:"collapse",width:"100%",minWidth:640}}>
              <thead>
                <tr style={{background:ncPass?"#F0FDF4":"#FEF2F2"}}>
                  <th style={{...thS,textAlign:"left",background:"transparent",color:ncColor}}>NC Assessment</th>
                  {BANDS.map(b=><th key={b} style={{...thS,background:"transparent",color:ncColor}}>{b} Hz</th>)}
                </tr>
              </thead>
              <tbody>
                <tr><td style={tdL}>Total Lp at Receiver (dB)</td>{combined.map((v,i)=><td key={i} style={tdS}>{r2(v)}</td>)}</tr>
                <tr style={{background:"#F8FAFC"}}><td style={{...tdL,color:"#1D4ED8"}}>NC {form.requiredNC} Curve (dB)</td>{ncRow.left.map((v,i)=><td key={i} style={{...tdS,color:"#1D4ED8",fontWeight:600}}>{v}</td>)}</tr>
                <tr style={{background:(addlRed||[]).some(v=>v>0)?"#FEF2F2":"#F0FDF4"}}>
                  <td style={{...tdL,color:(addlRed||[]).some(v=>v>0)?"#DC2626":"#16A34A"}}>Additional Reduction Required (dB)</td>
                  {(addlRed||[]).map((v,i)=><td key={i} style={{...tdS,fontWeight:700,color:(addlRed||[])[i]>0?"#DC2626":"#16A34A"}}>{r1(v)}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
          {/* NC Result Banner */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px",background:ncPass?"#F0FDF4":"#FEF2F2"}}>
            <div>
              <p style={{fontFamily:"Plus Jakarta Sans,sans-serif",fontWeight:800,fontSize:18,color:ncColor,margin:0}}>
                Calculated NC Level: <span style={{fontSize:22}}>NC {calcNC}</span>
              </p>
              <p style={{fontSize:13,color:"#64748B",margin:"4px 0 0"}}>Required: NC {form.requiredNC}</p>
            </div>
            <span style={{fontSize:28,fontWeight:900,color:ncColor,fontFamily:"Plus Jakarta Sans,sans-serif"}}>{ncPass?"✓ PASS":"✗ FAIL"}</span>
          </div>
        </div>
      </Section>}
    </div>
  );

  return (
    <div style={{fontFamily:"Inter,sans-serif",padding:"0 0 40px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div>
          <h2 style={{fontFamily:"Plus Jakarta Sans,sans-serif",fontWeight:800,fontSize:18,color:"#0F172A",margin:0}}>FCU — Duct-Borne Noise Assessment</h2>
          <p style={{fontSize:13,color:"#64748B",margin:"4px 0 0"}}>Same Room Method · AAPL Acoustic Calculation Sheet</p>
        </div>
        {calcNC!==null&&<div style={{padding:"8px 18px",borderRadius:99,fontWeight:800,fontSize:14,fontFamily:"Plus Jakarta Sans,sans-serif",background:ncPass?"#F0FDF4":"#FEF2F2",color:ncColor,border:`2px solid ${ncColor}`}}>NC {calcNC} {ncPass?"✓ PASS":"✗ FAIL"}</div>}
      </div>
      <div style={{display:"flex",borderBottom:"1.5px solid #E2E8F0",marginBottom:20,gap:4}}>
        <TAB id="input" label="Input Form"/>
        <TAB id="results" label="Calculation Results"/>
      </div>
      {tab==="input"&&InputTab}
      {tab==="results"&&ResultsTab}
    </div>
  );
}
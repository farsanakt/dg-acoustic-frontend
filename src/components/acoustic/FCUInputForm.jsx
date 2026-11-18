import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wind, Waves, ChevronDown, ChevronUp, Calculator, Layers, Zap } from "lucide-react";

const BANDS     = [63, 125, 250, 500, 1000, 2000, 4000, 8000];
const BAND_KEYS = ["hz63","hz125","hz250","hz500","hz1000","hz2000","hz4000","hz8000"];

const A_WEIGHT_STD     = [-26.2,-16.1,-8.6,-3.2,0,1.2,1.0,-1.1];
const A_WEIGHT_DISPLAY = [26.2,16.1,8.6,3.2,0,-1.2,-1.0,1.1];
const ENV_CF           = [-4,-2,-1,0,0,0,0,0];

const LINED_DEFAULT = {
  A: [0.04, 0.08, 0.14, 0.22, 0.32, 0.40, 0.53, 0.53],
  B: [1.959, 1.41, 0.824, 0.5, 0.695, 0.802, 0.451, 0.219],
  C: [0.917, 0.941, 1.079, 1.087, 0, 0, 0, 0],
};

const ELBOW_WIDTH_BREAKS = [200, 400, 800];
const ELBOW_UNLINED_TBL = [
  [0,0,0,1,5,8,4,3],
  [0,1,5,5,8,4,3,3],
  [0,5,5,8,4,3,3,3],
  [1,5,8,4,3,3,3,3],
];
const ELBOW_LINED_TBL = [
  [0,0,0,1,6,11,10,10],
  [0,1,6,6,11,10,10,10],
  [0,6,6,11,10,10,10,10],
  [1,6,11,10,10,10,10,10],
];

const FLEX_TABLE=[
  {w:150,il:[2.0,3.0,4.0,8.0,10.0,10.0,7.0,7.0]},
  {w:160,il:[2.0,3.0,4.0,8.0,10.0,10.0,7.0,7.0]},
  {w:200,il:[2.0,3.0,5.0,8.0, 9.0, 8.0,6.0,6.0]},
  {w:250,il:[2.0,3.0,6.0,8.0, 9.0, 9.0,5.0,5.0]},
  {w:300,il:[2.0,2.0,5.0,8.0, 9.0, 8.0,5.0,5.0]},
];

const FALSE_CEILING={
  "12.5mm Gypsum Board":                    [-18,-21,-25,-25,-27,-27,-28,-28],
  "12.5mm Gypsum Board (transition)":       [-18,-21,-25,-25,-27,-27,-28,-28],
  "12.5mm RG Plasterboard + 25mm absorber": [-18,-22,-27,-28,-31,-32,-33,-33],
  "9mm Plasterboard":                       [-14,-17,-21,-23,-26,-27,-28,-28],
  "15mm Gypsum Board":                      [-20,-23,-27,-28,-30,-30,-31,-31],
};

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
// ERL Case 2 (NC Sheet Method): IL per band = SWL_band - NC_criterion_band (logarithmic subtraction perspective)
// The grill end reflection needed so that radiated sound equals the NC criterion per band
function calcERLNC(swlArr, ncRating){
  const nc=ERL_TABLE[ncRating]||ERL_TABLE["NC-18"];
  return swlArr.map((swl,i)=>r2(nc[i]-swl)); // positive = NC limit is above SWL (no attenuation needed), negative = attenuation needed
}

// ERL Case 1 (DG Method): End Reflection Loss from duct opening dimensions
// Formula: ERL = 10·log10[1 + (a1·c0 / (π·f·D))²] × −1
// D = sqrt(4·Area/π) in ft  (effective diameter)
// a1 = 0.7, c0 = 1125.33 ft/s
function calcERLAcoustic(w_mm, h_mm){
  const W_ft=(w_mm||0)/304.8, H_ft=(h_mm||0)/304.8;
  if(!W_ft||!H_ft) return ZERO8();
  const A_ft2=W_ft*H_ft;
  const D_ft=Math.sqrt(4*A_ft2/Math.PI);
  const c0=1125.33, a1=0.7;
  return BANDS.map(f=>{
    if(f<=0||D_ft<=0) return 0;
    const term=(a1*c0)/(Math.PI*f*D_ft);
    return r2(10*Math.log10(1+term*term)*-1);
  });
}

function getElbowRowIdx(width_mm){
  const w=Number(width_mm)||0;
  if(w<=200) return 0; if(w<=400) return 1; if(w<=800) return 2; return 3;
}
function mmToFt(mm){return (mm||0)/304.8;}
function mToFt(m){return (m||0)*3.28084;}
function r2(n){return Math.round(n*100)/100;}
function r1(n){return Math.round(n*10)/10;}
const ZERO8=()=>BANDS.map(()=>0);
const emptyCoeffA=()=>({hz63:0,hz125:0,hz250:0,hz500:0,hz1000:0,hz2000:0,hz4000:0,hz8000:0});

function computeNonAWeighted(arr){ return arr.map((v,i)=>r1((v||0)-A_WEIGHT_STD[i])); }

function calcLinedIL(w_mm,h_mm,len_m,thickness_in,coeffAOverride){
  const W=mmToFt(w_mm),H=mmToFt(h_mm),L=mToFt(len_m),t=Number(thickness_in)||1;
  if(!W||!H||!L) return ZERO8();
  const P=2*(W+H),S=W*H,PS=P/S;
  return BANDS.map((_,i)=>{
    const k=BAND_KEYS[i];
    const A=(coeffAOverride&&Number(coeffAOverride[k])!==0)?Number(coeffAOverride[k]):LINED_DEFAULT.A[i];
    const B=LINED_DEFAULT.B[i],C=LINED_DEFAULT.C[i],tC=C!==0?Math.pow(t,C):1;
    return r2(-A*Math.pow(PS,B)*tC*L);
  });
}
function calcUnlinedIL(w_mm,h_mm,len_m){
  const W=mmToFt(w_mm),H=mmToFt(h_mm),L=mToFt(len_m);
  if(!W||!H||!L) return ZERO8();
  const P=2*(W+H),S=W*H,PS=P/S;
  return BANDS.map(f=>{
    const il=PS>=3?-17.0*Math.pow(PS,-0.25)*Math.pow(f,-0.85)*L:-1.64*Math.pow(PS,0.73)*Math.pow(f,-0.58)*L;
    return r2(il);
  });
}
function calcElbowIL(width_mm,numElbows,lined){
  const n=Number(numElbows)||0; if(n<=0) return ZERO8();
  const ri=getElbowRowIdx(width_mm),tbl=lined?ELBOW_LINED_TBL:ELBOW_UNLINED_TBL;
  return tbl[ri].map(v=>r2(-v*n));
}
function calcBranchIL(bW,bH,upW,upH){
  const Ab=mmToFt(bW)*mmToFt(bH),Au=mmToFt(upW)*mmToFt(upH);
  if(Ab<=0||Au<=0) return 0;
  return r2(10*Math.log10(Ab/(Au+Ab)));
}
function getFlexPerMetre(w_mm){
  const w=Number(w_mm)||200; let best=FLEX_TABLE[0],minD=Math.abs(w-best.w);
  for(const r of FLEX_TABLE){const d=Math.abs(w-r.w);if(d<minD){minD=d;best=r;}} return best.il;
}
function calcFlexIL(w_mm,len_m){ return getFlexPerMetre(w_mm).map(v=>r2(-v*Number(len_m||0))); }
function calcSchultz(len,wid,hei,dist){
  const V=Number(len)*Number(wid)*Number(hei),r=Math.max(0.01,Number(dist)||1.5);
  if(V<=0) return ZERO8();
  return BANDS.map(f=>r2(-10*Math.log10(r)-5*Math.log10(V)-3*Math.log10(f)+12));
}
function calcDistEff(dist,Q=2){
  const r=Math.max(0.01,Number(dist)||1);
  return r2(10*Math.log10(Number(Q)/(4*Math.PI*r*r)));
}
function logSum(arrays){
  if(!arrays||!arrays.length) return ZERO8();
  return BANDS.map((_,i)=>r1(10*Math.log10(arrays.reduce((s,a)=>s+Math.pow(10,(a[i]||0)/10),0))));
}
function calcNCRating(lp){
  for(const row of NC_ROWS){ if(!lp.some((v,i)=>v>row.left[i])) return row.nc; } return ">65";
}
// SPL → SWL conversion: SWL = SPL + 20·log10(r) + 11  (hemispherical free field, Q=2)
function splToSwl(splArr, r_m){
  const r=Math.max(0.01,Number(r_m)||1);
  const corr=20*Math.log10(r)+11;
  return splArr.map(v=>r2((v||0)+corr));
}
// SWL dB (non-A) → SWL dB(A): add A-weight
function swlToSwlA(swlArr){ return swlArr.map((v,i)=>r2((v||0)+A_WEIGHT_STD[i])); }
// SWL dB(A) → SWL dB (non-A): subtract A-weight
function swlAToSwl(swlArr){ return swlArr.map((v,i)=>r2((v||0)-A_WEIGHT_STD[i])); }

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
  const commit=()=>{setFocus(false);const f=isNaN(parseFloat(local))?0:parseFloat(local);setLocal(String(f));prev.current=f;onCommit(f);};
  return <input type="number" value={local} step="0.1"
    onFocus={e=>{setFocus(true);setLocal(String(value??0));setTimeout(()=>e.target.select(),0);}}
    onChange={e=>setLocal(e.target.value)}
    onBlur={commit}
    onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();commit();e.target.blur();}else if(e.key==="Tab"){commit();}}}
    style={{width:"100%",padding:"7px 4px",border:`1.5px solid ${focus?"#6366F1":"#E2E8F0"}`,borderRadius:6,fontSize:12.5,fontWeight:600,color:"#0F172A",background:"#fff",outline:"none",textAlign:"center",MozAppearance:"textfield",boxShadow:focus?"0 0 0 3px rgba(99,102,241,.1)":"none"}}/>;
}

function NumInput({label,value,onChange,unit,step=0.1,min}){
  const [local,setLocal]=useState(String(value??0));
  const [focus,setFocus]=useState(false);
  const prev=useRef(value);
  useEffect(()=>{if(!focus&&prev.current!==value){prev.current=value;setLocal(String(value??0));}},[value,focus]);
  const commit=()=>{setFocus(false);const f=isNaN(parseFloat(local))?0:parseFloat(local);setLocal(String(f));prev.current=f;onChange(f);};
  return (
    <div style={{display:"flex",flexDirection:"column",gap:4}}>
      {label&&<label style={{fontSize:11.5,fontWeight:600,color:"#475569"}}>{label}</label>}
      <div style={{position:"relative"}}>
        <input type="number" value={focus?local:String(value??0)} min={min} step={step}
          onFocus={e=>{setFocus(true);setLocal(String(value??0));setTimeout(()=>e.target.select(),0);}}
          onChange={e=>setLocal(e.target.value)}
          onBlur={commit}
          onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();commit();e.target.blur();}else if(e.key==="Tab"){commit();}}}
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

function Section({icon:Icon,title,color="#6366F1",badge,children,defaultOpen=true,onToggle,isOn}){
  const [open,setOpen]=useState(defaultOpen);
  const hasToggle=onToggle!==undefined;
  return (
    <div style={{background:"#fff",borderRadius:14,border:"1px solid #E2E8F0",overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,.05)"}}>
      <button onClick={()=>setOpen(o=>!o)} type="button" style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"13px 16px",background:`${color}0D`,border:"none",borderBottom:open?"1px solid #E2E8F0":"none",cursor:"pointer"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:30,height:30,borderRadius:8,background:`${color}22`,display:"flex",alignItems:"center",justifyContent:"center"}}><Icon size={15} color={color}/></div>
          <span style={{fontFamily:"Plus Jakarta Sans,sans-serif",fontWeight:700,fontSize:13.5,color:"#0F172A"}}>{title}</span>
          {badge&&<span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:99,background:`${color}22`,color}}>{badge}</span>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {hasToggle&&<div onClick={e=>{e.stopPropagation();onToggle();}} style={{display:"flex",alignItems:"center",gap:0,borderRadius:99,border:`1.5px solid ${isOn?color:"#CBD5E1"}`,overflow:"hidden",fontSize:11,fontWeight:700,cursor:"pointer"}}>
            <span style={{padding:"3px 10px",background:isOn?color:"#F8FAFC",color:isOn?"#fff":"#94A3B8",transition:"all .15s"}}>ON</span>
            <span style={{padding:"3px 10px",background:!isOn?"#64748B":"#F8FAFC",color:!isOn?"#fff":"#94A3B8",transition:"all .15s"}}>OFF</span>
          </div>}
          {open?<ChevronUp size={15} color="#94A3B8"/>:<ChevronDown size={15} color="#94A3B8"/>}
        </div>
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
          {rows.map((row,ri)=>{
            const isTotal=row.highlight==="total",isFinal=row.highlight==="final"||(row.highlight===true&&row.color),isHL=row.highlight===true&&!row.color;
            const bg=isTotal?"#FFF3E0":isFinal?"#E8F5E9":isHL?"#FFF9E6":ri%2===0?"#fff":"#F8FAFC";
            const fw=(isTotal||isFinal||isHL)?800:600;
            const textCol=isTotal?"#B45309":isFinal?(row.color||"#15803D"):isHL?"#92400E":(row.color||"#334155");
            return (
              <tr key={ri} style={{background:bg}}>
                <td style={{...tdL,color:textCol,fontWeight:fw,borderLeft:isTotal?"3px solid #F59E0B":isFinal?"3px solid "+(row.color||"#16A34A"):"none"}}>{row.label}</td>
                {(row.values||ZERO8()).map((v,ci)=><td key={ci} style={{...tdS,fontWeight:fw,color:textCol}}>{r2(v)}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const NOISE_DATA_TYPES=[
  {v:"swlA", label:"SWL dB(A)",  desc:"A-weighted Sound Power Level"},
  {v:"swl",  label:"SWL dB",    desc:"Unweighted Sound Power Level"},
  {v:"splA", label:"SPL dB(A)", desc:"A-weighted Sound Pressure Level at distance r"},
  {v:"spl",  label:"SPL dB",    desc:"Unweighted Sound Pressure Level at distance r"},
];

function SWLTable({swlA,onSet,noiseDataType,onTypeChange,splMeasDist,onDistChange,swlAConverted}){
  const arr=BAND_KEYS.map(k=>Number(swlA[k])||0);
  const nonA=computeNonAWeighted(swlAConverted||arr);
  const isSPL=noiseDataType==="splA"||noiseDataType==="spl";
  const inputLabel=NOISE_DATA_TYPES.find(t=>t.v===noiseDataType)?.label||"SWL dB(A)";
  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {/* Type selector */}
      <div>
        <p style={{fontSize:11.5,fontWeight:600,color:"#475569",margin:"0 0 8px"}}>Noise Data Type</p>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {NOISE_DATA_TYPES.map(t=>(
            <button key={t.v} type="button" onClick={()=>onTypeChange(t.v)}
              style={{padding:"6px 16px",borderRadius:9,fontSize:12.5,fontWeight:700,cursor:"pointer",
                border:`1.5px solid ${noiseDataType===t.v?"#6366F1":"#E2E8F0"}`,
                background:noiseDataType===t.v?"#EEF2FF":"#F8FAFC",
                color:noiseDataType===t.v?"#4338CA":"#64748B",
                display:"flex",flexDirection:"column",gap:1}}>
              <span>{t.label}</span>
              <span style={{fontSize:9.5,fontWeight:400,color:noiseDataType===t.v?"#6366F1":"#94A3B8"}}>{t.desc}</span>
            </button>
          ))}
        </div>
      </div>
      {/* Measurement distance — only for SPL types */}
      {isSPL&&(
        <div style={{display:"flex",alignItems:"center",gap:16,padding:"10px 14px",borderRadius:9,background:"#F1F5F9",border:"1px solid #E2E8F0"}}>
          <span style={{fontSize:12,fontWeight:600,color:"#475569"}}>Measurement Distance (r)</span>
          <div style={{width:160}}>
            <NumInput value={splMeasDist||1} unit="m" step={0.5} min={0.1} onChange={onDistChange}/>
          </div>
          <span style={{fontSize:11.5,color:"#64748B"}}>SPL → SWL correction: <strong style={{color:"#6366F1"}}>{r2(20*Math.log10(Math.max(0.01,splMeasDist||1))+11)} dB</strong></span>
        </div>
      )}
      {/* Band input table */}
      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",width:"100%",minWidth:640}}>
          <thead><tr><th style={{...thS,textAlign:"left"}}>Parameter</th>{BANDS.map(b=><th key={b} style={thS}>{b} Hz</th>)}</tr></thead>
          <tbody>
            <tr>
              <td style={tdL}>{inputLabel} — per octave band</td>
              {BAND_KEYS.map(k=><td key={k} style={{...tdS,padding:"3px"}}><BandInput value={swlA[k]??0} onCommit={v=>onSet({...swlA,[k]:v})}/></td>)}
            </tr>
            {isSPL&&<tr style={{background:"#EFF6FF"}}>
              <td style={{...tdL,color:"#1E40AF",fontWeight:700}}>→ Converted SWL dB(A)</td>
              {(swlAConverted||arr).map((v,i)=><td key={i} style={{...tdS,color:"#1E40AF",fontWeight:700}}>{v}</td>)}
            </tr>}
            {noiseDataType==="swl"&&<tr style={{background:"#EFF6FF"}}>
              <td style={{...tdL,color:"#1E40AF",fontWeight:700}}>→ SWL dB(A) (after A-weight)</td>
              {(swlAConverted||arr).map((v,i)=><td key={i} style={{...tdS,color:"#1E40AF",fontWeight:700}}>{v}</td>)}
            </tr>}
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
    </div>
  );
}

function RoomDistSelector({value,onChange}){
  return (
    <div style={{marginBottom:14}}>
      <p style={{fontSize:11.5,fontWeight:600,color:"#475569",margin:"0 0 8px"}}>Room / Distance Correction Method</p>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {[
          {v:"spaceRoom",label:"Space / Room Effect",desc:"−10log(r)−5log(V)−3log(f)+12"},
          {v:"distEffect",label:"Distance Effect",desc:"10·log(Q/4πr²) scalar"},
          {v:"none",label:"None",desc:"No correction"},
        ].map(o=><button key={o.v} onClick={()=>onChange(o.v)} type="button"
          style={{padding:"7px 14px",borderRadius:9,fontSize:12.5,fontWeight:700,border:`1.5px solid ${value===o.v?"#6366F1":"#E2E8F0"}`,background:value===o.v?"#EEF2FF":"#F8FAFC",color:value===o.v?"#4338CA":"#64748B",cursor:"pointer",display:"flex",flexDirection:"column",gap:2}}>
          <span>{o.label}</span><span style={{fontSize:10,fontWeight:400,color:value===o.v?"#6366F1":"#94A3B8"}}>{o.desc}</span>
        </button>)}
      </div>
    </div>
  );
}

const emptyBand=()=>({hz63:0,hz125:0,hz250:0,hz500:0,hz1000:0,hz2000:0,hz4000:0,hz8000:0});

function defaultDuct(idx=0){
  return {
    label:`Duct ${idx+1}`,
    type:"lined",        // "lined" | "unlined"
    width_mm:0,height_mm:0,length_m:0,
    elbows:0,
    branchIncluded:false,  // branch toggle instead of separate branch type
    branches:1,
    upstreamW:0,upstreamH:0,
    liningThick:1,
    coeffA:emptyCoeffA(),
    showCoeff:false,
  };
}

function defaultReturnDuct(idx=0){
  return {
    label:`Return Duct ${idx+1}`,
    type:"lined",
    width_mm:0,height_mm:0,length_m:0,
    elbows:0,
    branchIncluded:false,
    branches:1,
    upstreamW:0,upstreamH:0,
    liningThick:1,
    coeffA:emptyCoeffA(),
    showCoeff:false,
  };
}

function defaultForm(){
  return {
    calcMode:"sameRoom",   // "sameRoom" | "diffRoom" | "radiated"
    requiredNC:40,
    noiseDataType:"swlA",  // "swlA" | "swl" | "splA" | "spl"
    splMeasDist:1,         // measurement distance r in metres (for SPL types)
    swlA:{hz63:0,hz125:0,hz250:0,hz500:0,hz1000:0,hz2000:0,hz4000:0,hz8000:0},
    // PATH 1 — Supply Duct (all modes that have supply)
    p1_on:true,
    p1_ducts:[defaultDuct(0)],
    p1_flexOn:true,p1_flexW:200,p1_flexLen:0,
    p1_erlOn:true,p1_erlCase:"case1",p1_erlW:0,p1_erlH:0,p1_erlNum:1,p1_erlNC:"NC-18",
    p1_roomMode:"spaceRoom",
    p1_roomLen:0,p1_roomWid:0,p1_roomHei:0,p1_roomDist:0,
    p1_distDist:0,p1_distQ:2,
    // PATH 2 — Return Path (both sameRoom and diffRoom use full duct chain now)
    p2_on:true,
    // sameRoom P2 — full return duct chain
    p2_ducts:[defaultReturnDuct(0)],
    p2_flexOn:true,p2_flexW:200,p2_flexLen:0,
    p2_erlOn:true,p2_erlCase:"case1",p2_erlW:0,p2_erlH:0,p2_erlNum:1,p2_erlNC:"NC-15",
    p2_grillDistOn:false,p2_grillDistMode:"distEffect",p2_grillDistDist:1,p2_grillDistQ:2,
    p2_roomMode:"spaceRoom",
    p2_roomLen:0,p2_roomWid:0,p2_roomHei:0,p2_roomDist:0,
    p2_distDist:0,p2_distQ:2,
    // diffRoom P2 — separate full return duct chain
    p2dr_ducts:[defaultReturnDuct(0)],
    p2dr_flexOn:true,p2dr_flexW:200,p2dr_flexLen:0,
    p2dr_erlOn:true,p2dr_erlCase:"case1",p2dr_erlW:0,p2dr_erlH:0,p2dr_erlNum:1,p2dr_erlNC:"NC-15",
    p2dr_grillDistOn:false,p2dr_grillDistMode:"distEffect",p2dr_grillDistDist:1,p2dr_grillDistQ:2,
    p2dr_roomMode:"spaceRoom",
    p2dr_roomLen:0,p2dr_roomWid:0,p2dr_roomHei:0,p2dr_roomDist:0,
    p2dr_distDist:0,p2dr_distQ:2,
    // PATH 3 — Radiated
    p3_on:true,
    p3_material:"12.5mm Gypsum Board",
    p3_roomMode:"spaceRoom",
    p3_roomLen:0,p3_roomWid:0,p3_roomHei:0,p3_roomDist:0,
    p3_distDist:0,p3_distQ:2,
  };
}

// ── Shared duct calc helper
function calcDuctChain(ducts){
  return ducts.map((d,idx)=>{
    const isLined=d.type==="lined",isUnlined=d.type==="unlined";
    const ductIL=isLined?calcLinedIL(d.width_mm,d.height_mm,d.length_m,d.liningThick,d.coeffA)
                :calcUnlinedIL(d.width_mm,d.height_mm,d.length_m);
    const elbowN=Number(d.elbows)||0;
    const elbowIL=elbowN>0?calcElbowIL(d.width_mm,elbowN,isLined):ZERO8();
    // Branch: only valid from duct 2 onwards; upstream = previous duct dims
    const prev=idx>0?ducts[idx-1]:null;
    const branchDB=(d.branchIncluded&&prev)?calcBranchIL(d.width_mm,d.height_mm,prev.width_mm,prev.height_mm):0;
    const totalIL=BANDS.map((_,i)=>r2(ductIL[i]+elbowIL[i]+branchDB));
    return {ductIL,elbowIL,branchDB,totalIL,d,prevDuct:prev};
  });
}

export default function FCUInputForm({project}){
  const [form,setForm]=useState(defaultForm);
  const [tab,setTab]=useState("input");
  const set=useCallback((k,v)=>setForm(f=>({...f,[k]:v})),[]);

  // P1 duct helpers
  const addP1Duct=useCallback(()=>setForm(f=>({...f,p1_ducts:[...f.p1_ducts,defaultDuct(f.p1_ducts.length)]})),[]);
  const removeP1Duct=useCallback(idx=>setForm(f=>({...f,p1_ducts:f.p1_ducts.filter((_,i)=>i!==idx)})),[]);
  const patchP1Duct=useCallback((idx,patch)=>setForm(f=>({...f,p1_ducts:f.p1_ducts.map((d,i)=>i===idx?{...d,...patch}:d)})),[]);
  const patchP1CoeffA=useCallback((idx,k,v)=>setForm(f=>({...f,p1_ducts:f.p1_ducts.map((d,i)=>i===idx?{...d,coeffA:{...d.coeffA,[k]:v}}:d)})),[]);

  // P2 sameRoom duct helpers
  const addP2Duct=useCallback(()=>setForm(f=>({...f,p2_ducts:[...f.p2_ducts,defaultReturnDuct(f.p2_ducts.length)]})),[]);
  const removeP2Duct=useCallback(idx=>setForm(f=>({...f,p2_ducts:f.p2_ducts.filter((_,i)=>i!==idx)})),[]);
  const patchP2Duct=useCallback((idx,patch)=>setForm(f=>({...f,p2_ducts:f.p2_ducts.map((d,i)=>i===idx?{...d,...patch}:d)})),[]);
  const patchP2CoeffA=useCallback((idx,k,v)=>setForm(f=>({...f,p2_ducts:f.p2_ducts.map((d,i)=>i===idx?{...d,coeffA:{...d.coeffA,[k]:v}}:d)})),[]);

  // P2 diffRoom duct helpers
  const addP2drDuct=useCallback(()=>setForm(f=>({...f,p2dr_ducts:[...f.p2dr_ducts,defaultReturnDuct(f.p2dr_ducts.length)]})),[]);
  const removeP2drDuct=useCallback(idx=>setForm(f=>({...f,p2dr_ducts:f.p2dr_ducts.filter((_,i)=>i!==idx)})),[]);
  const patchP2drDuct=useCallback((idx,patch)=>setForm(f=>({...f,p2dr_ducts:f.p2dr_ducts.map((d,i)=>i===idx?{...d,...patch}:d)})),[]);
  const patchP2drCoeffA=useCallback((idx,k,v)=>setForm(f=>({...f,p2dr_ducts:f.p2dr_ducts.map((d,i)=>i===idx?{...d,coeffA:{...d.coeffA,[k]:v}}:d)})),[]);

  // Derive SWL dB(A) from whatever input type the user chose
  const rawInput=BAND_KEYS.map(k=>Number(form.swlA[k])||0);
  const r_meas=form.splMeasDist||1;
  const SWL_A_arr = (() => {
    if(form.noiseDataType==="swlA") return rawInput;                        // SWL dB(A) — input as-is
    if(form.noiseDataType==="swl")  return swlToSwlA(rawInput);             // SWL dB → +A-weight
    if(form.noiseDataType==="splA") return splToSwl(rawInput,r_meas);       // SPL dB(A) → SWL dB(A)
    if(form.noiseDataType==="spl")  return swlToSwlA(splToSwl(rawInput,r_meas)); // SPL dB → SWL dB → +A-weight
    return rawInput;
  })();
  const SWL=computeNonAWeighted(SWL_A_arr);

  const isSameRoom = form.calcMode==="sameRoom";
  const isDiffRoom = form.calcMode==="diffRoom";
  const isRadiated = form.calcMode==="radiated";

  // ── PATH 1 ── (supply duct, used in sameRoom + diffRoom)
  const p1_ductResults = calcDuctChain(form.p1_ducts||[]);
  const p1_allDuctIL   = BANDS.map((_,i)=>p1_ductResults.reduce((s,r)=>s+r.totalIL[i],0));
  const p1_flexIL      = form.p1_flexOn?calcFlexIL(form.p1_flexW,form.p1_flexLen):ZERO8();
  const p1_roomEff     = getRoomEff(form.p1_roomMode,form.p1_roomLen,form.p1_roomWid,form.p1_roomHei,form.p1_roomDist,form.p1_distDist,form.p1_distQ);
  const p1_erl         = form.p1_erlOn?(form.p1_erlCase==="case1"?calcERLAcoustic(form.p1_erlW,form.p1_erlH):calcERLNC(SWL_A_arr,form.p1_erlNC)):ZERO8();
  const p1_preTotalLp  = SWL.map((_,i)=>r1(SWL[i]+ENV_CF[i]+p1_allDuctIL[i]+p1_flexIL[i]+p1_roomEff[i]));
  const p1_totalLp     = p1_preTotalLp.map((v,i)=>r1(v+p1_erl[i]));
  const p1_final       = p1_totalLp;

  // ── PATH 2 — sameRoom (full return duct chain, SWL_A) ──
  const p2_ductResults = calcDuctChain(form.p2_ducts||[]);
  const p2_allDuctIL   = BANDS.map((_,i)=>p2_ductResults.reduce((s,r)=>s+r.totalIL[i],0));
  const p2_flexIL      = form.p2_flexOn?calcFlexIL(form.p2_flexW,form.p2_flexLen):ZERO8();
  const p2_grillDistEff = form.p2_grillDistOn?getRoomEff(form.p2_grillDistMode,"","","","",form.p2_grillDistDist,form.p2_grillDistQ):ZERO8();
  const p2_roomEff     = getRoomEff(form.p2_roomMode,form.p2_roomLen,form.p2_roomWid,form.p2_roomHei,form.p2_roomDist,form.p2_distDist,form.p2_distQ);
  const p2_erl         = form.p2_erlOn?(form.p2_erlCase==="case1"?calcERLAcoustic(form.p2_erlW,form.p2_erlH):calcERLNC(SWL_A_arr,form.p2_erlNC)):ZERO8();
  const p2_preTotalLp  = SWL_A_arr.map((_,i)=>r1(SWL_A_arr[i]+ENV_CF[i]+p2_allDuctIL[i]+p2_flexIL[i]+p2_grillDistEff[i]+p2_roomEff[i]));
  const p2_totalLp     = p2_preTotalLp.map((v,i)=>r1(v+p2_erl[i]));
  const p2_final       = p2_totalLp;

  // ── PATH 2 — diffRoom (full return duct chain, SWL_A) ──
  const p2dr_ductResults = calcDuctChain(form.p2dr_ducts||[]);
  const p2dr_allDuctIL   = BANDS.map((_,i)=>p2dr_ductResults.reduce((s,r)=>s+r.totalIL[i],0));
  const p2dr_flexIL      = form.p2dr_flexOn?calcFlexIL(form.p2dr_flexW,form.p2dr_flexLen):ZERO8();
  const p2dr_grillDistEff = form.p2dr_grillDistOn?getRoomEff(form.p2dr_grillDistMode,"","","","",form.p2dr_grillDistDist,form.p2dr_grillDistQ):ZERO8();
  const p2dr_roomEff     = getRoomEff(form.p2dr_roomMode,form.p2dr_roomLen,form.p2dr_roomWid,form.p2dr_roomHei,form.p2dr_roomDist,form.p2dr_distDist,form.p2dr_distQ);
  const p2dr_erl         = form.p2dr_erlOn?(form.p2dr_erlCase==="case1"?calcERLAcoustic(form.p2dr_erlW,form.p2dr_erlH):calcERLNC(SWL_A_arr,form.p2dr_erlNC)):ZERO8();
  const p2dr_preTotalLp  = SWL_A_arr.map((_,i)=>r1(SWL_A_arr[i]+ENV_CF[i]+p2dr_allDuctIL[i]+p2dr_flexIL[i]+p2dr_grillDistEff[i]+p2dr_roomEff[i]));
  const p2dr_totalLp     = p2dr_preTotalLp.map((v,i)=>r1(v+p2dr_erl[i]));
  const p2dr_final       = p2dr_totalLp;

  // ── PATH 3 — Radiated ──
  const p3_ceilTL  = FALSE_CEILING[form.p3_material]||FALSE_CEILING["12.5mm Gypsum Board"];
  const p3_roomEff = getRoomEff(form.p3_roomMode,form.p3_roomLen,form.p3_roomWid,form.p3_roomHei,form.p3_roomDist,form.p3_distDist,form.p3_distQ);
  const p3_totalLp = SWL.map((_,i)=>r1(SWL[i]+p3_ceilTL[i]+p3_roomEff[i]));

  // ── ACTIVE PATH FINALS per mode ──
  const p2_active_final = isDiffRoom ? p2dr_final : p2_final;
  const activePaths=[
    ...((!isRadiated&&form.p1_on)?[p1_final]:[]),
    ...((!isRadiated&&form.p2_on)?[p2_active_final]:[]),
    ...((!isSameRoom||form.p3_on)?isRadiated?[p3_totalLp]:(form.p3_on?[p3_totalLp]:[]):[]),
  ];
  // For sameRoom: P1+P2+optional P3; for diffRoom: P1+P2dr only; for radiated: P3 only
  const activePaths2 = isSameRoom
    ? [...(form.p1_on?[p1_final]:[]),...(form.p2_on?[p2_final]:[]),...(form.p3_on?[p3_totalLp]:[]) ]
    : isDiffRoom
    ? [...(form.p1_on?[p1_final]:[]),...(form.p2_on?[p2dr_final]:[])]
    : [p3_totalLp];

  const combined    = activePaths2.length?logSum(activePaths2):null;
  const calcNC      = combined?calcNCRating(combined):null;
  const ncRow       = NC_ROWS.find(r=>r.nc===Number(form.requiredNC))||NC_ROWS[5];
  const addlRed     = combined?combined.map((v,i)=>r1(v-ncRow.left[i])):null;
  const ncPass      = typeof calcNC==="number"&&calcNC<=Number(form.requiredNC);
  const ncColor     = calcNC===null?"#64748B":ncPass?"#16A34A":"#DC2626";

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
    const dk=ddk||`${pf}distDist`,qk=dqk||`${pf}distQ`;
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

  // Reusable duct card list renderer
  function DuctCards({ducts,results,color,onAdd,onRemove,onPatch,onPatchCoeffA}){
    return (
      <>
        {ducts.map((d,idx)=>{
          const res=results[idx]||{ductIL:ZERO8(),elbowIL:ZERO8(),branchDB:0,totalIL:ZERO8()};
          const isLined=d.type==="lined",isUnlined=d.type==="unlined",isBranch=d.type==="branch";
          const elbowRowIdx=getElbowRowIdx(d.width_mm);
          const headerBg=color==="#0E9F8E"?"#D1FAE5":color==="#3B82F6"?"#DBEAFE":"#EDE9FE";
          const borderCol=color==="#0E9F8E"?"#A7F3D0":color==="#3B82F6"?"#BFDBFE":"#DDD6FE";
          const bgCol=color==="#0E9F8E"?"#F0FDF4":color==="#3B82F6"?"#EFF6FF":"#F5F3FF";
          const textCol=color==="#0E9F8E"?"#065F46":color==="#3B82F6"?"#1E40AF":"#5B21B6";
          return (
            <div key={idx} style={{borderRadius:10,border:`1.5px solid ${borderCol}`,background:bgCol,overflow:"hidden"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 14px",background:headerBg,borderBottom:`1px solid ${borderCol}`}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{width:24,height:24,borderRadius:99,background:color,color:"#fff",fontSize:12,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{idx+1}</span>
                  <input value={d.label} onChange={e=>onPatch(idx,{label:e.target.value})}
                    style={{fontSize:13,fontWeight:700,color:textCol,background:"transparent",border:"none",outline:"none",width:150}}/>
                </div>
                {ducts.length>1&&(
                  <button type="button" onClick={()=>onRemove(idx)}
                    style={{fontSize:11,color:"#DC2626",background:"#FEE2E2",border:"1px solid #FECACA",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontWeight:700}}>Remove</button>
                )}
              </div>
              <div style={{padding:"12px 14px",display:"flex",flexDirection:"column",gap:10}}>
                {/* Type Toggle — Lined / Unlined only */}
                <div style={{display:"flex",gap:6}}>
                  {[{v:"lined",label:"Lined"},{v:"unlined",label:"Unlined"}].map(o=>(
                    <button key={o.v} type="button" onClick={()=>onPatch(idx,{type:o.v})}
                      style={{padding:"5px 14px",borderRadius:99,fontSize:12,fontWeight:700,cursor:"pointer",
                        border:`1.5px solid ${d.type===o.v?color:"#CBD5E1"}`,
                        background:d.type===o.v?color:"#F8FAFC",
                        color:d.type===o.v?"#fff":"#64748B"}}>
                      {o.label}
                    </button>
                  ))}
                </div>
                {/* Dims Row */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
                  <NumInput label="Width (mm)"    value={d.width_mm}  step={1} unit="mm" onChange={v=>onPatch(idx,{width_mm:v})}/>
                  <NumInput label="Height (mm)"   value={d.height_mm} step={1} unit="mm" onChange={v=>onPatch(idx,{height_mm:v})}/>
                  <NumInput label="Length (m)"    value={d.length_m}  unit="m"  onChange={v=>onPatch(idx,{length_m:v})}/>
                  <NumInput label="No. of Elbows" value={d.elbows}    step={1} min={0}   onChange={v=>onPatch(idx,{elbows:Math.max(0,Math.round(v))})}/>
                </div>
                {/* Branch toggle — only from Duct 2 onwards */}
                {idx>0&&(
                <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                  <span style={{fontSize:12,fontWeight:600,color:"#475569"}}>Branch Power Division:</span>
                  <div style={{display:"flex",gap:6}}>
                    {[{v:true,label:"Included"},{v:false,label:"Not Included"}].map(o=>(
                      <button key={String(o.v)} type="button" onClick={()=>onPatch(idx,{branchIncluded:o.v})}
                        style={{padding:"4px 12px",borderRadius:99,fontSize:12,fontWeight:700,cursor:"pointer",
                          border:`1.5px solid ${d.branchIncluded===o.v?color:"#CBD5E1"}`,
                          background:d.branchIncluded===o.v?color:"#F8FAFC",
                          color:d.branchIncluded===o.v?"#fff":"#64748B"}}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
                )}
                {/* Branch info — branch dims = this duct, upstream = prev duct (auto) */}
                {idx>0&&d.branchIncluded&&(
                  <div style={{padding:"8px 10px",borderRadius:8,border:`1px solid ${borderCol}`,background:"#F8FAFC",fontSize:11.5,color:"#475569"}}>
                    Branch: <strong>{d.width_mm}×{d.height_mm} mm</strong> (this duct) &nbsp;|&nbsp; Upstream: previous duct dims (auto)
                  </div>
                )}
                {isLined&&(
                  <div style={{display:"grid",gridTemplateColumns:"1fr 3fr",gap:8}}>
                    <NumInput label="Lining Thickness (in)" value={d.liningThick} step={0.5} min={0.5} unit="in" onChange={v=>onPatch(idx,{liningThick:v})}/>
                    <div/>
                  </div>
                )}
                {isLined&&(
                  <div>
                    <button type="button" onClick={()=>onPatch(idx,{showCoeff:!d.showCoeff})}
                      style={{fontSize:11.5,color,background:"none",border:"none",cursor:"pointer",fontWeight:600,padding:"4px 0",display:"flex",alignItems:"center",gap:4}}>
                      {d.showCoeff?"▼":"▶"} Custom Coeff A
                    </button>
                    {d.showCoeff&&(
                      <div style={{marginTop:6,padding:"10px",borderRadius:8,border:`1px solid ${borderCol}`,background:"#fff"}}>
                        <div style={{overflowX:"auto"}}>
                          <table style={{borderCollapse:"collapse",minWidth:480}}>
                            <thead><tr>{BANDS.map(b=><th key={b} style={thS}>{b} Hz</th>)}</tr></thead>
                            <tbody><tr>{BAND_KEYS.map(k=><td key={k} style={{padding:"3px"}}>
                              <BandInput value={d.coeffA[k]??0} onCommit={v=>onPatchCoeffA(idx,k,v)}/>
                            </td>)}</tr></tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {Number(d.elbows)>0&&(
                  <div style={{padding:"8px 10px",borderRadius:8,background:"#fff",border:`1px solid ${borderCol}`,fontSize:11.5,color:textCol}}>
                    Elbow IL/elbow: <strong>{(isLined?ELBOW_LINED_TBL:ELBOW_UNLINED_TBL)[elbowRowIdx].map((v,i)=>`${BANDS[i]}Hz:${v}`).join("  ")}</strong>
                    &nbsp;× {d.elbows} elbow{d.elbows>1?"s":""}
                  </div>
                )}
                {idx>0&&d.branchIncluded&&res.prevDuct&&(
                  <div style={{padding:"8px 10px",borderRadius:8,background:"#fff",border:`1px solid ${borderCol}`,fontSize:11.5,color:textCol}}>
                    A_branch = {r2(mmToFt(d.width_mm)*mmToFt(d.height_mm))} ft²&nbsp;|&nbsp;
                    A_upstream = {r2(mmToFt(res.prevDuct.width_mm)*mmToFt(res.prevDuct.height_mm))} ft²&nbsp;|&nbsp;
                    <strong>Branch IL = {r2(res.branchDB)} dB</strong>
                  </div>
                )}
                <ILTable rows={[
                  ...(idx>0&&d.branchIncluded?[{label:"Branch Power Division IL (dB)",values:BANDS.map(()=>res.branchDB),color}]:[]),
                  {label:`${isLined?"Lined":"Unlined"} Duct IL (dB)`,values:res.ductIL,color},
                  ...(Number(d.elbows)>0?[{label:`Elbow IL ×${d.elbows} (dB)`,values:res.elbowIL,color}]:[]),
                  {label:"Total IL this duct (dB)",values:res.totalIL,color:textCol,highlight:"total"},
                ]}/>
              </div>
            </div>
          );
        })}
        <button type="button" onClick={onAdd}
          style={{width:"100%",padding:"10px",borderRadius:9,border:`1.5px dashed ${color}`,background:color==="#0E9F8E"?"#F0FDF4":color==="#3B82F6"?"#EFF6FF":"#F5F3FF",color,fontSize:13,fontWeight:700,cursor:"pointer",letterSpacing:.3}}>
          + Add Another Duct
        </button>
      </>
    );
  }

  // ── Shared supply duct form block
  function SupplyDuctBlock({pathColor}){
    const c=pathColor||"#0E9F8E";
    return (
      <>
        <DuctCards
          ducts={form.p1_ducts} results={p1_ductResults} color={c}
          onAdd={addP1Duct} onRemove={removeP1Duct} onPatch={patchP1Duct} onPatchCoeffA={patchP1CoeffA}
        />
        <Section icon={Wind} title="Flexible Duct — Insertion Loss" color={c} onToggle={()=>set("p1_flexOn",!form.p1_flexOn)} isOn={form.p1_flexOn}>
          {form.p1_flexOn&&<><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
            <SelectInput label="Flex Duct Diameter (mm)" value={String(form.p1_flexW)} onChange={v=>set("p1_flexW",Number(v))} options={FLEX_TABLE.map(r=>({value:String(r.w),label:`Ø${r.w} mm`}))}/>
            <NumInput label="Length (m)" value={form.p1_flexLen} unit="m" onChange={v=>set("p1_flexLen",v)}/>
          </div>
          <ILTable rows={[{label:"Flexible Duct IL (dB)",values:p1_flexIL,color:c}]}/></>}
        </Section>
        <Section icon={Calculator} title="End Reflection Factor (ERL) — Diffuser / Grill" color={c} onToggle={()=>set("p1_erlOn",!form.p1_erlOn)} isOn={form.p1_erlOn}>
          {form.p1_erlOn&&<>
            <div style={{display:"flex",gap:6,marginBottom:12}}>
              {[{v:"case1",label:"Case 1 — DG Method (Duct Dimensions)"},{v:"case2",label:"Case 2 — NC Table Lookup"}].map(o=>(
                <button key={o.v} type="button" onClick={()=>set("p1_erlCase",o.v)}
                  style={{padding:"5px 14px",borderRadius:99,fontSize:12,fontWeight:700,cursor:"pointer",
                    border:`1.5px solid ${form.p1_erlCase===o.v?c:"#CBD5E1"}`,
                    background:form.p1_erlCase===o.v?c:"#F8FAFC",
                    color:form.p1_erlCase===o.v?"#fff":"#64748B"}}>
                  {o.label}
                </button>
              ))}
            </div>
            {form.p1_erlCase==="case1"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <NumInput label="Diffuser Width (mm)"  value={form.p1_erlW} step={1} unit="mm" onChange={v=>set("p1_erlW",v)}/>
              <NumInput label="Diffuser Height (mm)" value={form.p1_erlH} step={1} unit="mm" onChange={v=>set("p1_erlH",v)}/>
            </div>}
            {form.p1_erlCase==="case2"&&<div style={{display:"grid",gridTemplateColumns:"1fr",gap:10,marginBottom:10}}>
              <SelectInput label="NC Rating" value={form.p1_erlNC} onChange={v=>set("p1_erlNC",v)} options={Object.keys(ERL_TABLE).map(k=>({value:k,label:k}))}/>
            </div>}
            <ILTable rows={[{label:form.p1_erlCase==="case1"?`ERL Case 1 (DG) — ${form.p1_erlW}×${form.p1_erlH}mm (dB)`:`End Reflection Factor — ${form.p1_erlNC} (dB)`,values:p1_erl,color:c}]}/>
          </>}
        </Section>
        <Section icon={Layers} title="Space / Room Effect @ Receiver (POINT SOURCE)" color={c}>
          <RoomDistSelector value={form.p1_roomMode} onChange={v=>set("p1_roomMode",v)}/>
          <RoomInputs pf="p1_" mode={form.p1_roomMode}/>
          {form.p1_roomMode!=="none"&&<ILTable rows={[{label:form.p1_roomMode==="spaceRoom"?"Space/Room Effect (dB)":"Distance Effect (dB)",values:p1_roomEff,color:c}]}/>}
        </Section>
      </>
    );
  }

  const InputTab=(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>

      {/* ── Calculation Mode Selector ── */}
      <div style={{display:"flex",gap:8}}>
        {[
          {v:"sameRoom", label:"Same Room",      color:"#6366F1"},
          {v:"diffRoom", label:"Different Room",  color:"#0E9F8E"},
          {v:"radiated", label:"Radiated",        color:"#8B5CF6"},
        ].map(o=>(
          <button key={o.v} type="button" onClick={()=>set("calcMode",o.v)}
            style={{flex:1,padding:"10px 0",borderRadius:9,border:`2px solid ${form.calcMode===o.v?o.color:"#E2E8F0"}`,
              background:form.calcMode===o.v?o.color:"#F8FAFC",
              color:form.calcMode===o.v?"#fff":"#64748B",cursor:"pointer",fontWeight:700,fontSize:13.5,
              fontFamily:"Plus Jakarta Sans,sans-serif",transition:"all .15s"}}>
            {o.label}
          </button>
        ))}
      </div>

      {/* Required NC */}
      <div style={{padding:"14px 16px",borderRadius:14,background:"#fff",border:"1px solid #E2E8F0",boxShadow:"0 1px 4px rgba(0,0,0,.05)",display:"flex",alignItems:"center",gap:16}}>
        <div style={{flex:1}}>
          <SelectInput label="Required NC Level" value={String(form.requiredNC)} onChange={v=>set("requiredNC",Number(v))} options={NC_ROWS.map(r=>({value:String(r.nc),label:`NC ${r.nc}`}))}/>
        </div>
        {calcNC!==null&&<div style={{padding:"10px 18px",borderRadius:10,background:ncPass?"#F0FDF4":"#FEF2F2",border:`2px solid ${ncColor}`,fontWeight:800,fontSize:14,color:ncColor,fontFamily:"Plus Jakarta Sans,sans-serif",whiteSpace:"nowrap"}}>NC {calcNC} {ncPass?"✓ PASS":"✗ FAIL"}</div>}
      </div>

      {/* SWL */}
      <Section icon={Waves} title="Sound Power Level" color="#6366F1">
        <SWLTable
          swlA={form.swlA} onSet={v=>set("swlA",v)}
          noiseDataType={form.noiseDataType||"swlA"}
          onTypeChange={v=>set("noiseDataType",v)}
          splMeasDist={form.splMeasDist||1}
          onDistChange={v=>set("splMeasDist",v)}
          swlAConverted={SWL_A_arr}
        />
      </Section>

      {/* ═══ SAME ROOM MODE ═══ */}
      {isSameRoom&&<>
        {/* PATH 1 */}
        <div style={{borderLeft:"3px solid #0E9F8E",borderRadius:"0 12px 12px 0"}}>
          <PathHeader color="#0E9F8E" textColor="#065F46" borderColor="#A7F3D0" bg="#E3F8F5" icon={Wind} label="Path 1 — Supply Duct" onKey="p1_on"/>
          {form.p1_on&&<div style={{border:"1px solid #A7F3D0",borderTop:"none",borderRadius:"0 0 12px 12px",padding:"14px",display:"flex",flexDirection:"column",gap:12}}>
            <SupplyDuctBlock pathColor="#0E9F8E"/>
          </div>}
        </div>
        {/* PATH 2 — sameRoom full duct chain */}
        <div style={{borderLeft:"3px solid #3B82F6",borderRadius:"0 12px 12px 0"}}>
          <PathHeader color="#3B82F6" textColor="#1E40AF" borderColor="#BFDBFE" bg="#EFF6FF" icon={Wind} label="Path 2 — Return Path" onKey="p2_on"/>
          {form.p2_on&&<div style={{border:"1px solid #BFDBFE",borderTop:"none",borderRadius:"0 0 12px 12px",padding:"14px",display:"flex",flexDirection:"column",gap:12}}>
            <DuctCards
              ducts={form.p2_ducts} results={p2_ductResults} color="#3B82F6"
              onAdd={addP2Duct} onRemove={removeP2Duct} onPatch={patchP2Duct} onPatchCoeffA={patchP2CoeffA}
            />
            <Section icon={Wind} title="Flexible Duct — Insertion Loss (Return)" color="#3B82F6" onToggle={()=>set("p2_flexOn",!form.p2_flexOn)} isOn={form.p2_flexOn}>
              {form.p2_flexOn&&<><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <SelectInput label="Flex Duct Diameter (mm)" value={String(form.p2_flexW)} onChange={v=>set("p2_flexW",Number(v))} options={FLEX_TABLE.map(r=>({value:String(r.w),label:`Ø${r.w} mm`}))}/>
                <NumInput label="Length (m)" value={form.p2_flexLen} unit="m" onChange={v=>set("p2_flexLen",v)}/>
              </div>
              <ILTable rows={[{label:"Flexible Duct IL (dB)",values:p2_flexIL,color:"#3B82F6"}]}/></>}
            </Section>
            <Section icon={Calculator} title="End Reflection Factor (ERL) — R/A Grill" color="#3B82F6" onToggle={()=>set("p2_erlOn",!form.p2_erlOn)} isOn={form.p2_erlOn}>
              {form.p2_erlOn&&<>
                <div style={{display:"flex",gap:6,marginBottom:12}}>
                  {[{v:"case1",label:"Case 1 — DG Method (Duct Dimensions)"},{v:"case2",label:"Case 2 — NC Table Lookup"}].map(o=>(
                    <button key={o.v} type="button" onClick={()=>set("p2_erlCase",o.v)}
                      style={{padding:"5px 14px",borderRadius:99,fontSize:12,fontWeight:700,cursor:"pointer",
                        border:`1.5px solid ${form.p2_erlCase===o.v?"#3B82F6":"#CBD5E1"}`,
                        background:form.p2_erlCase===o.v?"#3B82F6":"#F8FAFC",
                        color:form.p2_erlCase===o.v?"#fff":"#64748B"}}>
                      {o.label}
                    </button>
                  ))}
                </div>
                {form.p2_erlCase==="case1"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <NumInput label="Grill Width (mm)"  value={form.p2_erlW} step={1} unit="mm" onChange={v=>set("p2_erlW",v)}/>
                  <NumInput label="Grill Height (mm)" value={form.p2_erlH} step={1} unit="mm" onChange={v=>set("p2_erlH",v)}/>
                </div>}
                {form.p2_erlCase==="case2"&&<div style={{display:"grid",gridTemplateColumns:"1fr",gap:10,marginBottom:10}}>
                  <SelectInput label="NC Rating" value={form.p2_erlNC} onChange={v=>set("p2_erlNC",v)} options={Object.keys(ERL_TABLE).map(k=>({value:k,label:k}))}/>
                </div>}
                <ILTable rows={[{label:form.p2_erlCase==="case1"?`ERL Case 1 (DG) — Grill ${form.p2_erlW}×${form.p2_erlH}mm (dB)`:`End Reflection Factor — ${form.p2_erlNC} (dB)`,values:p2_erl,color:"#3B82F6"}]}/>
              </>}
            </Section>
            <Section icon={Wind} title="Space / Distance Effect — R/A Duct to Grill" color="#3B82F6" onToggle={()=>set("p2_grillDistOn",!form.p2_grillDistOn)} isOn={form.p2_grillDistOn}>
              {form.p2_grillDistOn&&<>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 2fr",gap:10,margin:"10px 0"}}>
                  <NumInput label="Distance — Duct to Grill (m)" value={form.p2_grillDistDist||1} unit="m" onChange={v=>set("p2_grillDistDist",v)}/>
                  <NumInput label="Directivity Q" value={form.p2_grillDistQ||2} step={1} onChange={v=>set("p2_grillDistQ",v)}/>
                  <div style={{display:"flex",alignItems:"flex-end",paddingBottom:4}}><span style={{fontSize:12,color:"#475569"}}>= <strong style={{color:"#3B82F6"}}>{r2(calcDistEff(form.p2_grillDistDist||1,form.p2_grillDistQ||2))} dB</strong></span></div>
                </div>
                <ILTable rows={[{label:"Distance Effect — R/A Duct to Grill (dB)",values:p2_grillDistEff,color:"#3B82F6"}]}/>
              </>}
            </Section>
            <Section icon={Layers} title="Space / Room Effect @ Receiver (POINT SOURCE)" color="#3B82F6">
              <RoomDistSelector value={form.p2_roomMode} onChange={v=>set("p2_roomMode",v)}/>
              <RoomInputs pf="p2_" mode={form.p2_roomMode}/>
              {form.p2_roomMode!=="none"&&<ILTable rows={[{label:form.p2_roomMode==="spaceRoom"?"Space/Room Effect (dB)":"Distance Effect (dB)",values:p2_roomEff,color:"#3B82F6"}]}/>}
            </Section>
          </div>}
        </div>
        {/* PATH 3 — optional radiated */}
        <div style={{borderLeft:"3px solid #8B5CF6",borderRadius:"0 12px 12px 0"}}>
          <PathHeader color="#8B5CF6" textColor="#5B21B6" borderColor="#DDD6FE" bg="#F5F3FF" icon={Layers} label="Path 3 — Radiated Path / False Ceiling" onKey="p3_on"/>
          {form.p3_on&&<div style={{border:"1px solid #DDD6FE",borderTop:"none",borderRadius:"0 0 12px 12px",padding:"14px",display:"flex",flexDirection:"column",gap:12}}>
            <Section icon={Layers} title="False Ceiling — Transmission Loss" color="#8B5CF6">
              <div style={{marginBottom:10}}><SelectInput label="False Ceiling Material" value={form.p3_material} onChange={v=>set("p3_material",v)} options={Object.keys(FALSE_CEILING).map(k=>({value:k,label:k}))}/></div>
              <ILTable rows={[{label:`TL — ${form.p3_material}`,values:p3_ceilTL,color:"#8B5CF6"}]}/>
            </Section>
            <Section icon={Layers} title="Space / Room Effect @ Receiver (POINT SOURCE)" color="#8B5CF6">
              <RoomDistSelector value={form.p3_roomMode} onChange={v=>set("p3_roomMode",v)}/>
              <RoomInputs pf="p3_" mode={form.p3_roomMode}/>
              {form.p3_roomMode!=="none"&&<ILTable rows={[{label:form.p3_roomMode==="spaceRoom"?"Space/Room Effect (dB)":"Distance Effect (dB)",values:p3_roomEff,color:"#8B5CF6"}]}/>}
            </Section>
          </div>}
        </div>
      </>}

      {/* ═══ DIFFERENT ROOM MODE ═══ */}
      {isDiffRoom&&<>
        {/* PATH 1 — Supply */}
        <div style={{borderLeft:"3px solid #0E9F8E",borderRadius:"0 12px 12px 0"}}>
          <PathHeader color="#0E9F8E" textColor="#065F46" borderColor="#A7F3D0" bg="#E3F8F5" icon={Wind} label="Path 1 — Supply Duct" onKey="p1_on"/>
          {form.p1_on&&<div style={{border:"1px solid #A7F3D0",borderTop:"none",borderRadius:"0 0 12px 12px",padding:"14px",display:"flex",flexDirection:"column",gap:12}}>
            <SupplyDuctBlock pathColor="#0E9F8E"/>
          </div>}
        </div>
        {/* PATH 2 — Return full duct chain (diffRoom) */}
        <div style={{borderLeft:"3px solid #3B82F6",borderRadius:"0 12px 12px 0"}}>
          <PathHeader color="#3B82F6" textColor="#1E40AF" borderColor="#BFDBFE" bg="#EFF6FF" icon={Wind} label="Path 2 — Return Path" onKey="p2_on"/>
          {form.p2_on&&<div style={{border:"1px solid #BFDBFE",borderTop:"none",borderRadius:"0 0 12px 12px",padding:"14px",display:"flex",flexDirection:"column",gap:12}}>
            <DuctCards
              ducts={form.p2dr_ducts} results={p2dr_ductResults} color="#3B82F6"
              onAdd={addP2drDuct} onRemove={removeP2drDuct} onPatch={patchP2drDuct} onPatchCoeffA={patchP2drCoeffA}
            />
            <Section icon={Wind} title="Flexible Duct — Insertion Loss (Return)" color="#3B82F6" onToggle={()=>set("p2dr_flexOn",!form.p2dr_flexOn)} isOn={form.p2dr_flexOn}>
              {form.p2dr_flexOn&&<><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <SelectInput label="Flex Duct Diameter (mm)" value={String(form.p2dr_flexW)} onChange={v=>set("p2dr_flexW",Number(v))} options={FLEX_TABLE.map(r=>({value:String(r.w),label:`Ø${r.w} mm`}))}/>
                <NumInput label="Length (m)" value={form.p2dr_flexLen} unit="m" onChange={v=>set("p2dr_flexLen",v)}/>
              </div>
              <ILTable rows={[{label:"Flexible Duct IL (dB)",values:p2dr_flexIL,color:"#3B82F6"}]}/></>}
            </Section>
            <Section icon={Calculator} title="End Reflection Factor (ERL) — R/A Grill" color="#3B82F6" onToggle={()=>set("p2dr_erlOn",!form.p2dr_erlOn)} isOn={form.p2dr_erlOn}>
              {form.p2dr_erlOn&&<>
                <div style={{display:"flex",gap:6,marginBottom:12}}>
                  {[{v:"case1",label:"Case 1 — DG Method (Duct Dimensions)"},{v:"case2",label:"Case 2 — NC Table Lookup"}].map(o=>(
                    <button key={o.v} type="button" onClick={()=>set("p2dr_erlCase",o.v)}
                      style={{padding:"5px 14px",borderRadius:99,fontSize:12,fontWeight:700,cursor:"pointer",
                        border:`1.5px solid ${form.p2dr_erlCase===o.v?"#3B82F6":"#CBD5E1"}`,
                        background:form.p2dr_erlCase===o.v?"#3B82F6":"#F8FAFC",
                        color:form.p2dr_erlCase===o.v?"#fff":"#64748B"}}>
                      {o.label}
                    </button>
                  ))}
                </div>
                {form.p2dr_erlCase==="case1"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <NumInput label="Grill Width (mm)"  value={form.p2dr_erlW} step={1} unit="mm" onChange={v=>set("p2dr_erlW",v)}/>
                  <NumInput label="Grill Height (mm)" value={form.p2dr_erlH} step={1} unit="mm" onChange={v=>set("p2dr_erlH",v)}/>
                </div>}
                {form.p2dr_erlCase==="case2"&&<div style={{display:"grid",gridTemplateColumns:"1fr",gap:10,marginBottom:10}}>
                  <SelectInput label="NC Rating" value={form.p2dr_erlNC} onChange={v=>set("p2dr_erlNC",v)} options={Object.keys(ERL_TABLE).map(k=>({value:k,label:k}))}/>
                </div>}
                <ILTable rows={[{label:form.p2dr_erlCase==="case1"?`ERL Case 1 (DG) — Grill ${form.p2dr_erlW}×${form.p2dr_erlH}mm (dB)`:`End Reflection Factor — ${form.p2dr_erlNC} (dB)`,values:p2dr_erl,color:"#3B82F6"}]}/>
              </>}
            </Section>
            <Section icon={Wind} title="Space / Distance Effect — R/A Duct to Grill" color="#3B82F6" onToggle={()=>set("p2dr_grillDistOn",!form.p2dr_grillDistOn)} isOn={form.p2dr_grillDistOn}>
              {form.p2dr_grillDistOn&&<>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 2fr",gap:10,margin:"10px 0"}}>
                  <NumInput label="Distance — Duct to Grill (m)" value={form.p2dr_grillDistDist||1} unit="m" onChange={v=>set("p2dr_grillDistDist",v)}/>
                  <NumInput label="Directivity Q" value={form.p2dr_grillDistQ||2} step={1} onChange={v=>set("p2dr_grillDistQ",v)}/>
                  <div style={{display:"flex",alignItems:"flex-end",paddingBottom:4}}><span style={{fontSize:12,color:"#475569"}}>= <strong style={{color:"#3B82F6"}}>{r2(calcDistEff(form.p2dr_grillDistDist||1,form.p2dr_grillDistQ||2))} dB</strong></span></div>
                </div>
                <ILTable rows={[{label:"Distance Effect — R/A Duct to Grill (dB)",values:p2dr_grillDistEff,color:"#3B82F6"}]}/>
              </>}
            </Section>
            <Section icon={Layers} title="Space / Room Effect @ Receiver (POINT SOURCE)" color="#3B82F6">
              <RoomDistSelector value={form.p2dr_roomMode} onChange={v=>set("p2dr_roomMode",v)}/>
              <RoomInputs pf="p2dr_" mode={form.p2dr_roomMode}/>
              {form.p2dr_roomMode!=="none"&&<ILTable rows={[{label:form.p2dr_roomMode==="spaceRoom"?"Space/Room Effect (dB)":"Distance Effect (dB)",values:p2dr_roomEff,color:"#3B82F6"}]}/>}
            </Section>
          </div>}
        </div>
      </>}

      {/* ═══ RADIATED ONLY MODE ═══ */}
      {isRadiated&&<>
        <div style={{borderLeft:"3px solid #8B5CF6",borderRadius:"0 12px 12px 0"}}>
          <div style={{display:"flex",alignItems:"center",padding:"10px 16px",background:"#F5F3FF",borderRadius:"12px 12px 0 0",border:"1px solid #DDD6FE",borderBottom:"none"}}>
            <Layers size={16} color="#8B5CF6"/><span style={{fontFamily:"Plus Jakarta Sans,sans-serif",fontWeight:800,fontSize:14,color:"#5B21B6",marginLeft:10}}>Radiated Path — False Ceiling Transmission Loss</span>
          </div>
          <div style={{border:"1px solid #DDD6FE",borderTop:"none",borderRadius:"0 0 12px 12px",padding:"14px",display:"flex",flexDirection:"column",gap:12}}>
            <Section icon={Layers} title="False Ceiling — Transmission Loss" color="#8B5CF6">
              <div style={{marginBottom:10}}><SelectInput label="False Ceiling Material" value={form.p3_material} onChange={v=>set("p3_material",v)} options={Object.keys(FALSE_CEILING).map(k=>({value:k,label:k}))}/></div>
              <ILTable rows={[{label:`TL — ${form.p3_material}`,values:p3_ceilTL,color:"#8B5CF6"}]}/>
            </Section>
            <Section icon={Layers} title="Space / Room Effect @ Receiver (POINT SOURCE)" color="#8B5CF6">
              <RoomDistSelector value={form.p3_roomMode} onChange={v=>set("p3_roomMode",v)}/>
              <RoomInputs pf="p3_" mode={form.p3_roomMode}/>
              {form.p3_roomMode!=="none"&&<ILTable rows={[{label:form.p3_roomMode==="spaceRoom"?"Space/Room Effect (dB)":"Distance Effect (dB)",values:p3_roomEff,color:"#8B5CF6"}]}/>}
            </Section>
          </div>
        </div>
      </>}
    </div>
  );

  const ResultsTab=(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>

      {/* PATH 1 */}
      {!isRadiated&&form.p1_on&&<Section icon={Wind} title="Path 1 — Supply Duct" color="#0E9F8E">
        <ILTable rows={[
          {label:"Sound Power Level (non A-wtd) dB",values:SWL},
          {label:"Environmental Correction Factor",  values:ENV_CF},
          ...(p1_ductResults.filter((res,idx)=>idx>0&&res.d.branchIncluded).map(res=>({label:`${res.d.label} — Branch Power Division (dB)`,values:BANDS.map(()=>res.branchDB)}))),
          ...(p1_ductResults.filter(res=>res.d.type==="unlined").flatMap(res=>[
            {label:`${res.d.label} — Unlined Duct IL (dB)`,values:res.ductIL},
            ...(Number(res.d.elbows)>0?[{label:`${res.d.label} — Elbow IL ×${res.d.elbows} (dB)`,values:res.elbowIL}]:[]),
          ])),
          ...(p1_ductResults.filter(res=>res.d.type==="lined").flatMap(res=>[
            {label:`${res.d.label} — Lined Duct IL (dB)`,values:res.ductIL},
            ...(Number(res.d.elbows)>0?[{label:`${res.d.label} — Elbow IL ×${res.d.elbows} (dB)`,values:res.elbowIL}]:[]),
          ])),
          ...(form.p1_flexOn?[{label:"Flexible Duct Insertion Loss (dB)",values:p1_flexIL}]:[]),
          {label:form.p1_roomMode==="spaceRoom"?"Space/Room Effect @ Receiver (dB)":"Distance Effect (dB)",values:p1_roomEff},
          ...(form.p1_erlOn?[{label:form.p1_erlCase==="case1"?`ERL Case 1 (DG) — Diffuser ${form.p1_erlW}×${form.p1_erlH}mm (dB)`:`End Reflection Factor (${form.p1_erlNC}) — Grill/Diffuser`,values:p1_erl}]:[]),
          {label:"Total Lp @ Receiver (dB)",values:p1_totalLp,highlight:"total",color:"#065F46"},
        ]}/>
      </Section>}

      {/* PATH 2 — sameRoom (full duct chain) */}
      {isSameRoom&&form.p2_on&&<Section icon={Wind} title="Path 2 — Return Path" color="#3B82F6">
        <ILTable rows={[
          {label:"Sound Power Level dB(A)",values:SWL_A_arr},
          {label:"Environmental Correction Factor",values:ENV_CF},
          ...(p2_ductResults.filter((res,idx)=>idx>0&&res.d.branchIncluded).map(res=>({label:`${res.d.label} — Branch Power Division (dB)`,values:BANDS.map(()=>res.branchDB)}))),
          ...(p2_ductResults.filter(res=>res.d.type==="unlined").flatMap(res=>[
            {label:`${res.d.label} — Unlined Duct IL (dB)`,values:res.ductIL},
            ...(Number(res.d.elbows)>0?[{label:`${res.d.label} — Elbow IL ×${res.d.elbows} (dB)`,values:res.elbowIL}]:[]),
          ])),
          ...(p2_ductResults.filter(res=>res.d.type==="lined").flatMap(res=>[
            {label:`${res.d.label} — Lined Duct IL (dB)`,values:res.ductIL},
            ...(Number(res.d.elbows)>0?[{label:`${res.d.label} — Elbow IL ×${res.d.elbows} (dB)`,values:res.elbowIL}]:[]),
          ])),
          ...(form.p2_flexOn?[{label:"Flexible Duct Insertion Loss — Return (dB)",values:p2_flexIL}]:[]),
          ...(form.p2_grillDistOn?[{label:"Distance Effect — R/A Duct to Grill (dB)",values:p2_grillDistEff}]:[]),
          {label:form.p2_roomMode==="spaceRoom"?"Space/Room Effect @ Receiver (dB)":"Distance Effect (dB)",values:p2_roomEff},
          ...(form.p2_erlOn?[{label:form.p2_erlCase==="case1"?`ERL Case 1 (DG) — Grill ${form.p2_erlW}×${form.p2_erlH}mm (dB)`:`End Reflection Factor (${form.p2_erlNC}) — R/A Grill`,values:p2_erl}]:[]),
          {label:"Total Lp @ Receiver (dB)",values:p2_totalLp,highlight:"total",color:"#1E40AF"},
        ]}/>
      </Section>}

      {/* PATH 2 — diffRoom (full duct chain) */}
      {isDiffRoom&&form.p2_on&&<Section icon={Wind} title="Path 2 — Return Path (Full Duct Chain)" color="#3B82F6">
        <ILTable rows={[
          {label:"Sound Power Level dB(A)",values:SWL_A_arr},
          {label:"Environmental Correction Factor",values:ENV_CF},
          ...(p2dr_ductResults.filter((res,idx)=>idx>0&&res.d.branchIncluded).map(res=>({label:`${res.d.label} — Branch Power Division (dB)`,values:BANDS.map(()=>res.branchDB)}))),
          ...(p2dr_ductResults.filter(res=>res.d.type==="unlined").flatMap(res=>[
            {label:`${res.d.label} — Unlined Duct IL (dB)`,values:res.ductIL},
            ...(Number(res.d.elbows)>0?[{label:`${res.d.label} — Elbow IL ×${res.d.elbows} (dB)`,values:res.elbowIL}]:[]),
          ])),
          ...(p2dr_ductResults.filter(res=>res.d.type==="lined").flatMap(res=>[
            {label:`${res.d.label} — Lined Duct IL (dB)`,values:res.ductIL},
            ...(Number(res.d.elbows)>0?[{label:`${res.d.label} — Elbow IL ×${res.d.elbows} (dB)`,values:res.elbowIL}]:[]),
          ])),
          ...(form.p2dr_flexOn?[{label:"Flexible Duct Insertion Loss — Return (dB)",values:p2dr_flexIL}]:[]),
          ...(form.p2dr_grillDistOn?[{label:"Distance Effect — R/A Duct to Grill (dB)",values:p2dr_grillDistEff}]:[]),
          {label:form.p2dr_roomMode==="spaceRoom"?"Space/Room Effect @ Receiver (dB)":"Distance Effect (dB)",values:p2dr_roomEff},
          ...(form.p2dr_erlOn?[{label:form.p2dr_erlCase==="case1"?`ERL Case 1 (DG) — Grill ${form.p2dr_erlW}×${form.p2dr_erlH}mm (dB)`:`End Reflection Factor (${form.p2dr_erlNC}) — R/A Grill`,values:p2dr_erl}]:[]),
          {label:"Total Lp @ Receiver (dB)",values:p2dr_totalLp,highlight:"total",color:"#1E40AF"},
        ]}/>
      </Section>}

      {/* PATH 3 — only in sameRoom (optional) or radiated mode */}
      {(isSameRoom&&form.p3_on||isRadiated)&&<Section icon={Layers} title="Path 3 — Radiated Path" color="#8B5CF6">
        <ILTable rows={[
          {label:"Sound Power Level (non A-wtd) dB",values:SWL},
          {label:`Transmission Loss — ${form.p3_material}`,values:p3_ceilTL},
          {label:form.p3_roomMode==="spaceRoom"?"Space/Room Effect @ Receiver (dB)":"Distance Effect (dB)",values:p3_roomEff},
          {label:"Total Transmission Loss Lp @ Receiver (dB)",values:p3_totalLp,highlight:"total",color:"#5B21B6"},
        ]}/>
      </Section>}

      {/* COMBINED */}
      {combined&&<Section icon={Calculator} title="Combination of Path Results — Logarithmic Addition" color="#6366F1">
        <ILTable rows={[
          ...(!isRadiated&&form.p1_on?[{label:"Path 1 — Supply Duct (Final Noise dB)",values:p1_final,color:"#065F46"}]:[]),
          ...(isSameRoom&&form.p2_on?[{label:"Path 2 — Return Path (Final Noise dB)",values:p2_final,color:"#1E40AF"}]:[]),
          ...(isDiffRoom&&form.p2_on?[{label:"Path 2 — Return Path Full Chain (Final Noise dB)",values:p2dr_final,color:"#1E40AF"}]:[]),
          ...((isRadiated||(isSameRoom&&form.p3_on))?[{label:"Path 3 — Radiated Path (Total Lp dB)",values:p3_totalLp,color:"#5B21B6"}]:[]),
          {label:"Total Lp at Receiver Location (dB)",values:combined,highlight:"total"},
          {label:`Required Noise Level: NC ${form.requiredNC} (dB)`,values:ncRow.left,color:"#1D4ED8"},
          {label:"Additional dB Reduction Required",values:(addlRed||[]).map(v=>r1(v)),color:(addlRed||[]).some(v=>v>0)?"#DC2626":"#16A34A"},
        ]}/>

        <div style={{marginTop:14,padding:"12px 14px",borderRadius:10,background:"#F5F3FF",border:"1px solid #DDD6FE"}}>
          <div style={{overflowX:"auto"}}>
            <table style={{borderCollapse:"collapse",fontSize:11,width:"100%",minWidth:640}}>
              <thead><tr style={{background:"#EDE9FE"}}>
                <th style={{...thS,background:"transparent",color:"#5B21B6",textAlign:"left"}}>Band (Hz)</th>
                {BANDS.map(b=><th key={b} style={{...thS,background:"transparent",color:"#5B21B6"}}>{b}</th>)}
              </tr></thead>
              <tbody>
                {!isRadiated&&form.p1_on&&<tr><td style={{...tdL,fontSize:11,color:"#065F46"}}>Path 1 (dB)</td>{p1_final.map((v,i)=><td key={i} style={{...tdS,fontSize:11,color:"#065F46"}}>{r2(v)}</td>)}</tr>}
                {isSameRoom&&form.p2_on&&<tr style={{background:"#F8FAFC"}}><td style={{...tdL,fontSize:11,color:"#1E40AF"}}>Path 2 (dB)</td>{p2_final.map((v,i)=><td key={i} style={{...tdS,fontSize:11,color:"#1E40AF"}}>{r2(v)}</td>)}</tr>}
                {isDiffRoom&&form.p2_on&&<tr style={{background:"#F8FAFC"}}><td style={{...tdL,fontSize:11,color:"#1E40AF"}}>Path 2 Return (dB)</td>{p2dr_final.map((v,i)=><td key={i} style={{...tdS,fontSize:11,color:"#1E40AF"}}>{r2(v)}</td>)}</tr>}
                {(isRadiated||(isSameRoom&&form.p3_on))&&<tr><td style={{...tdL,fontSize:11,color:"#5B21B6"}}>Path 3 (dB)</td>{p3_totalLp.map((v,i)=><td key={i} style={{...tdS,fontSize:11,color:"#5B21B6"}}>{r2(v)}</td>)}</tr>}
                <tr style={{background:"#EDE9FE"}}>
                  <td style={{...tdL,fontSize:11,color:"#4338CA",fontWeight:800}}>10^(L/10) sum</td>
                  {BANDS.map((_,i)=>{
                    const sum=activePaths2.reduce((s,a)=>s+Math.pow(10,(a[i]||0)/10),0);
                    return <td key={i} style={{...tdS,fontSize:10,color:"#4338CA",fontWeight:700}}>{sum.toFixed(0)}</td>;
                  })}
                </tr>
                <tr style={{background:"#4338CA"}}>
                  <td style={{...tdL,fontSize:11,color:"#fff",fontWeight:800,background:"#4338CA"}}>= 10·log₁₀(sum)</td>
                  {combined.map((v,i)=><td key={i} style={{...tdS,fontSize:12,color:"#fff",fontWeight:800,background:"#4338CA"}}>{r2(v)}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div style={{marginTop:20,borderRadius:12,overflow:"hidden",border:`2px solid ${ncColor}`}}>
          <div style={{overflowX:"auto"}}>
            <table style={{borderCollapse:"collapse",width:"100%",minWidth:640}}>
              <thead><tr style={{background:ncPass?"#F0FDF4":"#FEF2F2"}}>
                <th style={{...thS,textAlign:"left",background:"transparent",color:ncColor}}>NC Assessment</th>
                {BANDS.map(b=><th key={b} style={{...thS,background:"transparent",color:ncColor}}>{b} Hz</th>)}
              </tr></thead>
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
        <h2 style={{fontFamily:"Plus Jakarta Sans,sans-serif",fontWeight:800,fontSize:18,color:"#0F172A",margin:0}}>FCU — Duct-Borne Noise Assessment</h2>
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
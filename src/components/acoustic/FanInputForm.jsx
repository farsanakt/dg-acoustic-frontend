import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const BANDS     = [63, 125, 250, 500, 1000, 2000, 4000, 8000];
const BAND_KEYS = ["hz63","hz125","hz250","hz500","hz1000","hz2000","hz4000","hz8000"];

const A_WEIGHT_STD     = [-26.2,-16.1,-8.6,-3.2,0,1.2,1.0,-1.1];
const A_WEIGHT_DISPLAY = [26.2,16.1,8.6,3.2,0,-1.2,-1.0,1.1];
const ENV_CF           = [-4,-2,-1,0,0,0,0,0];

const ELBOW_WIDTH_BREAKS = [200,400,800];
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

const LINED_DEFAULT = {
  A: [0.04,0.08,0.14,0.22,0.32,0.40,0.53,0.53],
  B: [1.959,1.41,0.824,0.5,0.695,0.802,0.451,0.219],
  C: [0.917,0.941,1.079,1.087,0,0,0,0],
};

const NC_ROWS=[
  {nc:15,left:[47,36,29,22,17,14,12,11]},
  {nc:20,left:[51,40,33,26,22,19,17,16]},
  {nc:25,left:[54,44,37,31,27,24,22,21]},
  {nc:30,left:[57,48,41,35,31,29,28,27]},
  {nc:35,left:[60,52,45,40,36,34,33,32]},
  {nc:40,left:[64,56,50,45,41,39,38,37]},
  {nc:45,left:[67,60,54,49,46,44,43,42]},
  {nc:50,left:[71,64,58,54,51,49,48,47]},
  {nc:55,left:[74,67,62,58,56,54,53,52]},
  {nc:60,left:[77,71,67,63,61,59,58,57]},
  {nc:65,left:[80,75,71,68,66,64,63,62]},
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function r2(n){return Math.round(n*100)/100;}
function r1(n){return Math.round(n*10)/10;}
const ZERO8=()=>BANDS.map(()=>0);
function mmToFt(mm){return (mm||0)/304.8;}
function mToFt(m){return (m||0)*3.28084;}

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
  const w=Number(width_mm)||0;
  let ri=0;
  if(w>800) ri=3; else if(w>400) ri=2; else if(w>200) ri=1;
  const tbl=lined?ELBOW_LINED_TBL:ELBOW_UNLINED_TBL;
  return tbl[ri].map(v=>r2(-v*n));
}

function calcBranchIL(bW,bH,upW,upH){
  const Ab=mmToFt(bW)*mmToFt(bH),Au=mmToFt(upW)*mmToFt(upH);
  if(Ab<=0||Au<=0) return 0;
  return r2(10*Math.log10(Ab/(Au+Ab)));
}

// ERL Case 1 — DG acoustic formula
// ERL = 10·log10[1 + (a1·c0/(π·f·D))²] × −1
// D = sqrt(4·Area/π) in ft, a1=0.7, c0=1125.33 ft/s
function calcERLAcoustic(w_mm,h_mm){
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

// Distance effect: 10·log10(Q/(4πr²)) — scalar applied equally to all bands
function calcDistEffScalar(r_m,Q=2){
  const r=Math.max(0.01,Number(r_m)||1);
  return r2(10*Math.log10(Number(Q)/(4*Math.PI*r*r)));
}

// Space/Room Effect — Schultz formula per band
function calcSchultz(len,wid,hei,dist){
  const V=Number(len)*Number(wid)*Number(hei),r=Math.max(0.01,Number(dist)||1.5);
  if(V<=0) return ZERO8();
  return BANDS.map(f=>r2(-10*Math.log10(r)-5*Math.log10(V)-3*Math.log10(f)+12));
}

function getRoomEff(mode,rL,rW,rH,rD,dD,dQ){
  if(mode==="spaceRoom") return calcSchultz(rL,rW,rH,rD);
  if(mode==="distEffect"){
    const s=calcDistEffScalar(dD,dQ);
    return BANDS.map(()=>s);
  }
  return ZERO8();
}

function logSum(arrays){
  if(!arrays||!arrays.length) return ZERO8();
  return BANDS.map((_,i)=>r1(10*Math.log10(arrays.reduce((s,a)=>s+Math.pow(10,(a[i]||0)/10),0))));
}

function calcNCRating(lp){
  for(const row of NC_ROWS){ if(!lp.some((v,i)=>v>row.left[i])) return row.nc; } return ">65";
}

// Duct chain calculation
function calcDuctChain(ducts){
  return ducts.map((d,idx)=>{
    const isLined=d.type==="lined";
    const ductIL=isLined
      ?calcLinedIL(d.width_mm,d.height_mm,d.length_m,d.liningThick,d.coeffA)
      :calcUnlinedIL(d.width_mm,d.height_mm,d.length_m);
    const elbowN=Number(d.elbows)||0;
    const elbowIL=elbowN>0?calcElbowIL(d.width_mm,elbowN,isLined):ZERO8();
    const prev=idx>0?ducts[idx-1]:null;
    const branchDB=(d.branchIncluded&&prev)?calcBranchIL(d.width_mm,d.height_mm,prev.width_mm,prev.height_mm):0;
    const totalIL=BANDS.map((_,i)=>r2(ductIL[i]+elbowIL[i]+branchDB));
    return {ductIL,elbowIL,branchDB,totalIL,d};
  });
}

// ─── UI STYLE CONSTANTS ───────────────────────────────────────────────────────
const thS={border:"1px solid #E2E8F0",padding:"6px 8px",background:"#F1F5F9",fontWeight:700,color:"#475569",textAlign:"center",fontSize:12,whiteSpace:"nowrap"};
const tdS={border:"1px solid #E2E8F0",padding:"6px 8px",textAlign:"center",color:"#334155",fontSize:12};
const tdL={...tdS,textAlign:"left",fontWeight:600,whiteSpace:"nowrap",minWidth:220};

// ─── SHARED UI COMPONENTS ─────────────────────────────────────────────────────
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

function NumInput({label,value,onChange,unit,step=0.1,min,max}){
  const [local,setLocal]=useState(String(value??0));
  const [focus,setFocus]=useState(false);
  const prev=useRef(value);
  useEffect(()=>{if(!focus&&prev.current!==value){prev.current=value;setLocal(String(value??0));}},[value,focus]);
  const commit=()=>{setFocus(false);const f=isNaN(parseFloat(local))?0:parseFloat(local);setLocal(String(f));prev.current=f;onChange(f);};
  return (
    <div style={{display:"flex",flexDirection:"column",gap:4}}>
      {label&&<label style={{fontSize:11.5,fontWeight:600,color:"#475569"}}>{label}</label>}
      <div style={{position:"relative"}}>
        <input type="number" value={focus?local:String(value??0)} min={min} max={max} step={step}
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

function TextInput({label,value,onChange,placeholder}){
  return (
    <div style={{display:"flex",flexDirection:"column",gap:4}}>
      {label&&<label style={{fontSize:11.5,fontWeight:600,color:"#475569"}}>{label}</label>}
      <input type="text" value={value||""} placeholder={placeholder||""} onChange={e=>onChange(e.target.value)}
        style={{padding:"9px 10px",border:"1.5px solid #E2E8F0",borderRadius:7,fontSize:13.5,background:"#fff",color:"#0F172A",outline:"none"}}/>
    </div>
  );
}

function SelectInput({label,value,onChange,options}){
  return (
    <div style={{display:"flex",flexDirection:"column",gap:4}}>
      {label&&<label style={{fontSize:11.5,fontWeight:600,color:"#475569"}}>{label}</label>}
      <select value={value} onChange={e=>onChange(e.target.value)}
        style={{padding:"9px 10px",border:"1.5px solid #E2E8F0",borderRadius:7,fontSize:13.5,background:"#fff",color:"#0F172A",outline:"none",cursor:"pointer"}}>
        {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Section({title,color="#6366F1",badge,children,defaultOpen=true,onToggle,isOn}){
  const [open,setOpen]=useState(defaultOpen);
  const hasToggle=onToggle!==undefined;
  return (
    <div style={{background:"#fff",borderRadius:14,border:"1px solid #E2E8F0",overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,.05)"}}>
      <button onClick={()=>setOpen(o=>!o)} type="button"
        style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"13px 16px",background:`${color}0D`,border:"none",borderBottom:open?"1px solid #E2E8F0":"none",cursor:"pointer"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontFamily:"Plus Jakarta Sans,sans-serif",fontWeight:700,fontSize:13.5,color:"#0F172A"}}>{title}</span>
          {badge&&<span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:99,background:`${color}22`,color}}>{badge}</span>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {hasToggle&&<div onClick={e=>{e.stopPropagation();onToggle();}}
            style={{display:"flex",alignItems:"center",gap:0,borderRadius:99,border:`1.5px solid ${isOn?color:"#CBD5E1"}`,overflow:"hidden",fontSize:11,fontWeight:700,cursor:"pointer"}}>
            <span style={{padding:"3px 10px",background:isOn?color:"#F8FAFC",color:isOn?"#fff":"#94A3B8",transition:"all .15s"}}>ON</span>
            <span style={{padding:"3px 10px",background:!isOn?"#64748B":"#F8FAFC",color:!isOn?"#fff":"#94A3B8",transition:"all .15s"}}>OFF</span>
          </div>}
          {open?<ChevronUp size={15} color="#94A3B8"/>:<ChevronDown size={15} color="#94A3B8"/>}
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open&&<motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} transition={{duration:.2}} style={{overflow:"hidden"}}>
          <div style={{padding:"16px 16px 18px"}}>{children}</div>
        </motion.div>}
      </AnimatePresence>
    </div>
  );
}

function ILTable({rows}){
  return (
    <div style={{overflowX:"auto"}}>
      <table style={{borderCollapse:"collapse",width:"100%",minWidth:640}}>
        <thead>
          <tr>
            <th style={{...thS,textAlign:"left"}}>Parameter</th>
            {BANDS.map(b=><th key={b} style={thS}>{b} Hz</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row,ri)=>{
            const isTotal=row.highlight==="total";
            const isFinal=row.highlight==="final";
            const bg=isFinal?"#F0FDF4":isTotal?"#EFF6FF":"#fff";
            const fw=isTotal||isFinal?700:400;
            const col=row.color||(isTotal?"#1E40AF":isFinal?"#065F46":"#334155");
            return (
              <tr key={ri} style={{background:bg}}>
                <td style={{...tdL,fontWeight:fw,color:col}}>{row.label}</td>
                {(row.values||ZERO8()).map((v,i)=>(
                  <td key={i} style={{...tdS,fontWeight:fw,color:col,background:row.highlight?bg:undefined}}>{v}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// NC result display
function NCResult({lp,required,color="#6366F1"}){
  const calcNC=calcNCRating(lp);
  const req=Number(required)||40;
  const ncRow=NC_ROWS.find(r=>r.nc===req)||NC_ROWS[5];
  const addlRed=lp.map((v,i)=>r1(v-ncRow.left[i]));
  const pass=typeof calcNC==="number"&&calcNC<=req;
  const ncColor=calcNC===null?"#64748B":pass?"#16A34A":"#DC2626";
  return (
    <div style={{marginTop:12,display:"flex",flexDirection:"column",gap:8}}>
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <div style={{padding:"10px 18px",borderRadius:10,background:pass?"#F0FDF4":"#FEF2F2",border:`2px solid ${ncColor}`,fontWeight:800,fontSize:14,color:ncColor,fontFamily:"Plus Jakarta Sans,sans-serif"}}>
          Calculated NC {calcNC} &nbsp;{pass?"✓ PASS":"✗ FAIL"}
        </div>
        <div style={{fontSize:12,color:"#64748B"}}>Required: <strong>NC {req}</strong></div>
      </div>
      {!pass&&<ILTable rows={[
        {label:"NC Criterion",values:ncRow.left,color:"#475569"},
        {label:"Lp @ Receiver",values:lp,color:"#334155"},
        {label:"Additional Reduction Required (dB)",values:addlRed,color:"#DC2626"},
      ]}/>}
    </div>
  );
}

// ─── DEFAULT DATA ─────────────────────────────────────────────────────────────
const emptyBand=()=>({hz63:0,hz125:0,hz250:0,hz500:0,hz1000:0,hz2000:0,hz4000:0,hz8000:0});
const emptyCoeffA=()=>({hz63:0,hz125:0,hz250:0,hz500:0,hz1000:0,hz2000:0,hz4000:0,hz8000:0});

function defaultDuct(label="Duct 1"){
  return {
    label,type:"unlined",
    width_mm:0,height_mm:0,length_m:0,
    elbows:0,
    branchIncluded:false,
    liningThick:1,
    coeffA:emptyCoeffA(),
    showCoeff:false,
  };
}

function defaultAttenuator(){
  return {
    model:"",
    il:emptyBand(),
  };
}

function defaultSheet(type){
  // type: "intake" | "supply" | "extract" | "exhaust"
  const isIndoor=type==="supply"||type==="extract";
  return {
    // Header info
    equipmentId:"",
    noisePath:"",
    modelNumber:"",
    unitLocation:"",
    receiverLocation:"",
    // SWL input (non-A weighted per band)
    swl:emptyBand(),
    // ENV correction — applied for supply/intake, not extract/exhaust per DG sheet
    envOn: type==="supply"||type==="intake",
    // Duct chain
    ducts:[defaultDuct("Duct 1")],
    // ERL
    erlOn:true,
    erlW:0,erlH:0,
    // Room/Distance effect
    roomMode: isIndoor?"spaceRoom":"distEffect",
    roomLen:10,roomWid:10,roomHei:4.5,roomDist:1.5,
    distDist:3,distQ:2,
    // Required NC
    requiredNC:40,
    // Attenuator (extract sheet only, but available for all)
    attenuatorOn:false,
    attenuators:[defaultAttenuator()],
  };
}

function defaultForm(){
  return {
    fanType:"supply",   // "supply" | "exhaust"
    // Supply fan: intake + supply sheets
    intake: defaultSheet("intake"),
    supply: defaultSheet("supply"),
    // Exhaust fan: extract + exhaust sheets
    extract: defaultSheet("extract"),
    exhaust: defaultSheet("exhaust"),
    activeSheet:"intake", // which sheet tab is visible
  };
}

// ─── DUCT CARDS COMPONENT ─────────────────────────────────────────────────────
function DuctCards({ducts,results,color,onAdd,onRemove,onPatch}){
  const textCol=color==="#0E9F8E"?"#065F46":color==="#3B82F6"?"#1E40AF":color==="#8B5CF6"?"#5B21B6":"#1E40AF";
  const bgCol=color==="#0E9F8E"?"#F0FDF4":color==="#3B82F6"?"#EFF6FF":color==="#8B5CF6"?"#F5F3FF":"#EFF6FF";
  const borderCol=color==="#0E9F8E"?"#A7F3D0":color==="#3B82F6"?"#BFDBFE":color==="#8B5CF6"?"#DDD6FE":"#BFDBFE";
  const headerBg=color==="#0E9F8E"?"#D1FAE5":color==="#3B82F6"?"#DBEAFE":color==="#8B5CF6"?"#EDE9FE":"#DBEAFE";

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {ducts.map((d,idx)=>{
        const res=results[idx]||{ductIL:ZERO8(),elbowIL:ZERO8(),branchDB:0,totalIL:ZERO8()};
        const isLined=d.type==="lined";
        return (
          <div key={idx} style={{borderRadius:10,border:`1.5px solid ${borderCol}`,background:bgCol,overflow:"hidden"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 14px",background:headerBg,borderBottom:`1px solid ${borderCol}`}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{width:24,height:24,borderRadius:99,background:color,color:"#fff",fontSize:12,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{idx+1}</span>
                <input value={d.label} onChange={e=>onPatch(idx,{label:e.target.value})}
                  style={{fontSize:13,fontWeight:700,color:textCol,background:"transparent",border:"none",outline:"none",width:160}}/>
              </div>
              {ducts.length>1&&<button type="button" onClick={()=>onRemove(idx)}
                style={{fontSize:11,color:"#DC2626",background:"#FEE2E2",border:"1px solid #FECACA",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontWeight:700}}>Remove</button>}
            </div>
            <div style={{padding:"12px 14px",display:"flex",flexDirection:"column",gap:10}}>
              {/* Type toggle */}
              <div style={{display:"flex",gap:6}}>
                {[{v:"unlined",label:"Unlined"},{v:"lined",label:"Lined"}].map(o=>(
                  <button key={o.v} type="button" onClick={()=>onPatch(idx,{type:o.v})}
                    style={{padding:"5px 14px",borderRadius:99,fontSize:12,fontWeight:700,cursor:"pointer",
                      border:`1.5px solid ${d.type===o.v?color:"#CBD5E1"}`,
                      background:d.type===o.v?color:"#F8FAFC",color:d.type===o.v?"#fff":"#64748B"}}>
                    {o.label}
                  </button>
                ))}
              </div>
              {/* Dims */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
                <NumInput label="Width (mm)" value={d.width_mm} step={1} unit="mm" onChange={v=>onPatch(idx,{width_mm:v})}/>
                <NumInput label="Height (mm)" value={d.height_mm} step={1} unit="mm" onChange={v=>onPatch(idx,{height_mm:v})}/>
                <NumInput label="Length (m)" value={d.length_m} unit="m" onChange={v=>onPatch(idx,{length_m:v})}/>
                <NumInput label="No. of Elbows" value={d.elbows} step={1} min={0} onChange={v=>onPatch(idx,{elbows:Math.max(0,Math.round(v))})}/>
              </div>
              {/* Branch toggle — from duct 2 onwards */}
              {idx>0&&(
                <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                  <span style={{fontSize:12,fontWeight:600,color:"#475569"}}>Branch Power Division:</span>
                  <div style={{display:"flex",gap:6}}>
                    {[{v:true,label:"Included"},{v:false,label:"Not Included"}].map(o=>(
                      <button key={String(o.v)} type="button" onClick={()=>onPatch(idx,{branchIncluded:o.v})}
                        style={{padding:"4px 12px",borderRadius:99,fontSize:12,fontWeight:700,cursor:"pointer",
                          border:`1.5px solid ${d.branchIncluded===o.v?color:"#CBD5E1"}`,
                          background:d.branchIncluded===o.v?color:"#F8FAFC",color:d.branchIncluded===o.v?"#fff":"#64748B"}}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {idx>0&&d.branchIncluded&&(
                <div style={{padding:"7px 10px",borderRadius:8,border:`1px solid ${borderCol}`,background:"#F8FAFC",fontSize:11.5,color:"#475569"}}>
                  Branch: <strong>{d.width_mm}×{d.height_mm} mm</strong> | Upstream: previous duct (auto)
                </div>
              )}
              {isLined&&(
                <div style={{display:"grid",gridTemplateColumns:"1fr 3fr",gap:8}}>
                  <NumInput label="Lining Thickness (in)" value={d.liningThick} step={0.5} min={0.5} unit="in" onChange={v=>onPatch(idx,{liningThick:v})}/>
                  <div/>
                </div>
              )}
              {/* IL preview */}
              <ILTable rows={[
                ...(idx>0&&d.branchIncluded?[{label:`Branch Power Division IL (dB)`,values:BANDS.map(()=>res.branchDB),color}]:[]),
                {label:`${isLined?"Lined":"Unlined"} Duct IL (dB)`,values:res.ductIL,color},
                ...(Number(d.elbows)>0?[{label:`Elbow IL ×${d.elbows} (dB)`,values:res.elbowIL,color}]:[]),
                {label:"Total IL this duct (dB)",values:res.totalIL,color:textCol,highlight:"total"},
              ]}/>
            </div>
          </div>
        );
      })}
      <button type="button" onClick={onAdd}
        style={{padding:"10px",borderRadius:10,border:`2px dashed ${color}`,background:"transparent",color,fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
        + Add Another Duct
      </button>
    </div>
  );
}

// ─── SHEET CALCULATION ENGINE ─────────────────────────────────────────────────
function calcSheet(sheet,applyEnv){
  const swlArr=BAND_KEYS.map(k=>Number(sheet.swl[k])||0);
  const ductResults=calcDuctChain(sheet.ducts||[]);
  const allDuctIL=BANDS.map((_,i)=>ductResults.reduce((s,r)=>s+r.totalIL[i],0));
  const envArr=applyEnv?ENV_CF:ZERO8();
  const erlArr=sheet.erlOn?calcERLAcoustic(sheet.erlW,sheet.erlH):ZERO8();
  const roomEff=getRoomEff(sheet.roomMode,sheet.roomLen,sheet.roomWid,sheet.roomHei,sheet.roomDist,sheet.distDist,sheet.distQ);
  // Chain: SWL + ENV + allDuctIL + ERL + roomEff = Lp before attenuator
  const lpBeforeAtten=swlArr.map((_,i)=>r1(swlArr[i]+envArr[i]+allDuctIL[i]+erlArr[i]+roomEff[i]));
  // Attenuator IL (sum all attenuators)
  let attenIL=ZERO8();
  if(sheet.attenuatorOn&&sheet.attenuators){
    attenIL=BANDS.map((_,i)=>r2(sheet.attenuators.reduce((s,a)=>s+(Number(BAND_KEYS.map(k=>a.il[k])[i])||0),0)));
  }
  const totalLp=lpBeforeAtten.map((v,i)=>r1(v+attenIL[i]));
  return {swlArr,envArr,ductResults,allDuctIL,erlArr,roomEff,lpBeforeAtten,attenIL,totalLp};
}

// ─── SHEET FORM UI ────────────────────────────────────────────────────────────
function SheetForm({sheet,onChange,sheetType,color,calc}){
  const set=(k,v)=>onChange({...sheet,[k]:v});
  const setSwl=v=>onChange({...sheet,swl:v});
  const addDuct=()=>onChange({...sheet,ducts:[...sheet.ducts,defaultDuct(`Duct ${sheet.ducts.length+1}`)]});
  const removeDuct=idx=>onChange({...sheet,ducts:sheet.ducts.filter((_,i)=>i!==idx)});
  const patchDuct=(idx,patch)=>onChange({...sheet,ducts:sheet.ducts.map((d,i)=>i===idx?{...d,...patch}:d)});
  const addAtten=()=>onChange({...sheet,attenuators:[...(sheet.attenuators||[]),defaultAttenuator()]});
  const removeAtten=idx=>onChange({...sheet,attenuators:(sheet.attenuators||[]).filter((_,i)=>i!==idx)});
  const patchAtten=(idx,k,v)=>onChange({...sheet,attenuators:(sheet.attenuators||[]).map((a,i)=>i===idx?{...a,[k]:v}:a)});
  const patchAttenIL=(idx,bk,v)=>onChange({...sheet,attenuators:(sheet.attenuators||[]).map((a,i)=>i===idx?{...a,il:{...a.il,[bk]:v}}:a)});

  const isIndoor=sheetType==="supply"||sheetType==="extract";
  const labelMap={intake:"Intake Air Side",supply:"Supply Air Side",extract:"Extract Air Side",exhaust:"Exhaust Air Side"};
  const sheetLabel=labelMap[sheetType]||sheetType;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>

      {/* Header Info */}
      <Section title="Project Information" color={color}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <TextInput label="Equipment ID" value={sheet.equipmentId} onChange={v=>set("equipmentId",v)} placeholder="e.g. CPEF-01A&01B"/>
          <TextInput label="Noise Path" value={sheet.noisePath} onChange={v=>set("noisePath",v)} placeholder={`e.g. ${sheetLabel}`}/>
          <TextInput label="Model Number" value={sheet.modelNumber} onChange={v=>set("modelNumber",v)} placeholder="e.g. THGT/4-1250-9/16"/>
          <TextInput label="Unit Location" value={sheet.unitLocation} onChange={v=>set("unitLocation",v)} placeholder="e.g. Ground Floor Fan Room"/>
        </div>
        <div style={{marginTop:10}}>
          <TextInput label="Receiver Location" value={sheet.receiverLocation} onChange={v=>set("receiverLocation",v)} placeholder="e.g. 1.5 M from nearest air grill"/>
        </div>
      </Section>

      {/* Sound Power Level Input */}
      <Section title="Sound Power Level (SWL) — per Octave Band" color={color}>
        <div style={{overflowX:"auto"}}>
          <table style={{borderCollapse:"collapse",width:"100%",minWidth:640}}>
            <thead><tr>
              <th style={{...thS,textAlign:"left"}}>Parameter</th>
              {BANDS.map(b=><th key={b} style={thS}>{b} Hz</th>)}
            </tr></thead>
            <tbody>
              <tr>
                <td style={tdL}>Sound Power Level (dB)</td>
                {BAND_KEYS.map(k=><td key={k} style={{...tdS,padding:"3px"}}>
                  <BandInput value={sheet.swl[k]??0} onCommit={v=>setSwl({...sheet.swl,[k]:v})}/>
                </td>)}
              </tr>
              {sheet.envOn&&<tr style={{background:"#FFF9E6"}}>
                <td style={{...tdL,color:"#92400E",fontWeight:700}}>Environmental Correction Factor</td>
                {ENV_CF.map((v,i)=><td key={i} style={{...tdS,color:"#92400E",fontWeight:700}}>{v}</td>)}
              </tr>}
            </tbody>
          </table>
        </div>
        <div style={{marginTop:10,display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:12,fontWeight:600,color:"#475569"}}>ENV Correction:</span>
          <div style={{display:"flex",gap:6}}>
            {[{v:true,label:"Applied"},{v:false,label:"Not Applied"}].map(o=>(
              <button key={String(o.v)} type="button" onClick={()=>set("envOn",o.v)}
                style={{padding:"4px 12px",borderRadius:99,fontSize:12,fontWeight:700,cursor:"pointer",
                  border:`1.5px solid ${sheet.envOn===o.v?color:"#CBD5E1"}`,
                  background:sheet.envOn===o.v?color:"#F8FAFC",
                  color:sheet.envOn===o.v?"#fff":"#64748B"}}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </Section>

      {/* Duct Chain */}
      <Section title="Duct Transmission Path" color={color}>
        <DuctCards
          ducts={sheet.ducts} results={calc.ductResults} color={color}
          onAdd={addDuct} onRemove={removeDuct} onPatch={patchDuct}
        />
      </Section>

      {/* End Reflection Factor */}
      <Section title="End Reflection Factor (ERL) — Diffuser / Grill" color={color}
        onToggle={()=>set("erlOn",!sheet.erlOn)} isOn={sheet.erlOn}>
        {sheet.erlOn&&<>
          <div style={{padding:"10px 14px",borderRadius:9,background:"#F8FAFC",border:"1px solid #E2E8F0",fontSize:12,color:"#475569",marginBottom:12}}>
            <strong>Formula:</strong> ERL = 10·log₁₀[1 + (0.7·c₀ / π·f·D)²] × −1 &nbsp;|&nbsp; D = √(4·Area/π) in ft, c₀ = 1125.33 ft/s
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
            <NumInput label="Duct/Grill Width (mm)" value={sheet.erlW} step={1} unit="mm" onChange={v=>set("erlW",v)}/>
            <NumInput label="Duct/Grill Height (mm)" value={sheet.erlH} step={1} unit="mm" onChange={v=>set("erlH",v)}/>
          </div>
          <ILTable rows={[{label:`ERL — ${sheet.erlW}×${sheet.erlH} mm (dB)`,values:calc.erlArr,color}]}/>
        </>}
      </Section>

      {/* Room / Distance Effect */}
      <Section title="Room / Distance Effect @ Receiver" color={color}>
        <div style={{marginBottom:14}}>
          <p style={{fontSize:11.5,fontWeight:600,color:"#475569",margin:"0 0 8px"}}>Correction Method</p>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {[
              {v:"spaceRoom",label:"Space / Room Effect",desc:"−10log(r)−5log(V)−3log(f)+12"},
              {v:"distEffect",label:"Distance Effect",desc:"10·log(Q/4πr²) scalar"},
              {v:"none",label:"None",desc:"No correction"},
            ].map(o=>(
              <button key={o.v} type="button" onClick={()=>set("roomMode",o.v)}
                style={{padding:"7px 14px",borderRadius:9,fontSize:12.5,fontWeight:700,border:`1.5px solid ${sheet.roomMode===o.v?color:"#E2E8F0"}`,background:sheet.roomMode===o.v?"#EEF2FF":"#F8FAFC",color:sheet.roomMode===o.v?"#4338CA":"#64748B",cursor:"pointer",display:"flex",flexDirection:"column",gap:2}}>
                <span>{o.label}</span>
                <span style={{fontSize:10,fontWeight:400,color:sheet.roomMode===o.v?color:"#94A3B8"}}>{o.desc}</span>
              </button>
            ))}
          </div>
        </div>
        {sheet.roomMode==="spaceRoom"&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,margin:"10px 0"}}>
            <NumInput label="Room Length (m)" value={sheet.roomLen} unit="m" onChange={v=>set("roomLen",v)}/>
            <NumInput label="Room Width (m)" value={sheet.roomWid} unit="m" onChange={v=>set("roomWid",v)}/>
            <NumInput label="Room Height (m)" value={sheet.roomHei} unit="m" onChange={v=>set("roomHei",v)}/>
            <NumInput label="Dist to Receiver (m)" value={sheet.roomDist} unit="m" onChange={v=>set("roomDist",v)}/>
          </div>
        )}
        {sheet.roomMode==="distEffect"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 2fr",gap:10,margin:"10px 0"}}>
            <NumInput label="Distance r (m)" value={sheet.distDist||3} unit="m" onChange={v=>set("distDist",v)}/>
            <NumInput label="Directivity Q" value={sheet.distQ||2} step={1} onChange={v=>set("distQ",v)}/>
            <div style={{display:"flex",alignItems:"flex-end",paddingBottom:4}}>
              <span style={{fontSize:12,color:"#475569"}}>= <strong style={{color}}>{r2(calcDistEffScalar(sheet.distDist||3,sheet.distQ||2))} dB</strong> (all bands)</span>
            </div>
          </div>
        )}
        {sheet.roomMode!=="none"&&<ILTable rows={[{label:sheet.roomMode==="spaceRoom"?"Space/Room Effect (dB)":"Distance Effect (dB)",values:calc.roomEff,color}]}/>}
      </Section>

      {/* Sound Attenuator */}
      <Section title="Sound Attenuator" color={color}
        onToggle={()=>set("attenuatorOn",!sheet.attenuatorOn)} isOn={sheet.attenuatorOn}>
        {sheet.attenuatorOn&&<>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {(sheet.attenuators||[]).map((atten,ai)=>(
              <div key={ai} style={{borderRadius:10,border:"1.5px solid #E2E8F0",background:"#FAFAFA",padding:"12px 14px",display:"flex",flexDirection:"column",gap:10}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{width:22,height:22,borderRadius:99,background:color,color:"#fff",fontSize:11,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{ai+1}</span>
                    <span style={{fontSize:13,fontWeight:700,color:"#334155"}}>Sound Attenuator {ai+1}</span>
                  </div>
                  {(sheet.attenuators||[]).length>1&&<button type="button" onClick={()=>removeAtten(ai)}
                    style={{fontSize:11,color:"#DC2626",background:"#FEE2E2",border:"1px solid #FECACA",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontWeight:700}}>Remove</button>}
                </div>
                <TextInput label="Attenuator Model" value={atten.model} onChange={v=>patchAtten(ai,"model",v)} placeholder="e.g. SA 20"/>
                <div>
                  <label style={{fontSize:11.5,fontWeight:600,color:"#475569",display:"block",marginBottom:6}}>Insertion Loss per Octave Band (dB)</label>
                  <div style={{overflowX:"auto"}}>
                    <table style={{borderCollapse:"collapse",width:"100%",minWidth:640}}>
                      <thead><tr><th style={{...thS,textAlign:"left",minWidth:160}}>Parameter</th>{BANDS.map(b=><th key={b} style={thS}>{b} Hz</th>)}</tr></thead>
                      <tbody><tr>
                        <td style={tdL}>Attn. IL — {atten.model||`SA ${ai+1}`} (dB)</td>
                        {BAND_KEYS.map(k=><td key={k} style={{...tdS,padding:"3px"}}>
                          <BandInput value={atten.il[k]??0} onCommit={v=>patchAttenIL(ai,k,v)}/>
                        </td>)}
                      </tr></tbody>
                    </table>
                  </div>
                </div>
              </div>
            ))}
            <button type="button" onClick={addAtten}
              style={{padding:"9px",borderRadius:9,border:`2px dashed ${color}`,background:"transparent",color,fontSize:12.5,fontWeight:700,cursor:"pointer"}}>
              + Add Attenuator
            </button>
          </div>
        </>}
      </Section>
    </div>
  );
}

// ─── RESULTS SHEET ────────────────────────────────────────────────────────────
function SheetResults({sheet,calc,sheetType,color,requiredNC}){
  const isLined=(d)=>d.type==="lined";
  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <Section title="Full Calculation Chain" color={color}>
        <ILTable rows={[
          {label:"Sound Power Level (dB)",values:calc.swlArr},
          ...(sheet.envOn?[{label:"Environmental Correction Factor",values:calc.envArr}]:[]),
          ...calc.ductResults.flatMap((res,idx)=>[
            ...(idx>0&&res.d.branchIncluded?[{label:`${res.d.label} — Branch Power Division (dB)`,values:BANDS.map(()=>res.branchDB),color}]:[]),
            {label:`${res.d.label} — ${isLined(res.d)?"Lined":"Unlined"} Duct IL (dB)`,values:res.ductIL,color},
            ...(Number(res.d.elbows)>0?[{label:`${res.d.label} — Elbow IL ×${res.d.elbows} (dB)`,values:res.elbowIL,color}]:[]),
          ]),
          ...(sheet.erlOn?[{label:`End Reflection Factor — ${sheet.erlW}×${sheet.erlH}mm (dB)`,values:calc.erlArr,color}]:[]),
          ...(sheet.roomMode!=="none"?[{label:sheet.roomMode==="spaceRoom"?"Space/Room Effect (dB)":"Distance Effect (dB)",values:calc.roomEff,color}]:[]),
          {label:"Lp @ Receiver — Before Attenuator (dB)",values:calc.lpBeforeAtten,highlight:sheet.attenuatorOn?"":"total",color},
          ...(sheet.attenuatorOn&&(sheet.attenuators||[]).map((a,ai)=>({label:`${a.model||`SA ${ai+1}`} — Insertion Loss (dB)`,values:BAND_KEYS.map(k=>Number(a.il[k])||0),color:"#64748B"}))||[]),
          ...(sheet.attenuatorOn?[{label:"Total Lp @ Receiver — After Attenuator (dB)",values:calc.totalLp,highlight:"total",color}]:[]),
        ]}/>
      </Section>
      <Section title="NC Assessment" color={color}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,flexWrap:"wrap"}}>
          <span style={{fontSize:12.5,fontWeight:600,color:"#475569"}}>Required NC:</span>
          <SelectInput value={String(requiredNC)}
            onChange={v=>sheet._setRequired&&sheet._setRequired(Number(v))}
            options={NC_ROWS.map(r=>({value:String(r.nc),label:`NC ${r.nc}`}))}/>
        </div>
        <NCResult lp={calc.totalLp} required={requiredNC} color={color}/>
        <div style={{marginTop:14}}>
          <ILTable rows={[
            {label:"Lp @ Receiver (dB)",values:calc.totalLp,color},
            {label:`NC ${requiredNC} Criterion`,values:(NC_ROWS.find(r=>r.nc===Number(requiredNC))||NC_ROWS[5]).left,color:"#475569"},
            {label:"Excess above NC Criterion (dB)",values:calc.totalLp.map((v,i)=>r1(v-(NC_ROWS.find(r=>r.nc===Number(requiredNC))||NC_ROWS[5]).left[i])),color:"#DC2626"},
          ]}/>
        </div>
      </Section>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function FanInputForm({project}){
  const [form,setForm]=useState(defaultForm);
  const [tab,setTab]=useState("input"); // "input" | "results"

  const setSheet=(key,val)=>setForm(f=>({...f,[key]:val}));

  // Fan type sheets
  const supplySheets = form.fanType==="supply"
    ? [{key:"intake",label:"Intake Air Side",color:"#0E9F8E"},{key:"supply",label:"Supply Air Side",color:"#6366F1"}]
    : [{key:"extract",label:"Extract Air Side",color:"#F59E0B"},{key:"exhaust",label:"Exhaust Air Side",color:"#EF4444"}];

  const activeKey = form.activeSheet;
  const activeColor = supplySheets.find(s=>s.key===activeKey)?.color||"#6366F1";
  const activeSheet = form[activeKey];

  // Required NC per sheet (stored in form)
  const reqNcKey = `${activeKey}_requiredNC`;
  const requiredNC = form[reqNcKey]||40;

  // Calculate active sheet
  const applyEnv = activeSheet?.envOn||false;
  const calc = activeSheet ? calcSheet(activeSheet,applyEnv) : null;

  const TAB=({id,label})=>(
    <button onClick={()=>setTab(id)} type="button"
      style={{padding:"9px 20px",fontSize:13.5,fontWeight:tab===id?700:500,
        borderBottom:`2.5px solid ${tab===id?"#6366F1":"transparent"}`,
        color:tab===id?"#6366F1":"#64748B",background:"none",cursor:"pointer"}}>
      {label}
    </button>
  );

  return (
    <div style={{fontFamily:"Inter,system-ui,sans-serif",background:"#F8FAFC",padding:"0 0 60px"}}>
      {/* Input / Results tab bar */}
      <div style={{display:"flex",gap:0,marginBottom:20,borderBottom:"1px solid #E2E8F0",background:"#fff"}}>
        <TAB id="input" label="Input"/>
        <TAB id="results" label="Results"/>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:20,padding:"0 4px"}}>

        {/* Fan Type Selector */}
        <div style={{background:"#fff",borderRadius:14,border:"1px solid #E2E8F0",padding:"18px 20px",boxShadow:"0 1px 4px rgba(0,0,0,.05)"}}>
          <div style={{display:"flex",gap:16,flexWrap:"wrap",alignItems:"flex-end"}}>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              <p style={{margin:0,fontSize:12.5,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:.5}}>Fan Type</p>
              <div style={{display:"flex",gap:8}}>
                {[
                  {v:"supply",label:"Supply Fan",desc:"Intake Air + Supply Air"},
                  {v:"exhaust",label:"Exhaust Fan",desc:"Extract Air + Exhaust Air"},
                ].map(o=>(
                  <button key={o.v} type="button" onClick={()=>{
                    setForm(f=>({...f,fanType:o.v,activeSheet:o.v==="supply"?"intake":"extract"}));
                  }}
                    style={{padding:"10px 20px",borderRadius:10,fontSize:13.5,fontWeight:700,cursor:"pointer",
                      border:`2px solid ${form.fanType===o.v?"#6366F1":"#E2E8F0"}`,
                      background:form.fanType===o.v?"#EEF2FF":"#F8FAFC",
                      color:form.fanType===o.v?"#4338CA":"#64748B"}}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{flex:1,minWidth:220,display:"flex",flexDirection:"column",gap:6}}>
              <label style={{fontSize:12.5,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:.5}}>Fan Name / Description</label>
              <input type="text" value={form.fanName||""} placeholder="e.g. AHU-01 Supply Fan, Kitchen Exhaust Fan..."
                onChange={e=>setForm(f=>({...f,fanName:e.target.value}))}
                style={{padding:"10px 12px",border:"1.5px solid #E2E8F0",borderRadius:9,fontSize:13.5,background:"#fff",color:"#0F172A",outline:"none",width:"100%"}}/>
            </div>
          </div>
        </div>

        {/* Sheet Tab Selector */}
        <div style={{background:"#fff",borderRadius:14,border:"1px solid #E2E8F0",overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,.05)"}}>
          <div style={{display:"flex",borderBottom:"1px solid #E2E8F0"}}>
            {supplySheets.map(s=>(
              <button key={s.key} type="button" onClick={()=>setForm(f=>({...f,activeSheet:s.key}))}
                style={{flex:1,padding:"13px 10px",fontSize:13.5,fontWeight:activeKey===s.key?700:500,
                  borderBottom:`3px solid ${activeKey===s.key?s.color:"transparent"}`,
                  color:activeKey===s.key?s.color:"#64748B",background:"none",cursor:"pointer",
                  display:"flex",flexDirection:"column",alignItems:"center",gap:3,border:"none"}}>
                <span>{s.label}</span>
                {form[s.key]?.equipmentId&&<span style={{fontSize:10,color:"#94A3B8",fontWeight:400}}>{form[s.key].equipmentId}</span>}
              </button>
            ))}
          </div>
          {/* Sheet header info mini-display */}
          {(activeSheet?.equipmentId||activeSheet?.modelNumber||activeSheet?.unitLocation||activeSheet?.receiverLocation)&&(
            <div style={{padding:"10px 16px",background:"#F8FAFC",fontSize:12,color:"#64748B",display:"flex",gap:16,flexWrap:"wrap"}}>
              {activeSheet.equipmentId&&<span><strong>ID:</strong> {activeSheet.equipmentId}</span>}
              {activeSheet.modelNumber&&<span><strong>Model:</strong> {activeSheet.modelNumber}</span>}
              {activeSheet.unitLocation&&<span><strong>Location:</strong> {activeSheet.unitLocation}</span>}
              {activeSheet.receiverLocation&&<span><strong>Receiver:</strong> {activeSheet.receiverLocation}</span>}
            </div>
          )}
        </div>

        {/* Input / Results Tab Content */}
        {tab==="input"&&calc&&(
          <SheetForm
            sheet={activeSheet}
            onChange={v=>setSheet(activeKey,v)}
            sheetType={activeKey}
            color={activeColor}
            calc={calc}
          />
        )}

        {tab==="results"&&calc&&(
          <>
            {/* Required NC selector for results */}
            <div style={{display:"flex",alignItems:"center",gap:12,background:"#fff",borderRadius:12,padding:"14px 18px",border:"1px solid #E2E8F0"}}>
              <span style={{fontSize:13,fontWeight:700,color:"#475569"}}>Required NC — {supplySheets.find(s=>s.key===activeKey)?.label}:</span>
              <div style={{width:160}}>
                <SelectInput value={String(requiredNC)}
                  onChange={v=>setForm(f=>({...f,[reqNcKey]:Number(v)}))}
                  options={NC_ROWS.map(r=>({value:String(r.nc),label:`NC ${r.nc}`}))}/>
              </div>
              {/* quick NC result badge */}
              {(()=>{
                const calcNC=calcNCRating(calc.totalLp);
                const pass=typeof calcNC==="number"&&calcNC<=Number(requiredNC);
                const ncColor=pass?"#16A34A":"#DC2626";
                return <div style={{padding:"8px 16px",borderRadius:9,background:pass?"#F0FDF4":"#FEF2F2",border:`2px solid ${ncColor}`,fontWeight:800,fontSize:14,color:ncColor}}>
                  NC {calcNC} {pass?"✓ PASS":"✗ FAIL"}
                </div>;
              })()}
            </div>
            <SheetResults
              sheet={activeSheet}
              calc={calc}
              sheetType={activeKey}
              color={activeColor}
              requiredNC={requiredNC}
            />
          </>
        )}
      </div>
    </div>
  );
}
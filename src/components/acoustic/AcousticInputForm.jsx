import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap, Box, Wind, Gauge, MapPin,
  ChevronDown, ChevronUp, Loader2, Calculator, Info,
} from "lucide-react";
import toast from "react-hot-toast";
import { createCalculationApi, updateCalculationApi, runCalculationApi } from "@/api/calculationApi";

const BANDS     = [63, 125, 250, 500, 1000, 2000, 4000, 8000];
const BAND_KEYS = ["hz63","hz125","hz250","hz500","hz1000","hz2000","hz4000","hz8000"];

const A_WEIGHTING = {
  hz63: -26.2, hz125: -16.1, hz250: -8.6, hz500: -3.2,
  hz1000: 0,   hz2000: 1.2,  hz4000: 1.0, hz8000: -1.1,
};

const NOISE_INPUT_TYPES = [
  { value: "swl_db",  label: "SWL dB" },
  { value: "swl_dba", label: "SWL dB(A)" },
  { value: "spl_db",  label: "SPL dB" },
  { value: "spl_dba", label: "SPL dB(A)" },
];

const DISTANCE_MODES = ["spl_db", "spl_dba"];

function round1(n) { return Math.round(n * 10) / 10; }

const EMPTY_BAND = { hz63:0,hz125:0,hz250:0,hz500:0,hz1000:0,hz2000:0,hz4000:0,hz8000:0 };

// Default Coeff A values for 1-inch lining (from doc)
const DEFAULT_COEFF_A_1INCH = {
  hz63:0.04, hz125:0.08, hz250:0.14, hz500:0.22,
  hz1000:0.32, hz2000:0.40, hz4000:0.53, hz8000:0.53,
};
const DEFAULT_COEFF_A_2INCH = {
  hz63:0.05, hz125:0.10, hz250:0.20, hz500:0.35,
  hz1000:0.55, hz2000:0.70, hz4000:0.80, hz8000:0.80,
};

const DEFAULT = {
  noisePath: "exhaust",
  generator: {
    equipmentId:"", modelNumber:"", ratedKva:0, buildingRef:"", swl_dba:0,
    noiseInputType: "swl_db",
    measurementDistance_m: 1,
    rawBand: {...EMPTY_BAND},
    swl:     {...EMPTY_BAND},
  },
  room:       { length_m:0, width_m:0, height_m:0, avgAbsCoeff:0.9 },
  duct: {
    width_mm:0, height_mm:0, length_m:0, lining:"unlined",
    elbows:0, terminationType:"wall",
    coeffA: {...DEFAULT_COEFF_A_1INCH},
  },
  attenuator: { model:"", width_mm:0, height_mm:0, length_mm:0, pressureDrop_pa:0, il:{...EMPTY_BAND} },
  receiver:   { description:"", distance_m:3, directivity:2, requiredNC:65, requiredNR:65, required_dba:65 },
};

function computeSWLFromRaw(noiseInputType, rawBand, distance_m) {
  const r = distance_m > 0 ? distance_m : 1;
  const distanceTerm = 10 * Math.log10(4 * Math.PI * r * r);
  const out = {};
  BAND_KEYS.forEach(k => {
    const raw = rawBand?.[k] ?? 0;
    const corr = A_WEIGHTING[k];
    let swl;
    if (noiseInputType === "swl_dba")      swl = raw - corr;
    else if (noiseInputType === "spl_db")  swl = raw + distanceTerm;
    else if (noiseInputType === "spl_dba") swl = (raw - corr) + distanceTerm;
    else                                   swl = raw;
    out[k] = round1(swl);
  });
  return out;
}

/* ─── Input components ──────────────────────────────────── */
function NumInput({ label, value, onChange, unit, step=0.1, min, compact }) {
  const [loc, setLoc]   = useState(String(value ?? 0));
  const [focused, setF] = useState(false);
  const handleChange = e => {
    setLoc(e.target.value);
    const p = parseFloat(e.target.value);
    if (!isNaN(p)) onChange(p);
  };
  const handleFocus = e => { setLoc(String(value ?? 0)); setF(true); e.target.select(); };
  const handleBlur  = () => {
    setF(false);
    const p = parseFloat(loc);
    if (isNaN(p)) { setLoc("0"); onChange(0); }
    else          { setLoc(String(p)); onChange(p); }
  };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
      {label && <label style={{ fontSize:11.5, fontWeight:600, color:"#475569", fontFamily:"Inter,sans-serif" }}>{label}</label>}
      <div style={{ position:"relative" }}>
        <input type="number" value={focused ? loc : (value ?? 0)} min={min} step={step}
          onChange={handleChange} onFocus={handleFocus} onBlur={handleBlur}
          style={{
            width:"100%", padding: unit ? (compact?"6px 30px 6px 8px":"9px 34px 9px 10px") : (compact?"6px 8px":"9px 10px"),
            border:`1.5px solid ${focused ? "#0E9F8E" : "#E2E8F0"}`, borderRadius:7, fontSize:compact?13:13.5,
            background:"#fff", color:"#0F172A", outline:"none", fontFamily:"Inter,sans-serif",
            boxShadow: focused ? "0 0 0 3px rgba(14,159,142,.1)" : "none",
            transition:"border-color .15s, box-shadow .15s", MozAppearance:"textfield",
          }} />
        {unit && <span style={{ position:"absolute", right:7, top:"50%", transform:"translateY(-50%)",
          fontSize:10.5, color:"#94A3B8", fontFamily:"Inter,sans-serif", pointerEvents:"none" }}>{unit}</span>}
      </div>
    </div>
  );
}

function TextInput({ label, value, onChange, placeholder }) {
  const [f, setF] = useState(false);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
      {label && <label style={{ fontSize:11.5, fontWeight:600, color:"#475569", fontFamily:"Inter,sans-serif" }}>{label}</label>}
      <input type="text" value={value} placeholder={placeholder||""}
        onChange={e => onChange(e.target.value)} onFocus={()=>setF(true)} onBlur={()=>setF(false)}
        style={{ padding:"9px 10px", border:`1.5px solid ${f?"#0E9F8E":"#E2E8F0"}`, borderRadius:7, fontSize:13.5,
          background:"#fff", color:"#0F172A", outline:"none", fontFamily:"Inter,sans-serif",
          transition:"border-color .15s", boxShadow: f?"0 0 0 3px rgba(14,159,142,.1)":"none" }} />
    </div>
  );
}

function SelectInput({ label, value, onChange, options }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
      {label && <label style={{ fontSize:11.5, fontWeight:600, color:"#475569", fontFamily:"Inter,sans-serif" }}>{label}</label>}
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ padding:"9px 10px", border:"1.5px solid #E2E8F0", borderRadius:7, fontSize:13.5,
          background:"#fff", color:"#0F172A", outline:"none", fontFamily:"Inter,sans-serif", cursor:"pointer" }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Section({ icon: Icon, title, color="#0E9F8E", children, defaultOpen=true, badge }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background:"#fff", borderRadius:14, border:"1px solid #E2E8F0", overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,.05)" }}>
      <button onClick={() => setOpen(!open)}
        style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"14px 18px", background:`${color}0D`, border:"none",
          borderBottom: open ? "1px solid #E2E8F0" : "none", cursor:"pointer" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:30, height:30, borderRadius:8, background:`${color}22`,
            display:"flex", alignItems:"center", justifyContent:"center" }}>
            <Icon size={15} color={color} />
          </div>
          <span style={{ fontFamily:"Plus Jakarta Sans,sans-serif", fontWeight:700, fontSize:14, color:"#0F172A" }}>{title}</span>
          {badge && <span style={{ fontSize:11, fontWeight:600, color:color, background:`${color}15`,
            padding:"2px 8px", borderRadius:20 }}>{badge}</span>}
        </div>
        {open ? <ChevronUp size={16} color="#94A3B8"/> : <ChevronDown size={16} color="#94A3B8"/>}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}}
            exit={{height:0,opacity:0}} transition={{duration:.2}} style={{overflow:"hidden"}}>
            <div style={{ padding:"18px 18px 20px" }}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BandCell({ value, onChange }) {
  const [loc, setLoc]   = useState(String(value ?? 0));
  const [focused, setF] = useState(false);
  const handleChange = e => { setLoc(e.target.value); const p=parseFloat(e.target.value); if(!isNaN(p)) onChange(p); };
  const handleFocus  = e => { setLoc(String(value??0)); setF(true); e.target.select(); };
  const handleBlur   = () => { setF(false); const p=parseFloat(loc); if(isNaN(p)){setLoc("0");onChange(0);}else{setLoc(String(p));onChange(p);} };
  return (
    <input type="number" value={focused ? loc : (value??0)} step={0.1}
      onChange={handleChange} onFocus={handleFocus} onBlur={handleBlur}
      style={{ width:"100%", minWidth:58, padding:"7px 4px",
        border:`1.5px solid ${focused?"#0E9F8E":"#E2E8F0"}`, borderRadius:7, fontSize:13,
        fontWeight:600, color:"#0F172A", background:"#fff", outline:"none",
        fontFamily:"Inter,sans-serif", textAlign:"center",
        boxShadow: focused?"0 0 0 3px rgba(14,159,142,.12)":"none",
        transition:"border-color .15s, box-shadow .15s" }} />
  );
}

function BandGrid({ label, values, onChange, readOnly, highlight }) {
  return (
    <div>
      {label && <p style={{ fontSize:12, fontWeight:700, color:"#334155",
        fontFamily:"Plus Jakarta Sans,sans-serif", margin:"0 0 12px" }}>{label}</p>}
      <div style={{ overflowX:"auto", paddingBottom:4 }}>
        <div style={{ display:"flex", gap:6, minWidth:520 }}>
          {BAND_KEYS.map((k, i) => (
            <div key={k} style={{ flex:"1 1 60px", minWidth:60 }}>
              <div style={{ textAlign:"center", fontSize:11, fontWeight:700,
                color: highlight ? "#7C3AED" : "#0E9F8E",
                fontFamily:"Inter,sans-serif", marginBottom:5,
                background: highlight ? "#EDE9FE" : "#E3F8F5",
                borderRadius:6, padding:"3px 2px", letterSpacing:"-.3px" }}>
                {BANDS[i]}Hz
              </div>
              {readOnly
                ? <div style={{ textAlign:"center", padding:"7px 4px", fontSize:13, fontWeight:600,
                    color:"#334155", background:"#F8FAFC", border:"1.5px solid #E2E8F0",
                    borderRadius:7, fontFamily:"Inter,sans-serif" }}>
                    {values[k] ?? 0}
                  </div>
                : <BandCell value={values[k]} onChange={v => onChange({ ...values, [k]: v })} />
              }
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Conversion preview table (same as before) ────────── */
const thS = { border:"1px solid #E2E8F0", padding:"6px 8px", background:"#F1F5F9",
  fontWeight:700, color:"#475569", textAlign:"center", whiteSpace:"nowrap" };
const tdS = { border:"1px solid #E2E8F0", padding:"6px 8px", textAlign:"center", color:"#334155" };

function ConversionPreviewTable({ noiseInputType, rawBand, distance_m, resultBand }) {
  if (noiseInputType === "swl_db") return null;
  const r = distance_m > 0 ? distance_m : 1;
  const distanceTerm = round1(10 * Math.log10(4 * Math.PI * r * r));
  const entryLabel = { swl_dba:"Entered SWL dB(A)", spl_db:"Entered SPL dB", spl_dba:"Entered SPL dB(A)" }[noiseInputType];
  const rows = [{ label: entryLabel, values: BAND_KEYS.map(k => rawBand?.[k] ?? 0) }];
  if (noiseInputType === "swl_dba") {
    rows.push({ label:"A-Weighting Correction", values: BAND_KEYS.map(k => A_WEIGHTING[k]) });
    rows.push({ label:"Resulting SWL (dB)", values: BAND_KEYS.map(k => resultBand?.[k] ?? 0), highlight:true });
  } else if (noiseInputType === "spl_db") {
    rows.push({ label:`+10·log₁₀(4πr²)  @ r=${r}m`, values: BAND_KEYS.map(() => distanceTerm) });
    rows.push({ label:"Resulting SWL (dB)", values: BAND_KEYS.map(k => resultBand?.[k] ?? 0), highlight:true });
  } else if (noiseInputType === "spl_dba") {
    rows.push({ label:"A-Weighting Correction", values: BAND_KEYS.map(k => A_WEIGHTING[k]) });
    rows.push({ label:"SPL (dB) after A-Weighting", values: BAND_KEYS.map(k => round1((rawBand?.[k]??0)-A_WEIGHTING[k])) });
    rows.push({ label:`+10·log₁₀(4πr²)  @ r=${r}m`, values: BAND_KEYS.map(() => distanceTerm) });
    rows.push({ label:"Resulting SWL (dB)", values: BAND_KEYS.map(k => resultBand?.[k] ?? 0), highlight:true });
  }
  return (
    <div style={{ overflowX:"auto", marginTop:14 }}>
      <table style={{ borderCollapse:"collapse", width:"100%", minWidth:640, fontFamily:"Inter,sans-serif", fontSize:12 }}>
        <thead>
          <tr><th style={{...thS, textAlign:"left"}}>Band</th>{BANDS.map(b=><th key={b} style={thS}>{b}Hz</th>)}</tr>
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

function segBtn(active, color="#0E9F8E") {
  return {
    padding:"7px 14px", borderRadius:8,
    border:`1.5px solid ${active ? color : "#E2E8F0"}`,
    background: active ? `${color}18` : "#fff",
    color: active ? color : "#64748B",
    fontSize:13, fontWeight:600, cursor:"pointer",
    fontFamily:"Inter,sans-serif", transition:"all .15s",
  };
}

/* ══════════════════════════════════════════════════════════ */
export default function AcousticInputForm({ projectId, existing, onSaved, onResults }) {
  const [form, setForm] = useState(() => {
    if (!existing) return DEFAULT;
    const g = existing.generator || {};
    const d = existing.duct || {};
    return {
      noisePath: existing.noisePath ?? "exhaust",
      generator: {
        equipmentId: g.equipmentId ?? "",
        modelNumber: g.modelNumber ?? "",
        ratedKva:    g.ratedKva ?? 0,
        buildingRef: g.buildingRef ?? "",
        swl_dba:     g.swl_dba ?? 0,
        noiseInputType: g.noiseInputType ?? "swl_db",
        measurementDistance_m: g.measurementDistance_m ?? 1,
        rawBand: g.rawBand ?? g.swl ?? {...EMPTY_BAND},
        swl:     g.swl ?? {...EMPTY_BAND},
      },
      room:       existing.room       ?? DEFAULT.room,
      duct: {
        width_mm:        d.width_mm        ?? 0,
        height_mm:       d.height_mm       ?? 0,
        length_m:        d.length_m        ?? 0,
        lining:          d.lining          ?? "unlined",
        elbows:          d.elbows          ?? 0,
        terminationType: d.terminationType ?? "wall",
        coeffA:          d.coeffA          ?? {...DEFAULT_COEFF_A_1INCH},
      },
      attenuator: existing.attenuator ?? DEFAULT.attenuator,
      receiver:   existing.receiver   ?? DEFAULT.receiver,
    };
  });

  const [saving,  setSaving]  = useState(false);
  const [running, setRunning] = useState(false);
  const [showCoeffA, setShowCoeffA] = useState(false);

  const setG    = (k,v) => setForm(f => ({...f, generator:  {...f.generator,  [k]:v}}));
  const setGRaw = (v)   => setForm(f => ({...f, generator:  {...f.generator,  rawBand:v}}));
  const setRm   = (k,v) => setForm(f => ({...f, room:       {...f.room,       [k]:v}}));
  const setD    = (k,v) => setForm(f => ({...f, duct:       {...f.duct,       [k]:v}}));
  const setDCA  = (v)   => setForm(f => ({...f, duct:       {...f.duct,       coeffA:v}}));
  const setA    = (k,v) => setForm(f => ({...f, attenuator: {...f.attenuator, [k]:v}}));
  const setAW   = (v)   => setForm(f => ({...f, attenuator: {...f.attenuator, il:v}}));
  const setRc   = (k,v) => setForm(f => ({...f, receiver:   {...f.receiver,   [k]:v}}));

  /* Auto-update coeffA defaults when lining type changes */
  useEffect(() => {
    setForm(f => ({
      ...f, duct: {
        ...f.duct,
        coeffA: f.duct.lining === "2inch" ? {...DEFAULT_COEFF_A_2INCH} : {...DEFAULT_COEFF_A_1INCH},
      }
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.duct.lining]);

  /* Recompute SWL from rawBand */
  useEffect(() => {
    setForm(f => {
      const computed = computeSWLFromRaw(f.generator.noiseInputType, f.generator.rawBand, f.generator.measurementDistance_m);
      const unchanged = BAND_KEYS.every(k => f.generator.swl[k] === computed[k]);
      if (unchanged) return f;
      return { ...f, generator: { ...f.generator, swl: computed } };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.generator.noiseInputType, form.generator.rawBand, form.generator.measurementDistance_m]);

  const handleRun = async () => {
    setRunning(true);
    try {
      const { data } = await runCalculationApi(projectId, form);
      onResults(data.results, form.receiver);
      toast.success("Calculation complete");
    } catch (err) { toast.error(err.response?.data?.message || "Calculation failed"); }
    finally { setRunning(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let calcData;
      if (existing?._id) {
        const { data } = await updateCalculationApi(projectId, existing._id, form);
        calcData = data.calculation;
      } else {
        const { data } = await createCalculationApi(projectId, form);
        calcData = data.calculation;
      }
      onResults(calcData.results, form.receiver);
      onSaved(calcData);
      toast.success(existing?._id ? "Updated & calculated" : "Saved & calculated");
    } catch (err) { toast.error(err.response?.data?.message || "Save failed"); }
    finally { setSaving(false); }
  };

  const g2 = { display:"grid", gridTemplateColumns:"1fr 1fr",         gap:14 };
  const g3 = { display:"grid", gridTemplateColumns:"1fr 1fr 1fr",     gap:14 };
  const g4 = { display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:14 };

  const isLined = form.duct.lining !== "unlined";
  const V = form.room.length_m * form.room.width_m * form.room.height_m;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

      {/* Noise path */}
      <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E2E8F0", padding:"14px 18px" }}>
        <p style={{ fontSize:11, fontWeight:700, color:"#475569", textTransform:"uppercase",
          letterSpacing:".05em", fontFamily:"Inter,sans-serif", margin:"0 0 10px" }}>Noise Path</p>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {[{value:"exhaust",label:"Exhaust Air"},{value:"intake",label:"Intake Air"},{value:"radiated",label:"Radiated"}].map(p=>(
            <button key={p.value} onClick={()=>setForm(f=>({...f,noisePath:p.value}))} style={segBtn(form.noisePath===p.value)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* 1. Generator */}
      <Section icon={Zap} title="Generator Data" color="#0E9F8E">
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div style={g2}>
            <TextInput label="Equipment ID"  value={form.generator.equipmentId}  onChange={v=>setG("equipmentId",v)} placeholder="e.g. 1100KVA STANDBY GEN"/>
            <TextInput label="Model Number"  value={form.generator.modelNumber}  onChange={v=>setG("modelNumber",v)} placeholder="e.g. 12M26D968E200"/>
          </div>
          <div style={g3}>
            <NumInput label="Rated kVA"     value={form.generator.ratedKva}    onChange={v=>setG("ratedKva",v)} unit="kVA" step={1}/>
            <NumInput label="Overall SWL"   value={form.generator.swl_dba}     onChange={v=>setG("swl_dba",v)} unit="dB(A)" step={0.1}/>
            <TextInput label="Building Ref" value={form.generator.buildingRef} onChange={v=>setG("buildingRef",v)} placeholder="e.g. Ground Floor"/>
          </div>

          <div>
            <p style={{ fontSize:12, fontWeight:700, color:"#334155", fontFamily:"Plus Jakarta Sans,sans-serif", margin:"0 0 8px" }}>Noise Data Type</p>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {NOISE_INPUT_TYPES.map(t=>(
                <button key={t.value} onClick={()=>setG("noiseInputType",t.value)} style={segBtn(form.generator.noiseInputType===t.value)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {DISTANCE_MODES.includes(form.generator.noiseInputType) && (
            <div style={{ maxWidth:220 }}>
              <NumInput label="Measurement Distance (r)" value={form.generator.measurementDistance_m}
                onChange={v=>setG("measurementDistance_m",v)} unit="m" step={0.1} min={0.1}/>
            </div>
          )}

          <div style={{ background:"#F8FAFC", borderRadius:10, padding:"14px 16px", border:"1px solid #E2E8F0" }}>
            <BandGrid
              label={{ swl_dba:"SWL per Band — dB(A)", spl_db:"SPL per Band — dB @ measurement distance r",
                       spl_dba:"SPL per Band — dB(A) @ measurement distance r",
                       swl_db:"SWL per Band — dB re 1pW" }[form.generator.noiseInputType]}
              values={form.generator.rawBand} onChange={setGRaw}/>
            <ConversionPreviewTable noiseInputType={form.generator.noiseInputType}
              rawBand={form.generator.rawBand} distance_m={form.generator.measurementDistance_m}
              resultBand={form.generator.swl}/>
          </div>
        </div>
      </Section>

      {/* 2. Plant Room */}
      <Section icon={Box} title="Plant Room / Enclosure" color="#3B82F6"
        badge={V > 0 ? `V = ${V.toFixed(1)} m³` : undefined}>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div style={g4}>
            <NumInput label="Length" value={form.room.length_m} onChange={v=>setRm("length_m",v)} unit="m"/>
            <NumInput label="Width"  value={form.room.width_m}  onChange={v=>setRm("width_m",v)}  unit="m"/>
            <NumInput label="Height" value={form.room.height_m} onChange={v=>setRm("height_m",v)} unit="m"/>
            <NumInput label="Avg. Absorption (α)" value={form.room.avgAbsCoeff} onChange={v=>setRm("avgAbsCoeff",v)} step={0.01} min={0.01}/>
          </div>
          <div style={{ padding:"10px 12px", background:"#EFF6FF", borderRadius:8, border:"1px solid #BFDBFE" }}>
            <p style={{ fontSize:12, color:"#1E40AF", fontFamily:"Inter,sans-serif", margin:0 }}>
              💡 When room dimensions are entered, the <strong>Schultz room equation</strong> is used
              (Lp = Lw − 10logR − 5logV − 3logf + 12). Otherwise, free-field distance method is used.
            </p>
          </div>
        </div>
      </Section>

      {/* 3. Duct */}
      <Section icon={Wind} title="Duct / Opening" color="#8B5CF6">
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div style={g3}>
            <NumInput label="Width"  value={form.duct.width_mm}  onChange={v=>setD("width_mm",v)}  unit="mm" step={50}/>
            <NumInput label="Height" value={form.duct.height_mm} onChange={v=>setD("height_mm",v)} unit="mm" step={50}/>
            <NumInput label="Length" value={form.duct.length_m}  onChange={v=>setD("length_m",v)}  unit="m"  step={0.5}/>
          </div>
          <div style={g3}>
            <SelectInput label="Duct Lining" value={form.duct.lining} onChange={v=>setD("lining",v)}
              options={[
                {value:"unlined", label:"Unlined"},
                {value:"1inch",   label:"1-inch lined"},
                {value:"2inch",   label:"2-inch lined"},
              ]}/>
            <NumInput label="No. of Elbows (90°)" value={form.duct.elbows} onChange={v=>setD("elbows",v)} step={1} min={0}/>
            <SelectInput label="Termination" value={form.duct.terminationType} onChange={v=>setD("terminationType",v)}
              options={[
                {value:"wall",       label:"In wall / louver"},
                {value:"free_space", label:"Free space"},
              ]}/>
          </div>

          {/* Elbow IL info card */}
          {(form.duct.elbows > 0) && (
            <div style={{ padding:"10px 12px", background:"#F5F3FF", borderRadius:8, border:"1px solid #DDD6FE" }}>
              <p style={{ fontSize:11.5, color:"#6D28D9", fontFamily:"Inter,sans-serif", margin:"0 0 4px", fontWeight:700 }}>
                Elbow Insertion Loss ({isLined ? "Lined" : "Unlined"} — {form.duct.elbows} × 90° elbow)
              </p>
              <p style={{ fontSize:11, color:"#7C3AED", fontFamily:"Inter,sans-serif", margin:0 }}>
                Calculated automatically from duct width ({form.duct.width_mm}mm) using ASHRAE lookup table.
              </p>
            </div>
          )}

          {/* Lined duct: Coeff A (optional override) */}
          {isLined && (
            <div style={{ background:"#FFF7ED", borderRadius:10, padding:"14px 16px", border:"1px solid #FED7AA" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                <p style={{ fontSize:12, fontWeight:700, color:"#92400E", fontFamily:"Plus Jakarta Sans,sans-serif", margin:0 }}>
                  Lined Duct — Coefficient A (Manufacturer)
                </p>
                <button onClick={()=>setShowCoeffA(!showCoeffA)}
                  style={{ fontSize:11.5, color:"#D97706", background:"none", border:"none",
                    cursor:"pointer", fontFamily:"Inter,sans-serif", fontWeight:600 }}>
                  {showCoeffA ? "▾ Hide" : "▸ Edit"}
                </button>
              </div>
              <p style={{ fontSize:11.5, color:"#92400E", fontFamily:"Inter,sans-serif", margin:"0 0 6px" }}>
                Default values from ASHRAE ({form.duct.lining} lining). Override below with manufacturer datasheet values.
              </p>
              {showCoeffA && (
                <BandGrid
                  label="Coefficient A per Octave Band (from manufacturer datasheet)"
                  values={form.duct.coeffA} onChange={setDCA} highlight/>
              )}
              {!showCoeffA && (
                <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                  {BAND_KEYS.map((k,i) => (
                    <span key={k} style={{ fontSize:11, color:"#92400E", fontFamily:"Inter,sans-serif",
                      background:"#FEF3C7", borderRadius:5, padding:"2px 7px" }}>
                      {BANDS[i]}Hz: {form.duct.coeffA[k]}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Unlined: show formula info */}
          {!isLined && (
            <div style={{ padding:"10px 12px", background:"#F8FAFC", borderRadius:8, border:"1px solid #E2E8F0" }}>
              <p style={{ fontSize:11.5, color:"#475569", fontFamily:"Inter,sans-serif", margin:0 }}>
                <strong>Unlined duct IL</strong> calculated per ASHRAE:
                ΔL = −1×17.0×(P/S)^−0.25×f^−0.85×L (P/S ≥ 3)  or
                ΔL = −1×1.64×(P/S)^0.73×f^−0.58×L (P/S &lt; 3)
              </p>
            </div>
          )}
        </div>
      </Section>

      {/* 4. Attenuator */}
      <Section icon={Gauge} title="Attenuator / Acoustic Louver" color="#F59E0B" defaultOpen={false}>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div style={g3}>
            <TextInput label="Model"  value={form.attenuator.model}      onChange={v=>setA("model",v)} placeholder="e.g. A37"/>
            <NumInput  label="Width"  value={form.attenuator.width_mm}   onChange={v=>setA("width_mm",v)}  unit="mm" step={100}/>
            <NumInput  label="Height" value={form.attenuator.height_mm}  onChange={v=>setA("height_mm",v)} unit="mm" step={100}/>
          </div>
          <div style={g2}>
            <NumInput label="Length"        value={form.attenuator.length_mm}      onChange={v=>setA("length_mm",v)}        unit="mm" step={100}/>
            <NumInput label="Pressure Drop" value={form.attenuator.pressureDrop_pa} onChange={v=>setA("pressureDrop_pa",v)} unit="Pa" step={5}/>
          </div>
          <div style={{ background:"#FFFBEB", borderRadius:10, padding:"14px 16px", border:"1px solid #FDE68A" }}>
            <BandGrid label="Attenuator Insertion Loss per Octave Band — enter positive dB values"
              values={form.attenuator.il} onChange={setAW}/>
          </div>
        </div>
      </Section>

      {/* 5. Receiver */}
      <Section icon={MapPin} title="Receiver Location" color="#EF4444">
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <TextInput label="Receiver Description" value={form.receiver.description}
            onChange={v=>setRc("description",v)}
            placeholder="e.g. 3m from exhaust louver at nearest facade"/>
          <div style={g3}>
            <NumInput label="Distance to Receiver" value={form.receiver.distance_m}
              onChange={v=>setRc("distance_m",v)} unit="m" step={0.5} min={0.5}/>
            <SelectInput label="Directivity Q" value={form.receiver.directivity}
              onChange={v=>setRc("directivity",parseFloat(v))}
              options={[
                {value:1, label:"Q=1 (free field)"},
                {value:2, label:"Q=2 (near wall/ground)"},
                {value:4, label:"Q=4 (corner)"},
              ]}/>
            <NumInput label="dB(A) Limit" value={form.receiver.required_dba}
              onChange={v=>setRc("required_dba",v)} unit="dB(A)" step={1}/>
          </div>
          <div style={g2}>
            <NumInput label="Required NC" value={form.receiver.requiredNC} onChange={v=>setRc("requiredNC",v)} step={5} unit="NC"/>
            <NumInput label="Required NR" value={form.receiver.requiredNR} onChange={v=>setRc("requiredNR",v)} step={5} unit="NR"/>
          </div>

          {/* Method used info */}
          <div style={{ padding:"10px 12px",
            background: V > 0 ? "#EFF6FF" : "#F0FDF4",
            borderRadius:8,
            border:`1px solid ${V > 0 ? "#BFDBFE" : "#BBF7D0"}` }}>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <Info size={13} color={V > 0 ? "#2563EB" : "#16A34A"}/>
              <p style={{ fontSize:11.5, fontWeight:600,
                color: V > 0 ? "#1E40AF" : "#15803D",
                fontFamily:"Inter,sans-serif", margin:0 }}>
                {V > 0
                  ? `Schultz room equation will be used (V = ${V.toFixed(1)} m³, r = ${form.receiver.distance_m}m)`
                  : "Free-field distance method will be used (enter room dimensions for Schultz equation)"}
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* Action buttons */}
      <div style={{ display:"flex", gap:12, justifyContent:"flex-end", paddingTop:4 }}>
        <motion.button onClick={handleRun} disabled={running||saving}
          whileHover={!running?{scale:1.02}:{}} whileTap={!running?{scale:0.98}:{}}
          style={{ display:"flex", alignItems:"center", gap:8,
            padding:"11px 22px", borderRadius:10,
            border:"1.5px solid #0E9F8E", background:"#E3F8F5",
            color:"#0E9F8E", fontSize:14, fontWeight:700,
            fontFamily:"Plus Jakarta Sans,sans-serif",
            cursor:running?"not-allowed":"pointer", transition:"all .15s" }}>
          {running ? <Loader2 size={16} style={{animation:"spin .7s linear infinite"}}/> : <Calculator size={16}/>}
          {running ? "Calculating…" : "Run Calculation"}
        </motion.button>

        <motion.button onClick={handleSave} disabled={saving||running}
          whileHover={!saving?{scale:1.02,y:-1}:{}} whileTap={!saving?{scale:0.98}:{}}
          style={{ display:"flex", alignItems:"center", gap:8,
            padding:"11px 28px", borderRadius:10, border:"none",
            background:saving?"#CBD5E1":"linear-gradient(135deg,#0E9F8E,#0B8276)",
            color:"#fff", fontSize:14, fontWeight:700,
            fontFamily:"Plus Jakarta Sans,sans-serif",
            boxShadow:saving?"none":"0 4px 14px rgba(14,159,142,.3)",
            cursor:saving?"not-allowed":"pointer", transition:"all .15s" }}>
          {saving && <Loader2 size={16} style={{animation:"spin .7s linear infinite"}}/>}
          {saving ? "Saving…" : existing?._id ? "Update & Calculate" : "Save & Calculate"}
        </motion.button>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { opacity:1; }
      `}</style>
    </div>
  );
}
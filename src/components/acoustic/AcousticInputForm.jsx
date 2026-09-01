import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap, Box, Wind, Gauge, MapPin,
  ChevronDown, ChevronUp, Loader2, Calculator,
} from "lucide-react";
import toast from "react-hot-toast";
import { createCalculationApi, updateCalculationApi, runCalculationApi } from "@/api/calculationApi";

const BANDS     = [63, 125, 250, 500, 1000, 2000, 4000, 8000];
const BAND_KEYS = ["hz63","hz125","hz250","hz500","hz1000","hz2000","hz4000","hz8000"];

/* ─── Default form ─────────────────────────────────────────── */
const EMPTY_BAND = { hz63:0,hz125:0,hz250:0,hz500:0,hz1000:0,hz2000:0,hz4000:0,hz8000:0 };

const DEFAULT = {
  noisePath: "exhaust",
  generator: { equipmentId:"",modelNumber:"",ratedKva:0,buildingRef:"",swl_dba:0, swl:{...EMPTY_BAND} },
  room:       { length_m:0,width_m:0,height_m:0,avgAbsCoeff:0.9 },
  duct:       { width_mm:0,height_mm:0,length_m:0,lining:"unlined",elbows:0,terminationType:"wall" },
  attenuator: { model:"",width_mm:0,height_mm:0,length_mm:0,pressureDrop_pa:0, il:{...EMPTY_BAND} },
  receiver:   { description:"",distance_m:3,directivity:2,requiredNC:65,requiredNR:65,required_dba:65 },
};

/* ─── Number input: string-based so user can type freely ───── */
function NumInput({ label, value, onChange, unit, step = 0.1, min, compact }) {
  // Keep a local string so the user can clear and retype freely
  const [localVal, setLocalVal] = useState(String(value ?? 0));
  const [focused,  setFocused]  = useState(false);

  // Sync when parent changes externally (e.g. form load)
  // Only override if not focused (don't clobber while typing)
  const displayVal = focused ? localVal : String(value ?? 0);

  const handleChange = (e) => {
    const raw = e.target.value;
    setLocalVal(raw);
    // Feed parent only when the string is a valid number
    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) onChange(parsed);
  };

  const handleFocus = (e) => {
    setLocalVal(String(value ?? 0));
    setFocused(true);
    // Select all text so user can immediately type over it
    e.target.select();
  };

  const handleBlur = () => {
    setFocused(false);
    const parsed = parseFloat(localVal);
    if (isNaN(parsed)) {
      setLocalVal("0");
      onChange(0);
    } else {
      setLocalVal(String(parsed));
      onChange(parsed);
    }
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
      {label && (
        <label style={{ fontSize:11.5, fontWeight:600, color:"#475569",
          fontFamily:"Inter,sans-serif" }}>{label}</label>
      )}
      <div style={{ position:"relative" }}>
        <input
          type="number"
          value={focused ? localVal : (value ?? 0)}
          min={min}
          step={step}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={{
            width:"100%",
            padding: unit
              ? (compact ? "6px 30px 6px 8px" : "9px 34px 9px 10px")
              : (compact ? "6px 8px"           : "9px 10px"),
            border:`1.5px solid ${focused ? "#0E9F8E" : "#E2E8F0"}`,
            borderRadius:7,
            fontSize: compact ? 13 : 13.5,
            background:"#fff", color:"#0F172A", outline:"none",
            fontFamily:"Inter,sans-serif",
            boxShadow: focused ? "0 0 0 3px rgba(14,159,142,.1)" : "none",
            transition:"border-color .15s, box-shadow .15s",
            MozAppearance:"textfield",
          }}
        />
        {unit && (
          <span style={{
            position:"absolute", right:7, top:"50%",
            transform:"translateY(-50%)",
            fontSize:10.5, color:"#94A3B8",
            fontFamily:"Inter,sans-serif", pointerEvents:"none",
            userSelect:"none",
          }}>
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

/* ─── Text input ────────────────────────────────────────────── */
function TextInput({ label, value, onChange, placeholder }) {
  const [f, setF] = useState(false);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
      {label && (
        <label style={{ fontSize:11.5, fontWeight:600, color:"#475569",
          fontFamily:"Inter,sans-serif" }}>{label}</label>
      )}
      <input
        type="text" value={value} placeholder={placeholder || ""}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setF(true)} onBlur={() => setF(false)}
        style={{
          padding:"9px 10px",
          border:`1.5px solid ${f ? "#0E9F8E" : "#E2E8F0"}`,
          borderRadius:7, fontSize:13.5,
          background:"#fff", color:"#0F172A", outline:"none",
          fontFamily:"Inter,sans-serif",
          transition:"border-color .15s",
          boxShadow: f ? "0 0 0 3px rgba(14,159,142,.1)" : "none",
        }}
      />
    </div>
  );
}

/* ─── Select input ──────────────────────────────────────────── */
function SelectInput({ label, value, onChange, options }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
      {label && (
        <label style={{ fontSize:11.5, fontWeight:600, color:"#475569",
          fontFamily:"Inter,sans-serif" }}>{label}</label>
      )}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          padding:"9px 10px",
          border:"1.5px solid #E2E8F0",
          borderRadius:7, fontSize:13.5,
          background:"#fff", color:"#0F172A",
          outline:"none", fontFamily:"Inter,sans-serif",
          cursor:"pointer",
        }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

/* ─── Collapsible section card ──────────────────────────────── */
function Section({ icon: Icon, title, color="#0E9F8E", children, defaultOpen=true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background:"#fff", borderRadius:14,
      border:"1px solid #E2E8F0", overflow:"hidden",
      boxShadow:"0 1px 4px rgba(0,0,0,.05)" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width:"100%", display:"flex", alignItems:"center",
          justifyContent:"space-between",
          padding:"14px 18px",
          background:`${color}0D`,
          border:"none",
          borderBottom: open ? "1px solid #E2E8F0" : "none",
          cursor:"pointer",
        }}
      >
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:30, height:30, borderRadius:8,
            background:`${color}22`,
            display:"flex", alignItems:"center", justifyContent:"center" }}>
            <Icon size={15} color={color} />
          </div>
          <span style={{ fontFamily:"Plus Jakarta Sans,sans-serif",
            fontWeight:700, fontSize:14, color:"#0F172A" }}>{title}</span>
        </div>
        {open
          ? <ChevronUp   size={16} color="#94A3B8" />
          : <ChevronDown size={16} color="#94A3B8" />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height:0, opacity:0 }}
            animate={{ height:"auto", opacity:1 }}
            exit={{ height:0, opacity:0 }}
            transition={{ duration:.2 }}
            style={{ overflow:"hidden" }}
          >
            <div style={{ padding:"18px 18px 20px" }}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Octave band grid — one input per band ─────────────────── */
function BandGrid({ label, values, onChange }) {
  return (
    <div>
      {label && (
        <p style={{ fontSize:12, fontWeight:700, color:"#334155",
          fontFamily:"Plus Jakarta Sans,sans-serif", margin:"0 0 12px" }}>
          {label}
        </p>
      )}
      {/* Scrollable so it never overflows on mobile */}
      <div style={{ overflowX:"auto", paddingBottom:4 }}>
        <div style={{ display:"flex", gap:6, minWidth:520 }}>
          {BAND_KEYS.map((k, i) => (
            <div key={k} style={{ flex:"1 1 60px", minWidth:60 }}>
              {/* Frequency chip */}
              <div style={{ textAlign:"center", fontSize:11,
                fontWeight:700, color:"#0E9F8E",
                fontFamily:"Inter,sans-serif", marginBottom:5,
                background:"#E3F8F5", borderRadius:6,
                padding:"3px 2px", letterSpacing:"-.3px" }}>
                {BANDS[i]}Hz
              </div>
              {/* Input with min-width so value is fully visible */}
              <div style={{ position:"relative" }}>
                <input
                  type="number"
                  defaultValue={values[k] ?? 0}
                  key={`${k}-${values[k]}`}
                  step={0.1}
                  onFocus={e => {
                    e.target.select();
                    e.target.style.borderColor="#0E9F8E";
                    e.target.style.boxShadow="0 0 0 3px rgba(14,159,142,.12)";
                  }}
                  onBlur={e => {
                    e.target.style.borderColor="#E2E8F0";
                    e.target.style.boxShadow="none";
                    const v = parseFloat(e.target.value);
                    onChange({ ...values, [k]: isNaN(v) ? 0 : v });
                  }}
                  onChange={e => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) onChange({ ...values, [k]: v });
                  }}
                  style={{
                    width:"100%", minWidth:58,
                    padding:"7px 4px",
                    border:"1.5px solid #E2E8F0",
                    borderRadius:7, fontSize:13,
                    fontWeight:600, color:"#0F172A",
                    background:"#fff", outline:"none",
                    fontFamily:"Inter,sans-serif",
                    textAlign:"center",
                    transition:"border-color .15s, box-shadow .15s",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
export default function AcousticInputForm({ projectId, existing, onSaved, onResults }) {
  const [form, setForm] = useState(() =>
    existing ? {
      noisePath:  existing.noisePath  ?? "exhaust",
      generator:  existing.generator  ?? DEFAULT.generator,
      room:       existing.room       ?? DEFAULT.room,
      duct:       existing.duct       ?? DEFAULT.duct,
      attenuator: existing.attenuator ?? DEFAULT.attenuator,
      receiver:   existing.receiver   ?? DEFAULT.receiver,
    } : DEFAULT
  );

  const [saving,  setSaving]  = useState(false);
  const [running, setRunning] = useState(false);

  /* Nested updaters */
  const setG  = (k,v) => setForm(f => ({...f, generator:  {...f.generator,  [k]:v}}));
  const setGW = (v)   => setForm(f => ({...f, generator:  {...f.generator,  swl:v}}));
  const setRm = (k,v) => setForm(f => ({...f, room:       {...f.room,       [k]:v}}));
  const setD  = (k,v) => setForm(f => ({...f, duct:       {...f.duct,       [k]:v}}));
  const setA  = (k,v) => setForm(f => ({...f, attenuator: {...f.attenuator, [k]:v}}));
  const setAW = (v)   => setForm(f => ({...f, attenuator: {...f.attenuator, il:v}}));
  const setRc = (k,v) => setForm(f => ({...f, receiver:   {...f.receiver,   [k]:v}}));

  /* Run without saving */
  const handleRun = async () => {
    setRunning(true);
    try {
      const { data } = await runCalculationApi(projectId, form);
      onResults(data.results, form.receiver);
      toast.success("Calculation complete");
    } catch (err) {
      toast.error(err.response?.data?.message || "Calculation failed");
    } finally { setRunning(false); }
  };

  /* Save + run */
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
    } catch (err) {
      toast.error(err.response?.data?.message || "Save failed");
    } finally { setSaving(false); }
  };

  const g2 = { display:"grid", gridTemplateColumns:"1fr 1fr",         gap:14 };
  const g3 = { display:"grid", gridTemplateColumns:"1fr 1fr 1fr",     gap:14 };
  const g4 = { display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:14 };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

      {/* Noise path selector */}
      <div style={{ background:"#fff", borderRadius:12,
        border:"1px solid #E2E8F0", padding:"14px 18px" }}>
        <p style={{ fontSize:11, fontWeight:700, color:"#475569",
          textTransform:"uppercase", letterSpacing:".05em",
          fontFamily:"Inter,sans-serif", margin:"0 0 10px" }}>
          Noise Path
        </p>
        <div style={{ display:"flex", gap:8 }}>
          {[
            { value:"exhaust",  label:"Exhaust Air" },
            { value:"intake",   label:"Intake Air"  },
            { value:"radiated", label:"Radiated"    },
          ].map(p => (
            <button key={p.value}
              onClick={() => setForm(f => ({...f, noisePath: p.value}))}
              style={{
                padding:"8px 18px", borderRadius:8,
                border:`1.5px solid ${form.noisePath===p.value ? "#0E9F8E":"#E2E8F0"}`,
                background: form.noisePath===p.value ? "#E3F8F5":"#fff",
                color:      form.noisePath===p.value ? "#0E9F8E":"#64748B",
                fontSize:13.5, fontWeight:600, cursor:"pointer",
                fontFamily:"Inter,sans-serif", transition:"all .15s",
              }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 1. Generator ── */}
      <Section icon={Zap} title="Generator Data" color="#0E9F8E">
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div style={g2}>
            <TextInput label="Equipment ID"  value={form.generator.equipmentId}
              onChange={v=>setG("equipmentId",v)} placeholder="e.g. 1100KVA STANDBY GEN" />
            <TextInput label="Model Number"  value={form.generator.modelNumber}
              onChange={v=>setG("modelNumber",v)} placeholder="e.g. 12M26D968E200" />
          </div>
          <div style={g3}>
            <NumInput label="Rated kVA"     value={form.generator.ratedKva}
              onChange={v=>setG("ratedKva",v)} unit="kVA" step={1} />
            <NumInput label="Overall SWL"   value={form.generator.swl_dba}
              onChange={v=>setG("swl_dba",v)} unit="dB(A)" step={0.1} />
            <TextInput label="Building Ref" value={form.generator.buildingRef}
              onChange={v=>setG("buildingRef",v)} placeholder="e.g. Ground Floor" />
          </div>

          {/* Octave band SWL */}
          <div style={{ background:"#F8FAFC", borderRadius:10, padding:"14px 16px",
            border:"1px solid #E2E8F0" }}>
            <BandGrid
              label="Sound Power Level per Octave Band — dB re 1pW (from manufacturer datasheet)"
              values={form.generator.swl}
              onChange={setGW}
            />
          </div>
        </div>
      </Section>

      {/* ── 2. Plant Room ── */}
      <Section icon={Box} title="Plant Room / Enclosure" color="#3B82F6">
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div style={g4}>
            <NumInput label="Length" value={form.room.length_m}
              onChange={v=>setRm("length_m",v)} unit="m" />
            <NumInput label="Width"  value={form.room.width_m}
              onChange={v=>setRm("width_m",v)}  unit="m" />
            <NumInput label="Height" value={form.room.height_m}
              onChange={v=>setRm("height_m",v)} unit="m" />
            <NumInput label="Avg. Absorption (α)" value={form.room.avgAbsCoeff}
              onChange={v=>setRm("avgAbsCoeff",v)} step={0.01} min={0.01} />
          </div>
          <div style={{ padding:"10px 12px", background:"#EFF6FF",
            borderRadius:8, border:"1px solid #BFDBFE" }}>
            <p style={{ fontSize:12, color:"#1E40AF",
              fontFamily:"Inter,sans-serif", margin:0 }}>
              💡 Typical α: Bare concrete ≈ 0.05 · Partly treated ≈ 0.3 · Acoustic panels ≈ 0.7–0.9
            </p>
          </div>
        </div>
      </Section>

      {/* ── 3. Duct / Opening ── */}
      <Section icon={Wind} title="Duct / Opening" color="#8B5CF6">
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div style={g3}>
            <NumInput label="Width"  value={form.duct.width_mm}
              onChange={v=>setD("width_mm",v)}  unit="mm" step={10} />
            <NumInput label="Height" value={form.duct.height_mm}
              onChange={v=>setD("height_mm",v)} unit="mm" step={10} />
            <NumInput label="Length" value={form.duct.length_m}
              onChange={v=>setD("length_m",v)}  unit="m"  step={0.5} />
          </div>
          <div style={g3}>
            <SelectInput label="Duct Lining" value={form.duct.lining}
              onChange={v=>setD("lining",v)}
              options={[
                {value:"unlined", label:"Unlined"},
                {value:"1inch",   label:"1-inch lined"},
                {value:"2inch",   label:"2-inch lined"},
              ]} />
            <NumInput label="No. of Elbows" value={form.duct.elbows}
              onChange={v=>setD("elbows",v)} step={1} />
            <SelectInput label="Termination" value={form.duct.terminationType}
              onChange={v=>setD("terminationType",v)}
              options={[
                {value:"wall",       label:"In wall / louver"},
                {value:"free_space", label:"Free space"},
              ]} />
          </div>
        </div>
      </Section>

      {/* ── 4. Attenuator ── */}
      <Section icon={Gauge} title="Attenuator / Acoustic Louver" color="#F59E0B" defaultOpen={false}>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div style={g3}>
            <TextInput label="Model"   value={form.attenuator.model}
              onChange={v=>setA("model",v)} placeholder="e.g. A37" />
            <NumInput label="Width"    value={form.attenuator.width_mm}
              onChange={v=>setA("width_mm",v)}  unit="mm" step={100} />
            <NumInput label="Height"   value={form.attenuator.height_mm}
              onChange={v=>setA("height_mm",v)} unit="mm" step={100} />
          </div>
          <div style={g2}>
            <NumInput label="Length"        value={form.attenuator.length_mm}
              onChange={v=>setA("length_mm",v)}        unit="mm" step={100} />
            <NumInput label="Pressure Drop" value={form.attenuator.pressureDrop_pa}
              onChange={v=>setA("pressureDrop_pa",v)}  unit="Pa" step={5} />
          </div>
          <div style={{ background:"#FFFBEB", borderRadius:10,
            padding:"14px 16px", border:"1px solid #FDE68A" }}>
            <BandGrid
              label="Attenuator Insertion Loss per Octave Band — enter positive dB values"
              values={form.attenuator.il}
              onChange={setAW}
            />
          </div>
        </div>
      </Section>

      {/* ── 5. Receiver ── */}
      <Section icon={MapPin} title="Receiver Location" color="#EF4444">
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <TextInput label="Receiver Description" value={form.receiver.description}
            onChange={v=>setRc("description",v)}
            placeholder="e.g. 3m from exhaust louver at nearest facade" />
          <div style={g3}>
            <NumInput label="Distance to Receiver" value={form.receiver.distance_m}
              onChange={v=>setRc("distance_m",v)} unit="m" step={0.5} min={0.5} />
            <SelectInput label="Directivity Q" value={form.receiver.directivity}
              onChange={v=>setRc("directivity",parseFloat(v))}
              options={[
                {value:1, label:"Q=1 (free field)"},
                {value:2, label:"Q=2 (near wall/ground)"},
                {value:4, label:"Q=4 (corner)"},
              ]} />
            <NumInput label="dB(A) limit" value={form.receiver.required_dba}
              onChange={v=>setRc("required_dba",v)} unit="dB(A)" step={1} />
          </div>
          <div style={g2}>
            <NumInput label="Required NC"
              value={form.receiver.requiredNC}
              onChange={v=>setRc("requiredNC",v)} step={5} unit="NC" />
            <NumInput label="Required NR"
              value={form.receiver.requiredNR}
              onChange={v=>setRc("requiredNR",v)} step={5} unit="NR" />
          </div>
        </div>
      </Section>

      {/* ── Action buttons ── */}
      <div style={{ display:"flex", gap:12, justifyContent:"flex-end",
        paddingTop:4 }}>
        <motion.button
          onClick={handleRun} disabled={running||saving}
          whileHover={!running?{scale:1.02}:{}}
          whileTap={!running?{scale:0.98}:{}}
          style={{
            display:"flex", alignItems:"center", gap:8,
            padding:"11px 22px", borderRadius:10,
            border:"1.5px solid #0E9F8E", background:"#E3F8F5",
            color:"#0E9F8E", fontSize:14, fontWeight:700,
            fontFamily:"Plus Jakarta Sans,sans-serif",
            cursor:running?"not-allowed":"pointer",
            transition:"all .15s",
          }}>
          {running
            ? <Loader2 size={16} style={{animation:"spin .7s linear infinite"}}/>
            : <Calculator size={16}/>}
          {running ? "Calculating…" : "Run Calculation"}
        </motion.button>

        <motion.button
          onClick={handleSave} disabled={saving||running}
          whileHover={!saving?{scale:1.02,y:-1}:{}}
          whileTap={!saving?{scale:0.98}:{}}
          style={{
            display:"flex", alignItems:"center", gap:8,
            padding:"11px 28px", borderRadius:10, border:"none",
            background:saving?"#CBD5E1":"linear-gradient(135deg,#0E9F8E,#0B8276)",
            color:"#fff", fontSize:14, fontWeight:700,
            fontFamily:"Plus Jakarta Sans,sans-serif",
            boxShadow:saving?"none":"0 4px 14px rgba(14,159,142,.3)",
            cursor:saving?"not-allowed":"pointer",
            transition:"all .15s",
          }}>
          {saving && <Loader2 size={16} style={{animation:"spin .7s linear infinite"}}/>}
          {saving?"Saving…":existing?._id?"Update & Calculate":"Save & Calculate"}
        </motion.button>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { opacity: 1; }
      `}</style>
    </div>
  );
}
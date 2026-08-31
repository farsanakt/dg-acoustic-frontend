import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap, Box, Wind, Gauge, MapPin,
  ChevronDown, ChevronUp, Loader2, Calculator,
} from "lucide-react";
import toast from "react-hot-toast";
import { createCalculationApi, updateCalculationApi, runCalculationApi } from "@/api/calculationApi";

const BANDS = [63, 125, 250, 500, 1000, 2000, 4000, 8000];
const BAND_KEYS = ["hz63","hz125","hz250","hz500","hz1000","hz2000","hz4000","hz8000"];

/* ─── Default form ─────────────────────────────────────────── */
const DEFAULT = {
  noisePath: "exhaust",
  generator: {
    equipmentId:"", modelNumber:"", ratedKva:0, buildingRef:"", swl_dba:0,
    swl:{ hz63:0, hz125:0, hz250:0, hz500:0, hz1000:0, hz2000:0, hz4000:0, hz8000:0 },
  },
  room:{ length_m:0, width_m:0, height_m:0, avgAbsCoeff:0.9 },
  duct:{
    width_mm:0, height_mm:0, length_m:0,
    lining:"unlined", elbows:0, terminationType:"wall",
  },
  attenuator:{
    model:"", width_mm:0, height_mm:0, length_mm:0, pressureDrop_pa:0,
    il:{ hz63:0, hz125:0, hz250:0, hz500:0, hz1000:0, hz2000:0, hz4000:0, hz8000:0 },
  },
  receiver:{
    description:"", distance_m:3, directivity:2,
    requiredNC:65, requiredNR:65, required_dba:65,
  },
};

/* ─── Small reusable input ─────────────────────────────────── */
function N({ label, value, onChange, unit, min, step = 0.1, small }) {
  const [f, setF] = useState(false);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
      {label && (
        <label style={{ fontSize:11.5, fontWeight:600, color:"#475569",
          fontFamily:"Inter,sans-serif" }}>{label}</label>
      )}
      <div style={{ position:"relative" }}>
        <input
          type="number" value={value} min={min ?? 0} step={step}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          onFocus={() => setF(true)} onBlur={() => setF(false)}
          style={{
            width:"100%",
            padding: unit ? "8px 36px 8px 10px" : "8px 10px",
            border:`1.5px solid ${f?"#0E9F8E":"#E2E8F0"}`,
            borderRadius:7, fontSize: small ? 12.5 : 13,
            background:"#fff", color:"#0F172A", outline:"none",
            fontFamily:"Inter,sans-serif",
            boxShadow: f ? "0 0 0 3px rgba(14,159,142,.1)" : "none",
            transition:"border-color .15s, box-shadow .15s",
          }}
        />
        {unit && (
          <span style={{ position:"absolute", right:8, top:"50%",
            transform:"translateY(-50%)", fontSize:11, color:"#94A3B8",
            fontFamily:"Inter,sans-serif", pointerEvents:"none" }}>
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

function T({ label, value, onChange, placeholder }) {
  const [f, setF] = useState(false);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
      {label && (
        <label style={{ fontSize:11.5, fontWeight:600, color:"#475569",
          fontFamily:"Inter,sans-serif" }}>{label}</label>
      )}
      <input
        type="text" value={value} placeholder={placeholder || ""}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setF(true)} onBlur={() => setF(false)}
        style={{
          padding:"8px 10px",
          border:`1.5px solid ${f?"#0E9F8E":"#E2E8F0"}`,
          borderRadius:7, fontSize:13,
          background:"#fff", color:"#0F172A", outline:"none",
          fontFamily:"Inter,sans-serif",
          transition:"border-color .15s",
        }}
      />
    </div>
  );
}

function S({ label, value, onChange, options }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
      {label && (
        <label style={{ fontSize:11.5, fontWeight:600, color:"#475569",
          fontFamily:"Inter,sans-serif" }}>{label}</label>
      )}
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ padding:"8px 10px", border:"1.5px solid #E2E8F0",
          borderRadius:7, fontSize:13, background:"#fff",
          color:"#0F172A", outline:"none", fontFamily:"Inter,sans-serif" }}>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

/* ─── Section card ─────────────────────────────────────────── */
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
          justifyContent:"space-between", padding:"14px 18px",
          background:`linear-gradient(135deg,${color}12,${color}06)`,
          border:"none", borderBottom: open ? "1px solid #E2E8F0" : "none",
          cursor:"pointer",
        }}
      >
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:30, height:30, borderRadius:8,
            background:`${color}20`,
            display:"flex", alignItems:"center", justifyContent:"center" }}>
            <Icon size={15} color={color} />
          </div>
          <span style={{ fontFamily:"Plus Jakarta Sans,sans-serif",
            fontWeight:700, fontSize:14, color:"#0F172A" }}>{title}</span>
        </div>
        {open ? <ChevronUp size={16} color="#94A3B8" /> : <ChevronDown size={16} color="#94A3B8" />}
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

/* ─── Octave band grid ─────────────────────────────────────── */
function BandGrid({ label, values, onChange, unit="dB" }) {
  return (
    <div>
      {label && (
        <label style={{ display:"block", fontSize:11.5, fontWeight:600,
          color:"#475569", fontFamily:"Inter,sans-serif", marginBottom:8 }}>
          {label}
        </label>
      )}
      <div style={{ overflowX:"auto" }}>
        <table style={{ borderCollapse:"collapse", width:"100%", minWidth:560 }}>
          <thead>
            <tr>
              {BANDS.map(b => (
                <th key={b} style={{ padding:"5px 4px", textAlign:"center",
                  fontSize:11, color:"#94A3B8", fontWeight:600,
                  fontFamily:"Inter,sans-serif", background:"#F8FAFC",
                  border:"1px solid #E2E8F0" }}>
                  {b} Hz
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {BAND_KEYS.map((k, i) => (
                <td key={k} style={{ padding:4, border:"1px solid #E2E8F0",
                  background:"#fff" }}>
                  <N value={values[k]} small
                    onChange={v => onChange({ ...values, [k]: v })}
                    step={0.1} unit={unit} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
export default function AcousticInputForm({
  projectId, existing, onSaved, onResults,
}) {
  const [form, setForm] = useState(
    existing ? {
      noisePath:  existing.noisePath,
      generator:  existing.generator,
      room:       existing.room,
      duct:       existing.duct,
      attenuator: existing.attenuator,
      receiver:   existing.receiver,
    } : DEFAULT
  );

  const [saving,  setSaving]  = useState(false);
  const [running, setRunning] = useState(false);

  /* Nested set helpers */
  const setG  = (k, v) => setForm(f => ({ ...f, generator:  { ...f.generator,  [k]:v } }));
  const setGW = (v)    => setForm(f => ({ ...f, generator:  { ...f.generator,  swl:v } }));
  const setR  = (k, v) => setForm(f => ({ ...f, room:       { ...f.room,       [k]:v } }));
  const setD  = (k, v) => setForm(f => ({ ...f, duct:       { ...f.duct,       [k]:v } }));
  const setA  = (k, v) => setForm(f => ({ ...f, attenuator: { ...f.attenuator, [k]:v } }));
  const setAW = (v)    => setForm(f => ({ ...f, attenuator: { ...f.attenuator, il:v } }));
  const setRc = (k, v) => setForm(f => ({ ...f, receiver:   { ...f.receiver,   [k]:v } }));

  /* Live calculate without saving */
  const handleRun = async () => {
    setRunning(true);
    try {
      const { data } = await runCalculationApi(projectId, form);
      onResults(data.results);
      toast.success("Calculation complete");
    } catch (err) {
      toast.error(err.response?.data?.message || "Calculation failed");
    } finally {
      setRunning(false);
    }
  };

  /* Save + calculate */
  const handleSave = async () => {
    setSaving(true);
    try {
      let data;
      if (existing) {
        ({ data } = await updateCalculationApi(projectId, existing._id, form));
      } else {
        ({ data } = await createCalculationApi(projectId, form));
      }
      onResults(data.calculation.results);
      onSaved(data.calculation);
      toast.success(existing ? "Calculation updated" : "Calculation saved");
    } catch (err) {
      toast.error(err.response?.data?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const grid2 = { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 };
  const grid3 = { display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 };
  const grid4 = { display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:12 };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

      {/* Noise Path selector */}
      <div style={{ background:"#fff", borderRadius:12,
        border:"1px solid #E2E8F0", padding:"14px 18px" }}>
        <label style={{ fontSize:12, fontWeight:700, color:"#475569",
          textTransform:"uppercase", letterSpacing:".05em",
          fontFamily:"Inter,sans-serif", display:"block", marginBottom:10 }}>
          Noise Path
        </label>
        <div style={{ display:"flex", gap:8 }}>
          {[
            { value:"exhaust",  label:"Exhaust Air" },
            { value:"intake",   label:"Intake Air"  },
            { value:"radiated", label:"Radiated"    },
          ].map(p => (
            <button key={p.value}
              onClick={() => setForm(f => ({ ...f, noisePath: p.value }))}
              style={{
                padding:"8px 18px", borderRadius:8, border:"1.5px solid",
                borderColor: form.noisePath===p.value ? "#0E9F8E" : "#E2E8F0",
                background:  form.noisePath===p.value ? "#E3F8F5" : "#fff",
                color:       form.noisePath===p.value ? "#0E9F8E" : "#64748B",
                fontSize:13, fontWeight:600, cursor:"pointer",
                fontFamily:"Inter,sans-serif", transition:"all .15s",
              }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Section 1: Generator ── */}
      <Section icon={Zap} title="Generator Data" color="#0E9F8E">
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div style={grid2}>
            <T label="Equipment ID"  value={form.generator.equipmentId}
              onChange={v => setG("equipmentId",v)}
              placeholder="e.g. 1100KVA STANDBY GENERATOR" />
            <T label="Model Number"  value={form.generator.modelNumber}
              onChange={v => setG("modelNumber",v)}
              placeholder="e.g. 12M26D968E200" />
          </div>
          <div style={grid3}>
            <N label="Rated kVA"    value={form.generator.ratedKva}
              onChange={v => setG("ratedKva",v)} unit="kVA" step={1} />
            <N label="Overall SWL"  value={form.generator.swl_dba}
              onChange={v => setG("swl_dba",v)}  unit="dB(A)" step={0.1} />
            <T label="Building Ref" value={form.generator.buildingRef}
              onChange={v => setG("buildingRef",v)}
              placeholder="e.g. Ground Floor" />
          </div>

          {/* Octave band SWL */}
          <div style={{ background:"#F8FAFC", borderRadius:10, padding:"12px 14px" }}>
            <p style={{ fontSize:12, fontWeight:700, color:"#334155",
              fontFamily:"Plus Jakarta Sans,sans-serif", marginBottom:10 }}>
              Sound Power Level — Octave Bands (dB re 1pW)
            </p>
            <BandGrid values={form.generator.swl} onChange={setGW} unit="dB" />
          </div>
        </div>
      </Section>

      {/* ── Section 2: Plant Room ── */}
      <Section icon={Box} title="Plant Room / Enclosure" color="#3B82F6">
        <div style={grid4}>
          <N label="Length" value={form.room.length_m} onChange={v => setR("length_m",v)} unit="m" />
          <N label="Width"  value={form.room.width_m}  onChange={v => setR("width_m",v)}  unit="m" />
          <N label="Height" value={form.room.height_m} onChange={v => setR("height_m",v)} unit="m" />
          <N label="Avg. Absorption Coeff (α)" value={form.room.avgAbsCoeff}
            onChange={v => setR("avgAbsCoeff",v)} step={0.01} min={0.01} />
        </div>
        <div style={{ marginTop:10, padding:"10px 12px", background:"#EFF6FF",
          borderRadius:8, border:"1px solid #BFDBFE" }}>
          <p style={{ fontSize:12, color:"#1E40AF", fontFamily:"Inter,sans-serif", margin:0 }}>
            💡 Typical α: Concrete room ≈ 0.05 · Partly treated ≈ 0.3 · Acoustic panels ≈ 0.7–0.9
          </p>
        </div>
      </Section>

      {/* ── Section 3: Duct / Opening ── */}
      <Section icon={Wind} title="Duct / Opening" color="#8B5CF6">
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div style={grid3}>
            <N label="Width"  value={form.duct.width_mm}  onChange={v => setD("width_mm",v)}  unit="mm" step={10} />
            <N label="Height" value={form.duct.height_mm} onChange={v => setD("height_mm",v)} unit="mm" step={10} />
            <N label="Length" value={form.duct.length_m}  onChange={v => setD("length_m",v)}  unit="m"  step={0.5} />
          </div>
          <div style={grid3}>
            <S label="Duct Lining" value={form.duct.lining}
              onChange={v => setD("lining",v)}
              options={[
                { value:"unlined", label:"Unlined" },
                { value:"1inch",   label:"1-inch lined" },
                { value:"2inch",   label:"2-inch lined" },
              ]} />
            <N label="No. of Elbows" value={form.duct.elbows}
              onChange={v => setD("elbows",v)} step={1} unit="" />
            <S label="Termination Type" value={form.duct.terminationType}
              onChange={v => setD("terminationType",v)}
              options={[
                { value:"wall",       label:"In wall / louver" },
                { value:"free_space", label:"Free space"       },
              ]} />
          </div>
        </div>
      </Section>

      {/* ── Section 4: Attenuator / Louver ── */}
      <Section icon={Gauge} title="Attenuator / Acoustic Louver" color="#F59E0B" defaultOpen={false}>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div style={grid3}>
            <T label="Model"       value={form.attenuator.model}
              onChange={v => setA("model",v)} placeholder="e.g. A37" />
            <N label="Width"       value={form.attenuator.width_mm}
              onChange={v => setA("width_mm",v)}        unit="mm" step={100} />
            <N label="Height"      value={form.attenuator.height_mm}
              onChange={v => setA("height_mm",v)}       unit="mm" step={100} />
          </div>
          <div style={grid2}>
            <N label="Length"      value={form.attenuator.length_mm}
              onChange={v => setA("length_mm",v)}       unit="mm" step={100} />
            <N label="Pressure Drop" value={form.attenuator.pressureDrop_pa}
              onChange={v => setA("pressureDrop_pa",v)} unit="Pa" step={5} />
          </div>

          {/* Attenuator IL per band */}
          <div style={{ background:"#FFFBEB", borderRadius:10, padding:"12px 14px" }}>
            <p style={{ fontSize:12, fontWeight:700, color:"#92400E",
              fontFamily:"Plus Jakarta Sans,sans-serif", marginBottom:10 }}>
              Attenuator Insertion Loss per Octave Band
            </p>
            <BandGrid values={form.attenuator.il} onChange={setAW} unit="dB" />
            <p style={{ fontSize:11.5, color:"#92400E", marginTop:8,
              fontFamily:"Inter,sans-serif" }}>
              Enter positive values — e.g. 12 means 12 dB attenuation at that band
            </p>
          </div>
        </div>
      </Section>

      {/* ── Section 5: Receiver ── */}
      <Section icon={MapPin} title="Receiver Location" color="#EF4444">
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <T label="Receiver Description" value={form.receiver.description}
            onChange={v => setRc("description",v)}
            placeholder="e.g. 3m from exhaust louver, nearest facade" />
          <div style={grid3}>
            <N label="Distance to Receiver" value={form.receiver.distance_m}
              onChange={v => setRc("distance_m",v)} unit="m" step={0.5} min={1} />
            <S label="Directivity Factor (Q)" value={form.receiver.directivity}
              onChange={v => setRc("directivity", parseFloat(v))}
              options={[
                { value:1, label:"Q=1 (free field)" },
                { value:2, label:"Q=2 (half-space, near ground/wall)" },
                { value:4, label:"Q=4 (quarter-space, corner)" },
              ]} />
            <N label="Required dB(A) limit" value={form.receiver.required_dba}
              onChange={v => setRc("required_dba",v)} unit="dB(A)" step={1} />
          </div>
          <div style={grid2}>
            <N label="Required NC level" value={form.receiver.requiredNC}
              onChange={v => setRc("requiredNC",v)} step={5} unit="NC" />
            <N label="Required NR level" value={form.receiver.requiredNR}
              onChange={v => setRc("requiredNR",v)} step={5} unit="NR" />
          </div>
        </div>
      </Section>

      {/* ── Action buttons ── */}
      <div style={{ display:"flex", gap:12, justifyContent:"flex-end",
        padding:"4px 0 8px" }}>
        {/* Live run */}
        <motion.button
          onClick={handleRun} disabled={running || saving}
          whileHover={!running?{scale:1.02}:{}}
          whileTap={!running?{scale:0.98}:{}}
          style={{
            display:"flex", alignItems:"center", gap:8,
            padding:"11px 22px", borderRadius:10,
            border:"1.5px solid #0E9F8E", background:"#E3F8F5",
            color:"#0E9F8E", fontSize:14, fontWeight:700,
            fontFamily:"Plus Jakarta Sans,sans-serif",
            cursor: running ? "not-allowed":"pointer",
            transition:"all .15s",
          }}>
          {running
            ? <Loader2 size={16} style={{ animation:"spin .7s linear infinite" }} />
            : <Calculator size={16} />
          }
          {running ? "Calculating…" : "Run Calculation"}
        </motion.button>

        {/* Save */}
        <motion.button
          onClick={handleSave} disabled={saving || running}
          whileHover={!saving?{scale:1.02,y:-1}:{}}
          whileTap={!saving?{scale:0.98}:{}}
          style={{
            display:"flex", alignItems:"center", gap:8,
            padding:"11px 28px", borderRadius:10, border:"none",
            background: saving?"#CBD5E1":"linear-gradient(135deg,#0E9F8E,#0B8276)",
            color:"#fff", fontSize:14, fontWeight:700,
            fontFamily:"Plus Jakarta Sans,sans-serif",
            boxShadow: saving?"none":"0 4px 14px rgba(14,159,142,.3)",
            cursor: saving?"not-allowed":"pointer",
            transition:"all .15s",
          }}>
          {saving
            ? <Loader2 size={16} style={{ animation:"spin .7s linear infinite" }} />
            : null
          }
          {saving ? "Saving…" : existing ? "Update & Calculate" : "Save & Calculate"}
        </motion.button>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
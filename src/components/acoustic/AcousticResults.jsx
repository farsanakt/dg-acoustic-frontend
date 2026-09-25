import { motion } from "framer-motion";
import { CheckCircle2, XCircle, TrendingDown, Activity } from "lucide-react";

const BANDS     = [63, 125, 250, 500, 1000, 2000, 4000, 8000];
const BAND_KEYS = ["hz63","hz125","hz250","hz500","hz1000","hz2000","hz4000","hz8000"];

const INPUT_TYPE_LABELS = {
  swl_db:  "Sound Power Level (dB) — used directly",
  swl_dba: "Sound Power Level dB(A) → converted to SWL dB",
  spl_db:  "Sound Pressure Level dB → converted to SWL dB",
  spl_dba: "Sound Pressure Level dB(A) → converted to SWL dB",
};

const fmt = (v) =>
  (v === undefined || v === null || !isFinite(v)) ? "—" : (+v).toFixed(1);

function BandTable({ label, band, color="#334155", bg="#F8FAFC", highlight, bold }) {
  const arr = BAND_KEYS.map(k => band?.[k] ?? 0);
  return (
    <tr style={{ borderBottom:"1px solid #F1F5F9" }}>
      <td style={{
        padding:"8px 12px", fontSize:12.5,
        fontWeight: bold ? 700 : 600,
        color: bold ? color : "#334155",
        fontFamily:"Inter,sans-serif",
        whiteSpace:"nowrap", background:bg,
        minWidth:220,
      }}>
        {label}
      </td>
      {arr.map((v, i) => (
        <td key={i} style={{
          padding:"8px 6px", textAlign:"center",
          fontSize:12.5, fontFamily:"Inter,sans-serif",
          background: highlight ? (v > 0 ? "#FEF2F2" : bg) : bg,
          color: highlight && v > 0 ? "#EF4444" : (bold ? color : "#475569"),
          fontWeight: (bold || (highlight && v > 0)) ? 700 : 400,
        }}>
          {fmt(v)}
        </td>
      ))}
    </tr>
  );
}

export default function AcousticResults({ results, receiver }) {
  if (!results) return null;

  const {
    noiseInputType,
    swlConverted,
    swlAtDuct, distanceLoss, attenuatorLoss,
    ductInsertionLoss, endReflectionLoss, aWeighting,
    lp_at_receiver, lp_flat_at_receiver,
    total_lp_dba, nc_value, nr_value,
    passes_dba, additional_reduction_needed,
    nc_required_curve,
  } = results;

  const required_dba = receiver?.required_dba ?? 65;
  const requiredNC   = receiver?.requiredNC   ?? 65;
  const margin       = +(required_dba - total_lp_dba).toFixed(1);
  const showConversion = noiseInputType && noiseInputType !== "swl_db";

  return (
    <motion.div
      initial={{ opacity:0, y:16 }}
      animate={{ opacity:1, y:0 }}
      transition={{ duration:.35 }}
      style={{ display:"flex", flexDirection:"column", gap:20 }}
    >
      {/* ── Pass / Fail banner ── */}
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"18px 22px", flexWrap:"wrap", gap:12,
        background: passes_dba
          ? "linear-gradient(135deg,#F0FDF4,#DCFCE7)"
          : "linear-gradient(135deg,#FEF2F2,#FEE2E2)",
        border:`1.5px solid ${passes_dba ? "#86EFAC":"#FECACA"}`,
        borderRadius:14,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          {passes_dba
            ? <CheckCircle2 size={32} color="#16A34A" />
            : <XCircle      size={32} color="#DC2626" />
          }
          <div>
            <p style={{ fontSize:16, fontWeight:800, margin:0,
              fontFamily:"Plus Jakarta Sans,sans-serif",
              color: passes_dba ? "#15803D":"#DC2626" }}>
              {passes_dba ? "✓ PASSES" : "✗ FAILS"} — {fmt(total_lp_dba)} dB(A) at receiver
            </p>
            <p style={{ fontSize:13, margin:0,
              color: passes_dba ? "#166534":"#B91C1C",
              fontFamily:"Inter,sans-serif" }}>
              Limit: {required_dba} dB(A) · Margin: {margin > 0 ? "+" : ""}{margin} dB
            </p>
          </div>
        </div>
        <div style={{ display:"flex", gap:20 }}>
          {[
            { label:"dB(A)", value:fmt(total_lp_dba), color:passes_dba?"#16A34A":"#DC2626" },
            { label:"NC",    value:nc_value,            color:"#1D4ED8" },
            { label:"NR",    value:nr_value,            color:"#7C3AED" },
          ].map(s => (
            <div key={s.label} style={{ textAlign:"center" }}>
              <p style={{ fontSize:28, fontWeight:800, margin:0,
                color:s.color, fontFamily:"Plus Jakarta Sans,sans-serif",
                lineHeight:1 }}>{s.value}</p>
              <p style={{ fontSize:11, color:"#64748B",
                fontFamily:"Inter,sans-serif", margin:"3px 0 0" }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Input type badge ── */}
      {noiseInputType && (
        <div style={{
          padding:"9px 14px", borderRadius:8,
          background:"#F0F9FF", border:"1px solid #BAE6FD",
          fontSize:12.5, color:"#0369A1",
          fontFamily:"Inter,sans-serif",
        }}>
          <strong>Input type:</strong> {INPUT_TYPE_LABELS[noiseInputType] || noiseInputType}
        </div>
      )}

      {/* ── Full calculation table ── */}
      <div style={{ background:"#fff", borderRadius:14,
        border:"1px solid #E2E8F0", overflow:"hidden",
        boxShadow:"0 1px 4px rgba(0,0,0,.05)" }}>
        <div style={{ padding:"13px 16px", borderBottom:"1px solid #E2E8F0",
          display:"flex", alignItems:"center", gap:10 }}>
          <Activity size={16} color="#0E9F8E" />
          <h3 style={{ fontFamily:"Plus Jakarta Sans,sans-serif",
            fontWeight:700, fontSize:14, color:"#0F172A", margin:0 }}>
            Octave Band Calculation Summary
          </h3>
        </div>
        <div style={{ overflowX:"auto" }}>
          <table style={{ borderCollapse:"collapse", width:"100%", minWidth:680 }}>
            <thead>
              <tr style={{ background:"#0D2137" }}>
                <th style={{ padding:"10px 12px", textAlign:"left",
                  fontSize:12, color:"rgba(255,255,255,.7)",
                  fontFamily:"Inter,sans-serif", fontWeight:600,
                  minWidth:220 }}>
                  Parameter
                </th>
                {BANDS.map(b => (
                  <th key={b} style={{ padding:"10px 6px", textAlign:"center",
                    fontSize:12, color:"rgba(255,255,255,.7)",
                    fontFamily:"Inter,sans-serif", fontWeight:600,
                    minWidth:60 }}>
                    {b}
                  </th>
                ))}
              </tr>
              <tr style={{ background:"#1A3352" }}>
                <td style={{ padding:"4px 12px", fontSize:10.5,
                  color:"rgba(255,255,255,.35)", fontFamily:"Inter,sans-serif" }}>
                  Hz
                </td>
                {BANDS.map(b => (
                  <td key={b} style={{ padding:"4px 6px", textAlign:"center",
                    fontSize:10.5, color:"rgba(255,255,255,.35)",
                    fontFamily:"Inter,sans-serif" }}>—</td>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Conversion row — only shown for Cases 2, 3, 4 */}
              {showConversion && swlConverted && (
                <BandTable
                  label="SWL (dB) — after input conversion"
                  band={swlConverted}
                  bg="#FFF7ED" color="#C2410C" bold
                />
              )}

              <BandTable label="SWL at Duct Opening (dB)"
                band={swlAtDuct}    bg="#F8FAFC" color="#0E9F8E" bold />
              <BandTable label="Distance Correction (dB)"
                band={distanceLoss} bg="#fff"    color="#475569" />
              <BandTable label="Attenuator IL (dB)"
                band={attenuatorLoss} bg="#F8FAFC" color="#475569" />
              <BandTable label="Duct Insertion Loss (dB)"
                band={ductInsertionLoss} bg="#fff" color="#475569" />
              <BandTable label="End Reflection Loss (dB)"
                band={endReflectionLoss} bg="#F8FAFC" color="#475569" />
              <BandTable label="A-Weighting (dB)"
                band={aWeighting}   bg="#fff" color="#475569" />

              {/* Divider */}
              <tr><td colSpan={9}
                style={{ background:"#0D2137", height:2, padding:0 }} /></tr>

              <BandTable label="LP at Receiver — A-weighted (dB(A))"
                band={lp_at_receiver} bg="#E3F8F5" color="#0E9F8E" bold />
              <BandTable label="LP at Receiver — flat (dB)"
                band={lp_flat_at_receiver} bg="#F8FAFC" color="#334155" />
              <BandTable label={`Required NC${requiredNC} Limit (dB)`}
                band={nc_required_curve} bg="#EFF6FF" color="#1D4ED8" bold />
              <BandTable label="Additional Reduction Needed (dB)"
                band={additional_reduction_needed} bg="#fff" highlight />
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Bar chart ── */}
      <div style={{ background:"#fff", borderRadius:14,
        border:"1px solid #E2E8F0", padding:"16px 18px",
        boxShadow:"0 1px 4px rgba(0,0,0,.05)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
          <TrendingDown size={16} color="#8B5CF6" />
          <h3 style={{ fontFamily:"Plus Jakarta Sans,sans-serif",
            fontWeight:700, fontSize:14, color:"#0F172A", margin:0 }}>
            SPL vs. Noise Limit — Octave Bands
          </h3>
        </div>

        <div style={{ display:"flex", gap:6, alignItems:"flex-end", height:130 }}>
          {BAND_KEYS.map((k, i) => {
            const lp    = lp_flat_at_receiver?.[k] ?? 0;
            const limit = nc_required_curve?.[k]    ?? 65;
            const maxV  = Math.max(lp, limit, 40) + 10;
            const lpH   = Math.max(2, (lp    / maxV) * 110);
            const limH  = Math.max(2, (limit / maxV) * 110);
            const over  = lp > limit;

            return (
              <div key={k} style={{ flex:1, display:"flex",
                flexDirection:"column", alignItems:"center", gap:3 }}>
                <div style={{ position:"relative", width:"100%", height:110,
                  display:"flex", alignItems:"flex-end",
                  justifyContent:"center", gap:2 }}>
                  <motion.div
                    initial={{ height:0 }} animate={{ height:lpH }}
                    transition={{ delay:i*0.05, duration:.4 }}
                    style={{ width:"45%", background:over?"#EF4444":"#0E9F8E",
                      borderRadius:"4px 4px 0 0", position:"relative" }}>
                    <span style={{ position:"absolute", top:-16, left:"50%",
                      transform:"translateX(-50%)", fontSize:9.5, fontWeight:700,
                      color:over?"#EF4444":"#0E9F8E",
                      fontFamily:"Inter,sans-serif", whiteSpace:"nowrap" }}>
                      {fmt(lp)}
                    </span>
                  </motion.div>
                  <motion.div
                    initial={{ height:0 }} animate={{ height:limH }}
                    transition={{ delay:i*0.05+0.1, duration:.4 }}
                    style={{ width:"45%", background:"#BFDBFE",
                      borderRadius:"4px 4px 0 0" }} />
                </div>
                <span style={{ fontSize:10, color:"#94A3B8",
                  fontFamily:"Inter,sans-serif", fontWeight:600 }}>
                  {BANDS[i]}
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ display:"flex", gap:16, marginTop:10, justifyContent:"center" }}>
          {[
            { color:"#0E9F8E", label:"Calculated LP (dB)" },
            { color:"#BFDBFE", label:`NC${requiredNC} Limit` },
            { color:"#EF4444", label:"Exceeds limit" },
          ].map(l => (
            <div key={l.label} style={{ display:"flex", alignItems:"center", gap:5 }}>
              <div style={{ width:10, height:10, borderRadius:3, background:l.color }} />
              <span style={{ fontSize:11, color:"#64748B",
                fontFamily:"Inter,sans-serif" }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
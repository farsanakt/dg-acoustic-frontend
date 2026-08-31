import { motion } from "framer-motion";
import { GitBranch, Clock, User, Star } from "lucide-react";

const fmt = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", {
    day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit",
  }) : "—";

export default function VersionHistory({ versions = [], currentVersion }) {
  const sorted = [...versions].sort((a, b) => b.versionNo - a.versionNo);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
      {sorted.length === 0 ? (
        <p style={{ color:"#94A3B8", fontSize:13,
          fontFamily:"Inter,sans-serif", textAlign:"center", padding:"20px 0" }}>
          No versions saved yet
        </p>
      ) : (
        sorted.map((v, i) => {
          const isCurrent = v.versionNo === currentVersion;
          return (
            <motion.div key={v._id || i}
              initial={{ opacity:0, x:-10 }} animate={{ opacity:1, x:0 }}
              transition={{ delay:i*0.05 }}
              style={{
                display:"flex", gap:12, alignItems:"flex-start",
                padding:"12px 14px",
                background: isCurrent ? "#E3F8F5" : "#F8FAFC",
                border: `1.5px solid ${isCurrent ? "#0E9F8E" : "#E2E8F0"}`,
                borderRadius:10,
                position:"relative",
              }}
            >
              {/* Version badge */}
              <div style={{
                width:32, height:32, borderRadius:"50%", flexShrink:0,
                background: isCurrent ? "#0E9F8E" : "#E2E8F0",
                display:"flex", alignItems:"center", justifyContent:"center",
              }}>
                <span style={{ fontSize:11, fontWeight:800, color: isCurrent ? "#fff" : "#64748B",
                  fontFamily:"Inter,sans-serif" }}>
                  v{v.versionNo}
                </span>
              </div>

              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
                  <span style={{ fontSize:13.5, fontWeight:700, color:"#0F172A",
                    fontFamily:"Plus Jakarta Sans,sans-serif" }}>
                    {v.label || `Version ${v.versionNo}`}
                  </span>
                  {isCurrent && (
                    <span style={{ display:"flex", alignItems:"center", gap:3,
                      fontSize:10, fontWeight:700, color:"#0E9F8E",
                      background:"#C6F6F0", borderRadius:99, padding:"2px 8px",
                      fontFamily:"Inter,sans-serif" }}>
                      <Star size={9} fill="#0E9F8E" /> Current
                    </span>
                  )}
                </div>
                {v.note && (
                  <p style={{ fontSize:12.5, color:"#475569",
                    fontFamily:"Inter,sans-serif", margin:"0 0 6px",
                    lineHeight:1.5 }}>
                    {v.note}
                  </p>
                )}
                <div style={{ display:"flex", gap:14, flexWrap:"wrap" }}>
                  <span style={{ display:"flex", alignItems:"center", gap:4,
                    fontSize:11.5, color:"#94A3B8", fontFamily:"Inter,sans-serif" }}>
                    <Clock size={11} /> {fmt(v.savedAt)}
                  </span>
                  {v.savedBy?.name && (
                    <span style={{ display:"flex", alignItems:"center", gap:4,
                      fontSize:11.5, color:"#94A3B8", fontFamily:"Inter,sans-serif" }}>
                      <User size={11} /> {v.savedBy.name}
                    </span>
                  )}
                </div>
              </div>

              {/* Left bar for current */}
              {isCurrent && (
                <div style={{
                  position:"absolute", left:0, top:8, bottom:8,
                  width:3, borderRadius:99, background:"#0E9F8E",
                }} />
              )}
            </motion.div>
          );
        })
      )}
    </div>
  );
}

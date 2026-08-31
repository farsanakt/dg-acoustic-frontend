import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, GitBranch, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { saveVersionApi } from "@/api/projectApi";

export default function SaveVersionModal({ open, onClose, project, onSaved }) {
  const nextVer = (project?.currentVersion || 1) + 1;
  const [label,   setLabel]   = useState("");
  const [note,    setNote]    = useState("");
  const [saving,  setSaving]  = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveVersionApi(project._id, {
        label: label.trim() || `v${nextVer}`,
        note:  note.trim(),
      });
      toast.success(`Version v${nextVer} saved`);
      onSaved();
      onClose();
      setLabel(""); setNote("");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save version");
    } finally {
      setSaving(false);
    }
  };

  if (!open || !project) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            onClick={onClose}
            style={{ position:"fixed", inset:0, zIndex:1200,
              background:"rgba(13,33,55,.65)", backdropFilter:"blur(5px)" }} />

          <div style={{ position:"fixed", inset:0, zIndex:1201,
            display:"flex", alignItems:"center", justifyContent:"center",
            padding:16, pointerEvents:"none" }}>
            <motion.div
              initial={{ opacity:0, scale:0.95, y:14 }}
              animate={{ opacity:1, scale:1, y:0 }}
              exit={{ opacity:0, scale:0.95, y:14 }}
              transition={{ duration:0.2, ease:[0.16,1,0.3,1] }}
              onClick={e => e.stopPropagation()}
              style={{ width:"100%", maxWidth:440,
                background:"#fff", borderRadius:20,
                boxShadow:"0 24px 80px rgba(0,0,0,.2)",
                overflow:"hidden", pointerEvents:"all" }}
            >
              {/* Header */}
              <div style={{
                padding:"20px 22px 16px",
                background:"linear-gradient(135deg,#0D2137,#1A3352)",
                display:"flex", alignItems:"center", justifyContent:"space-between",
              }}>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ width:38, height:38, borderRadius:10,
                    background:"rgba(14,159,142,.25)",
                    display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <GitBranch size={19} color="#2EC4B6" />
                  </div>
                  <div>
                    <h3 style={{ fontFamily:"Plus Jakarta Sans,sans-serif",
                      fontWeight:800, fontSize:16, color:"#fff", margin:0 }}>
                      Save New Version
                    </h3>
                    <p style={{ fontSize:12, color:"rgba(255,255,255,.5)", margin:0,
                      fontFamily:"Inter,sans-serif" }}>
                      Current: v{project.currentVersion || 1} → New: v{nextVer}
                    </p>
                  </div>
                </div>
                <button onClick={onClose} style={{
                  width:30, height:30, borderRadius:8,
                  border:"1px solid rgba(255,255,255,.15)", background:"rgba(255,255,255,.08)",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  color:"rgba(255,255,255,.6)", cursor:"pointer" }}>
                  <X size={15} />
                </button>
              </div>

              {/* Body */}
              <div style={{ padding:"22px 22px 0",
                display:"flex", flexDirection:"column", gap:16 }}>

                {/* Version label */}
                <div>
                  <label style={{ display:"block", fontSize:12, fontWeight:600,
                    color:"#475569", marginBottom:5, textTransform:"uppercase",
                    letterSpacing:".03em", fontFamily:"Inter,sans-serif" }}>
                    Version Label
                  </label>
                  <input
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    placeholder={`v${nextVer} — e.g. "Revised exhaust calculation"`}
                    style={{ width:"100%", padding:"10px 12px",
                      border:"1.5px solid #E2E8F0", borderRadius:8,
                      fontSize:13.5, color:"#0F172A", outline:"none",
                      fontFamily:"Inter,sans-serif",
                      transition:"border-color .18s" }}
                    onFocus={e  => e.target.style.borderColor = "#0E9F8E"}
                    onBlur={e   => e.target.style.borderColor = "#E2E8F0"}
                  />
                  <p style={{ fontSize:11.5, color:"#94A3B8", marginTop:4,
                    fontFamily:"Inter,sans-serif" }}>
                    Leave blank to use "v{nextVer}" automatically
                  </p>
                </div>

                {/* Change note */}
                <div>
                  <label style={{ display:"block", fontSize:12, fontWeight:600,
                    color:"#475569", marginBottom:5, textTransform:"uppercase",
                    letterSpacing:".03em", fontFamily:"Inter,sans-serif" }}>
                    Change Note <span style={{ color:"#94A3B8", fontWeight:400,
                      textTransform:"none" }}>(optional)</span>
                  </label>
                  <textarea
                    value={note} onChange={e => setNote(e.target.value)}
                    placeholder="Describe what changed in this version…"
                    rows={3}
                    style={{ width:"100%", padding:"10px 12px",
                      border:"1.5px solid #E2E8F0", borderRadius:8,
                      fontSize:13.5, color:"#0F172A", outline:"none",
                      fontFamily:"Inter,sans-serif", resize:"none",
                      transition:"border-color .18s" }}
                    onFocus={e  => e.target.style.borderColor = "#0E9F8E"}
                    onBlur={e   => e.target.style.borderColor = "#E2E8F0"}
                  />
                </div>

                {/* Info banner */}
                <div style={{ background:"#F0FDF4", border:"1px solid #BBF7D0",
                  borderRadius:8, padding:"10px 13px",
                  display:"flex", gap:9, alignItems:"flex-start" }}>
                  <span style={{ fontSize:15 }}>✅</span>
                  <p style={{ fontSize:12.5, color:"#166534", margin:0,
                    fontFamily:"Inter,sans-serif", lineHeight:1.6 }}>
                    The previous version <strong>v{project.currentVersion || 1}</strong> will
                    be preserved in history. You can compare any two versions at any time.
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div style={{ padding:"18px 22px 22px",
                display:"flex", gap:10, justifyContent:"flex-end" }}>
                <button onClick={onClose} style={{
                  padding:"9px 20px", borderRadius:8,
                  border:"1.5px solid #E2E8F0", background:"#fff",
                  fontSize:13.5, fontWeight:600, color:"#475569",
                  cursor:"pointer", fontFamily:"Inter,sans-serif" }}>
                  Cancel
                </button>
                <motion.button
                  onClick={handleSave} disabled={saving}
                  whileHover={!saving?{scale:1.02}:{}}
                  whileTap={!saving?{scale:0.98}:{}}
                  style={{ padding:"9px 26px", borderRadius:8, border:"none",
                    background:saving?"#CBD5E1":"linear-gradient(135deg,#0E9F8E,#0B8276)",
                    color:"#fff", fontSize:13.5, fontWeight:700,
                    fontFamily:"Plus Jakarta Sans,sans-serif",
                    boxShadow:saving?"none":"0 4px 14px rgba(14,159,142,.3)",
                    display:"flex", alignItems:"center", gap:8,
                    cursor:saving?"not-allowed":"pointer" }}>
                  {saving && <Loader2 size={14} style={{ animation:"spin .7s linear infinite" }} />}
                  {saving ? "Saving…" : `Save as v${nextVer}`}
                </motion.button>
              </div>
            </motion.div>
          </div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </>
      )}
    </AnimatePresence>
  );
}

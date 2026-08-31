import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Trash2 } from "lucide-react";
import { deleteProjectApi } from "@/api/projectApi";
import toast from "react-hot-toast";

export default function DeleteModal({ project, onClose, onDeleted }) {
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    try {
      await deleteProjectApi(project._id);
      toast.success("Project deleted");
      onDeleted();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete");
    } finally {
      setLoading(false);
    }
  };

  if (!project) return null;

  return (
    <AnimatePresence>
      {project && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: "fixed", inset: 0, zIndex: 1100,
              background: "rgba(13,33,55,.65)", backdropFilter: "blur(5px)",
            }}
          />
          <div style={{
            position: "fixed", inset: 0, zIndex: 1101,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16, pointerEvents: "none",
          }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.93, y: 14 }}
              animate={{ opacity: 1, scale: 1,    y: 0  }}
              exit={{    opacity: 0, scale: 0.93, y: 14 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              onClick={e => e.stopPropagation()}
              style={{
                width: "100%", maxWidth: 400,
                background: "#fff", borderRadius: 20,
                boxShadow: "0 24px 80px rgba(0,0,0,.2)",
                padding: "32px 28px", textAlign: "center",
                pointerEvents: "all",
              }}
            >
              <div style={{
                width: 56, height: 56, borderRadius: "50%",
                background: "#FEF2F2", margin: "0 auto 18px",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <AlertTriangle size={26} color="#EF4444" />
              </div>

              <h3 style={{
                fontFamily: "Plus Jakarta Sans, sans-serif",
                fontWeight: 800, fontSize: 18, color: "#0F172A", marginBottom: 10,
              }}>
                Delete Project?
              </h3>

              <p style={{
                color: "#64748B", fontSize: 13.5, lineHeight: 1.65,
                marginBottom: 8, fontFamily: "Inter, sans-serif",
              }}>
                You are about to permanently delete
              </p>
              <p style={{
                color: "#0F172A", fontWeight: 700, fontSize: 14,
                fontFamily: "Inter, sans-serif", marginBottom: 6,
              }}>
                "{project.name}"
              </p>
              {(project.jobNumber || project.reportNumber) && (
                <p style={{
                  color: "#94A3B8", fontSize: 12.5,
                  fontFamily: "Inter, sans-serif", marginBottom: 6,
                }}>
                  {[project.jobNumber, project.reportNumber].filter(Boolean).join(" · ")}
                </p>
              )}
              <p style={{
                color: "#64748B", fontSize: 13, lineHeight: 1.6,
                marginBottom: 24, fontFamily: "Inter, sans-serif",
              }}>
                All versions and data will be lost. <strong>This cannot be undone.</strong>
              </p>

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={onClose} style={{
                  flex: 1, padding: "11px", borderRadius: 9,
                  border: "1.5px solid #E2E8F0", background: "#fff",
                  fontSize: 13.5, fontWeight: 600, color: "#475569",
                  cursor: "pointer", fontFamily: "Inter, sans-serif",
                }}>
                  Cancel
                </button>
                <motion.button
                  onClick={handleDelete} disabled={loading}
                  whileHover={!loading ? { scale: 1.02 } : {}}
                  whileTap={!loading  ? { scale: 0.98 } : {}}
                  style={{
                    flex: 1, padding: "11px", borderRadius: 9, border: "none",
                    background: loading ? "#CBD5E1" : "#EF4444",
                    color: "#fff", fontSize: 13.5, fontWeight: 700,
                    fontFamily: "Plus Jakarta Sans, sans-serif",
                    display: "flex", alignItems: "center",
                    justifyContent: "center", gap: 7,
                    cursor: loading ? "not-allowed" : "pointer",
                    boxShadow: loading ? "none" : "0 4px 14px rgba(239,68,68,.3)",
                  }}>
                  <Trash2 size={15} />
                  {loading ? "Deleting…" : "Yes, Delete"}
                </motion.button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

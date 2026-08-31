import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, FolderPlus, Loader2, Plus, Trash2,
  Building2, MapPin, Hash, FileText, Wrench,
  Tag, Users, HardHat, Calendar, ChevronRight,
} from "lucide-react";
import toast from "react-hot-toast";
import { createProjectApi, updateProjectApi } from "@/api/projectApi";

/* ─── Shared styles ─────────────────────────────────────── */
const S = {
  label: {
    display: "block", fontSize: 12, fontWeight: 600,
    color: "#475569", marginBottom: 5,
    fontFamily: "Inter, sans-serif", letterSpacing: ".02em",
    textTransform: "uppercase",
  },
  input: (focused, error) => ({
    width: "100%",
    padding: "9px 11px 9px 34px",
    border: `1.5px solid ${error ? "#EF4444" : focused ? "#0E9F8E" : "#E2E8F0"}`,
    borderRadius: 8, fontSize: 13.5,
    background: "#fff", color: "#0F172A", outline: "none",
    boxShadow: focused && !error ? "0 0 0 3px rgba(14,159,142,.1)" : "none",
    transition: "border-color .18s, box-shadow .18s",
    fontFamily: "Inter, sans-serif",
  }),
  inputNoIcon: (focused, error) => ({
    width: "100%",
    padding: "9px 11px",
    border: `1.5px solid ${error ? "#EF4444" : focused ? "#0E9F8E" : "#E2E8F0"}`,
    borderRadius: 8, fontSize: 13.5,
    background: "#fff", color: "#0F172A", outline: "none",
    boxShadow: focused && !error ? "0 0 0 3px rgba(14,159,142,.1)" : "none",
    transition: "border-color .18s, box-shadow .18s",
    fontFamily: "Inter, sans-serif",
  }),
  select: (focused) => ({
    width: "100%", padding: "9px 11px",
    border: `1.5px solid ${focused ? "#0E9F8E" : "#E2E8F0"}`,
    borderRadius: 8, fontSize: 13.5,
    background: "#fff", color: "#0F172A", outline: "none",
    fontFamily: "Inter, sans-serif",
    boxShadow: focused ? "0 0 0 3px rgba(14,159,142,.1)" : "none",
    transition: "border-color .18s, box-shadow .18s",
  }),
  error: {
    color: "#EF4444", fontSize: 11, marginTop: 3,
    fontFamily: "Inter, sans-serif",
  },
};

/* ─── Reusable Field ─────────────────────────────────────── */
function Field({ label, icon: Icon, error, value, onChange, placeholder,
  type = "text", required }) {
  const [f, setF] = useState(false);
  return (
    <div>
      <label style={S.label}>{label}{required && <span style={{ color:"#EF4444" }}> *</span>}</label>
      <div style={{ position: "relative" }}>
        {Icon && <Icon size={14} style={{
          position: "absolute", left: 10, top: "50%",
          transform: "translateY(-50%)",
          color: f ? "#0E9F8E" : "#94A3B8",
          pointerEvents: "none", transition: "color .18s",
        }} />}
        <input type={type} value={value} onChange={onChange} placeholder={placeholder}
          onFocus={() => setF(true)} onBlur={() => setF(false)}
          style={Icon ? S.input(f, error) : S.inputNoIcon(f, error)} />
      </div>
      {error && <p style={S.error}>{error}</p>}
    </div>
  );
}

/* ─── Reusable Select ────────────────────────────────────── */
function Select({ label, value, onChange, children, required }) {
  const [f, setF] = useState(false);
  return (
    <div>
      <label style={S.label}>{label}{required && <span style={{ color:"#EF4444" }}> *</span>}</label>
      <select value={value} onChange={onChange}
        onFocus={() => setF(true)} onBlur={() => setF(false)}
        style={S.select(f)}>
        {children}
      </select>
    </div>
  );
}

/* ─── Section header inside form ────────────────────────── */
function Section({ icon: Icon, title, color = "#0E9F8E" }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "10px 0 6px",
      borderBottom: "1.5px solid #F1F5F9",
      marginTop: 4,
    }}>
      <div style={{
        width: 26, height: 26, borderRadius: 7,
        background: `${color}18`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon size={13} color={color} />
      </div>
      <span style={{
        fontSize: 12, fontWeight: 700, color: "#334155",
        fontFamily: "Plus Jakarta Sans, sans-serif",
        letterSpacing: ".03em", textTransform: "uppercase",
      }}>{title}</span>
    </div>
  );
}

/* ─── Tab button ─────────────────────────────────────────── */
function Tab({ active, onClick, icon: Icon, label, count }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "8px 14px",
      borderBottom: `2px solid ${active ? "#0E9F8E" : "transparent"}`,
      color: active ? "#0E9F8E" : "#64748B",
      fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: active ? 600 : 500,
      background: "none", cursor: "pointer",
      transition: "all .18s",
    }}>
      <Icon size={14} />
      {label}
      {count != null && (
        <span style={{
          fontSize: 10.5, fontWeight: 700,
          background: active ? "#E3F8F5" : "#F1F5F9",
          color: active ? "#0E9F8E" : "#94A3B8",
          borderRadius: 99, padding: "1px 6px",
        }}>{count}</span>
      )}
    </button>
  );
}

/* ─── Equipment row ──────────────────────────────────────── */
function EquipmentRow({ item, index, onChange, onRemove, canRemove }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }} transition={{ duration: .2 }}
      style={{
        display: "grid", gridTemplateColumns: "28px 1fr 1fr 32px",
        gap: 8, alignItems: "center",
        background: "#F8FAFC", borderRadius: 8,
        border: "1px solid #E2E8F0", padding: "10px 12px",
      }}
    >
      {/* Index badge */}
      <div style={{
        width: 22, height: 22, borderRadius: "50%",
        background: "#E3F8F5", color: "#0E9F8E",
        fontSize: 11, fontWeight: 700,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "Inter, sans-serif",
      }}>
        {index + 1}
      </div>

      {/* Type */}
      <div>
        <label style={{ ...S.label, textTransform: "none", fontSize: 11 }}>Equipment Type</label>
        <div style={{ position: "relative" }}>
          <Wrench size={13} style={{
            position: "absolute", left: 8, top: "50%",
            transform: "translateY(-50%)", color: "#94A3B8", pointerEvents: "none",
          }} />
          <input
            value={item.type} placeholder="e.g. Diesel Generator"
            onChange={e => onChange(index, "type", e.target.value)}
            style={{
              width: "100%", padding: "7px 8px 7px 26px",
              border: "1px solid #E2E8F0", borderRadius: 6,
              fontSize: 13, background: "#fff", color: "#0F172A",
              outline: "none", fontFamily: "Inter, sans-serif",
            }}
            onFocus={e  => e.target.style.borderColor = "#0E9F8E"}
            onBlur={e   => e.target.style.borderColor = "#E2E8F0"}
          />
        </div>
      </div>

      {/* Tag */}
      <div>
        <label style={{ ...S.label, textTransform: "none", fontSize: 11 }}>Equipment Tag</label>
        <div style={{ position: "relative" }}>
          <Tag size={13} style={{
            position: "absolute", left: 8, top: "50%",
            transform: "translateY(-50%)", color: "#94A3B8", pointerEvents: "none",
          }} />
          <input
            value={item.tag} placeholder="e.g. DG-01"
            onChange={e => onChange(index, "tag", e.target.value)}
            style={{
              width: "100%", padding: "7px 8px 7px 26px",
              border: "1px solid #E2E8F0", borderRadius: 6,
              fontSize: 13, background: "#fff", color: "#0F172A",
              outline: "none", fontFamily: "Inter, sans-serif",
            }}
            onFocus={e  => e.target.style.borderColor = "#0E9F8E"}
            onBlur={e   => e.target.style.borderColor = "#E2E8F0"}
          />
        </div>
      </div>

      {/* Remove */}
      <button onClick={() => onRemove(index)} disabled={!canRemove}
        style={{
          width: 30, height: 30, borderRadius: 7, border: "1px solid #FECACA",
          background: canRemove ? "#FEF2F2" : "#F8FAFC",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: canRemove ? "#EF4444" : "#CBD5E1",
          cursor: canRemove ? "pointer" : "not-allowed",
          alignSelf: "flex-end", marginBottom: 1,
          transition: "all .18s", flexShrink: 0,
        }}>
        <Trash2 size={13} />
      </button>
    </motion.div>
  );
}

/* ─── Default form values ────────────────────────────────── */
const INIT = {
  jobNumber: "", name: "", projectType: "commercial",
  clientName: "", mainContractor: "", mepContractor: "",
  reportNumber: "", revision: "R00", reportDate: "",
  siteLocation: "", equipment: [{ type: "", tag: "" }],
  description: "", status: "draft",
};

const fromProject = (p) => ({
  jobNumber:     p.jobNumber     || "",
  name:          p.name          || "",
  projectType:   p.projectType   || "commercial",
  clientName:    p.clientName    || "",
  mainContractor:p.mainContractor|| "",
  mepContractor: p.mepContractor || "",
  reportNumber:  p.reportNumber  || "",
  revision:      p.revision      || "R00",
  reportDate:    p.reportDate    || "",
  siteLocation:  p.siteLocation  || "",
  equipment:     p.equipment?.length ? p.equipment.map(e => ({ type: e.type||"", tag: e.tag||"" }))
                                     : [{ type: "", tag: "" }],
  description:   p.description   || "",
  status:        p.status        || "draft",
});

/* ═══════════════════════════════════════════════════════════ */
export default function ProjectModal({ open, onClose, onSaved, project }) {
  const editing = !!project;
  const [tab,    setTab]    = useState("project");   // "project" | "report" | "equipment"
  const [form,   setForm]   = useState(INIT);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(project ? fromProject(project) : INIT);
      setErrors({});
      setTab("project");
    }
  }, [open, project]);

  const set    = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const setVal = (k, v)     => setForm(f => ({ ...f, [k]: v }));

  /* Equipment helpers */
  const addEquipment = () => {
    if (form.equipment.length >= 4) {
      toast("Maximum 4 equipment items allowed", { icon: "⚠️" });
      return;
    }
    setForm(f => ({ ...f, equipment: [...f.equipment, { type: "", tag: "" }] }));
  };
  const removeEquipment = (i) => {
    if (form.equipment.length <= 1) return;
    setForm(f => ({ ...f, equipment: f.equipment.filter((_, idx) => idx !== i) }));
  };
  const updateEquipment = (i, key, val) => {
    setForm(f => ({
      ...f,
      equipment: f.equipment.map((eq, idx) => idx === i ? { ...eq, [key]: val } : eq),
    }));
  };

  /* Validation */
  const validate = () => {
    const e = {};
    if (!form.name.trim())       e.name       = "Project name is required";
    if (!form.clientName.trim()) e.clientName = "Client name is required";
    setErrors(e);
    if (Object.keys(e).length) {
      setTab("project"); // jump back to show errors
    }
    return !Object.keys(e).length;
  };

  /* Save */
  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = { ...form };
      // remove empty equipment rows
      payload.equipment = payload.equipment.filter(e => e.type.trim() || e.tag.trim());
      if (editing) {
        await updateProjectApi(project._id, payload);
        toast.success("Project updated");
      } else {
        await createProjectApi(payload);
        toast.success("Project created");
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save project");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: "fixed", inset: 0, zIndex: 1000,
              background: "rgba(13,33,55,.65)",
              backdropFilter: "blur(5px)",
            }}
          />

          {/* Centering wrapper */}
          <div style={{
            position: "fixed", inset: 0, zIndex: 1001,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "16px",
            pointerEvents: "none",
          }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1,    y: 0  }}
              exit={{    opacity: 0, scale: 0.95, y: 16 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              onClick={e => e.stopPropagation()}
              style={{
                width: "100%", maxWidth: 620,
                maxHeight: "calc(100dvh - 32px)",
                background: "#fff", borderRadius: 20,
                boxShadow: "0 24px 80px rgba(0,0,0,.22)",
                display: "flex", flexDirection: "column",
                overflow: "hidden", pointerEvents: "all",
              }}
            >
              {/* ── Header ── */}
              <div style={{
                padding: "18px 22px 0",
                flexShrink: 0,
              }}>
                <div style={{
                  display: "flex", alignItems: "center",
                  justifyContent: "space-between", marginBottom: 14,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: "#E3F8F5",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <FolderPlus size={18} color="#0E9F8E" />
                    </div>
                    <div>
                      <h3 style={{
                        fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 800,
                        fontSize: 16, color: "#0F172A", margin: 0, lineHeight: 1.2,
                      }}>
                        {editing ? "Edit Project" : "New Project"}
                      </h3>
                      <p style={{ fontSize: 11.5, color: "#64748B", margin: 0,
                        fontFamily: "Inter, sans-serif" }}>
                        {editing ? "Update project information" : "Fill in the project details below"}
                      </p>
                    </div>
                  </div>
                  <button onClick={onClose} style={{
                    width: 30, height: 30, borderRadius: 8,
                    border: "1px solid #E2E8F0", background: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#64748B", cursor: "pointer", flexShrink: 0,
                  }}>
                    <X size={15} />
                  </button>
                </div>

                {/* ── Tab bar ── */}
                <div style={{
                  display: "flex", borderBottom: "1px solid #E2E8F0", gap: 2,
                }}>
                  <Tab active={tab==="project"}   onClick={() => setTab("project")}
                    icon={FileText}  label="Project Info" />
                  <Tab active={tab==="report"}    onClick={() => setTab("report")}
                    icon={Hash}      label="Report Details" />
                  <Tab active={tab==="equipment"} onClick={() => setTab("equipment")}
                    icon={Wrench}    label="Equipment"
                    count={form.equipment.filter(e=>e.type||e.tag).length || null} />
                </div>
              </div>

              {/* ── Scrollable body ── */}
              <div style={{
                flex: 1, overflowY: "auto",
                padding: "18px 22px",
                display: "flex", flexDirection: "column", gap: 14,
              }}>

                {/* ══ TAB 1: Project Info ══ */}
                {tab === "project" && (
                  <>
                    <Section icon={FileText} title="Project Identification" />

                    {/* Job No + Project Name */}
                    <div style={{ display:"grid", gridTemplateColumns:"160px 1fr", gap:12 }}>
                      <Field label="Job Number" icon={Hash}
                        placeholder="e.g. JOB-2026-001"
                        value={form.jobNumber} onChange={set("jobNumber")} />
                      <Field label="Project Name" icon={FileText} required
                        placeholder="e.g. DG Acoustic Assessment — Hotel Phase 1"
                        value={form.name} onChange={set("name")} error={errors.name} />
                    </div>

                    {/* Project Type + Site Location */}
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                      <Select label="Project Type" required
                        value={form.projectType} onChange={set("projectType")}>
                        <option value="residential">Residential</option>
                        <option value="hotel">Hotel</option>
                        <option value="commercial">Commercial</option>
                        <option value="hospital">Hospital</option>
                        <option value="industrial">Industrial</option>
                        <option value="data_centre">Data Centre</option>
                        <option value="mixed_use">Mixed Use</option>
                        <option value="other">Other</option>
                      </Select>
                      <Field label="Site Location" icon={MapPin}
                        placeholder="e.g. Dubai, UAE"
                        value={form.siteLocation} onChange={set("siteLocation")} />
                    </div>

                    <Section icon={Users} title="Project Parties" color="#3B82F6" />

                    {/* Client */}
                    <Field label="Client Name" icon={Building2} required
                      placeholder="e.g. ABC Hotel Group"
                      value={form.clientName} onChange={set("clientName")}
                      error={errors.clientName} />

                    {/* Main + MEP contractor */}
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                      <Field label="Main Contractor" icon={HardHat}
                        placeholder="e.g. XYZ Construction"
                        value={form.mainContractor} onChange={set("mainContractor")} />
                      <Field label="MEP Contractor" icon={HardHat}
                        placeholder="e.g. MEP Systems Ltd"
                        value={form.mepContractor} onChange={set("mepContractor")} />
                    </div>

                    <Section icon={ChevronRight} title="Status & Notes" color="#8B5CF6" />

                    <Select label="Project Status"
                      value={form.status} onChange={set("status")}>
                      <option value="draft">Draft</option>
                      <option value="in_progress">In Progress</option>
                      <option value="sent_to_client">Sent to Client</option>
                      <option value="client_reviewing">Client Reviewing</option>
                      <option value="revision_needed">Revision Needed</option>
                      <option value="approved">Approved</option>
                      <option value="completed">Completed</option>
                    </Select>

                    <div>
                      <label style={S.label}>Description / Notes</label>
                      <textarea
                        value={form.description} onChange={set("description")}
                        placeholder="Optional project notes…" rows={3}
                        style={{
                          width: "100%", padding: "9px 11px",
                          border: "1.5px solid #E2E8F0", borderRadius: 8,
                          fontSize: 13.5, background: "#fff", color: "#0F172A",
                          outline: "none", resize: "none",
                          fontFamily: "Inter, sans-serif", transition: "border-color .18s",
                        }}
                        onFocus={e => e.target.style.borderColor = "#0E9F8E"}
                        onBlur={e  => e.target.style.borderColor = "#E2E8F0"}
                      />
                    </div>
                  </>
                )}

                {/* ══ TAB 2: Report Details ══ */}
                {tab === "report" && (
                  <>
                    <Section icon={Hash} title="Calculation / Report Reference" />

                    {/* Report No + Revision */}
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 120px", gap:12 }}>
                      <Field label="Calculation / Report Number" icon={Hash}
                        placeholder="e.g. AAPL-SR-DG-080726"
                        value={form.reportNumber} onChange={set("reportNumber")} />
                      <Field label="Revision"
                        placeholder="e.g. R00"
                        value={form.revision} onChange={set("revision")} />
                    </div>

                    {/* Date */}
                    <Field label="Report Date" icon={Calendar}
                      type="date"
                      value={form.reportDate} onChange={set("reportDate")} />

                    {/* Tip box */}
                    <div style={{
                      background: "#F0F9FF", border: "1px solid #BAE6FD",
                      borderRadius: 8, padding: "12px 14px",
                      display: "flex", gap: 10, alignItems: "flex-start",
                    }}>
                      <span style={{ fontSize: 16 }}>💡</span>
                      <p style={{ fontSize: 12.5, color: "#0369A1",
                        fontFamily: "Inter, sans-serif", lineHeight: 1.6, margin: 0 }}>
                        The report number and revision are printed on the PDF report cover page.
                        Use format <strong>AAPL-SR-DG-DDMMYY</strong> and revision <strong>R00</strong> for first issue.
                      </p>
                    </div>
                  </>
                )}

                {/* ══ TAB 3: Equipment ══ */}
                {tab === "equipment" && (
                  <>
                    <Section icon={Wrench} title="Equipment Items" />

                    <p style={{ fontSize: 12.5, color: "#64748B",
                      fontFamily: "Inter, sans-serif", lineHeight: 1.6, margin: 0 }}>
                      Add up to <strong>4</strong> equipment items for this assessment.
                      Each item can have a Type (e.g. Diesel Generator) and a Tag (e.g. DG-01).
                    </p>

                    <AnimatePresence>
                      {form.equipment.map((item, i) => (
                        <EquipmentRow key={i} item={item} index={i}
                          onChange={updateEquipment}
                          onRemove={removeEquipment}
                          canRemove={form.equipment.length > 1} />
                      ))}
                    </AnimatePresence>

                    {form.equipment.length < 4 && (
                      <motion.button
                        onClick={addEquipment}
                        whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "center",
                          gap: 7, padding: "10px",
                          border: "1.5px dashed #0E9F8E", borderRadius: 8,
                          background: "#F0FDFB", color: "#0E9F8E",
                          fontSize: 13.5, fontWeight: 600,
                          fontFamily: "Inter, sans-serif", cursor: "pointer",
                          width: "100%",
                        }}>
                        <Plus size={16} />
                        Add Equipment ({form.equipment.length} / 4)
                      </motion.button>
                    )}

                    {form.equipment.length >= 4 && (
                      <div style={{
                        textAlign: "center", padding: "10px",
                        background: "#FFFBEB", borderRadius: 8,
                        border: "1px solid #FDE68A",
                        color: "#92400E", fontSize: 12.5,
                        fontFamily: "Inter, sans-serif",
                      }}>
                        ⚠ Maximum 4 equipment items reached
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* ── Footer ── */}
              <div style={{
                padding: "12px 22px 18px",
                borderTop: "1px solid #E2E8F0",
                display: "flex", alignItems: "center",
                justifyContent: "space-between",
                flexShrink: 0, background: "#fff",
              }}>
                {/* Tab navigation hints */}
                <div style={{ display: "flex", gap: 6 }}>
                  {["project","report","equipment"].map((t, i) => (
                    <div key={t} onClick={() => setTab(t)} style={{
                      width: 28, height: 4, borderRadius: 99, cursor: "pointer",
                      background: tab === t ? "#0E9F8E" : "#E2E8F0",
                      transition: "background .2s",
                    }} />
                  ))}
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={onClose} style={{
                    padding: "9px 20px", borderRadius: 8,
                    border: "1.5px solid #E2E8F0", background: "#fff",
                    fontSize: 13.5, fontWeight: 600, color: "#475569",
                    cursor: "pointer", fontFamily: "Inter, sans-serif",
                  }}>
                    Cancel
                  </button>
                  <motion.button
                    onClick={handleSave} disabled={saving}
                    whileHover={!saving ? { scale: 1.02 } : {}}
                    whileTap={!saving  ? { scale: 0.98 } : {}}
                    style={{
                      padding: "9px 26px", borderRadius: 8, border: "none",
                      background: saving ? "#CBD5E1"
                        : "linear-gradient(135deg, #0E9F8E, #0B8276)",
                      color: "#fff", fontSize: 13.5, fontWeight: 700,
                      fontFamily: "Plus Jakarta Sans, sans-serif",
                      boxShadow: saving ? "none" : "0 4px 14px rgba(14,159,142,.3)",
                      display: "flex", alignItems: "center", gap: 8,
                      cursor: saving ? "not-allowed" : "pointer",
                    }}>
                    {saving && <Loader2 size={14} style={{ animation: "spin .7s linear infinite" }} />}
                    {saving ? "Saving…" : editing ? "Save Changes" : "Create Project"}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </div>

          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </>
      )}
    </AnimatePresence>
  );
}

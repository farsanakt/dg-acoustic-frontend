import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Edit2, GitBranch, Info,
  Clock, CheckCircle2, AlertCircle,
  RefreshCw, Trash2, GitCommit, Loader2,
  ChevronDown,
} from "lucide-react";
import toast from "react-hot-toast";

import Sidebar              from "../../components/Sidebar";
import ProjectInfoPanel     from "../../components/ProjectInfoPanel";
import VersionHistory       from "../../components/VersionHistory";
import SaveVersionModal     from "../../components/SaveVersionModal";
import ProjectModal         from "../../components/ProjectModal";
import DeleteModal          from "../../components/DeleteModal";
import AcousticInputForm    from "@/components/acoustic/AcousticInputForm";
import AcousticResults      from "@/components/acoustic/AcousticResults";
import { getProjectApi, updateProjectApi } from "@/api/projectApi";
import { getCalculationsApi } from "@/api/calculationApi";

/* ── Status options ── */
const STATUSES = [
  { value:"draft",            label:"Draft",            color:"#64748B" },
  { value:"in_progress",      label:"In Progress",      color:"#3B82F6" },
  { value:"sent_to_client",   label:"Sent to Client",   color:"#8B5CF6" },
  { value:"client_reviewing", label:"Client Reviewing", color:"#F59E0B" },
  { value:"revision_needed",  label:"Revision Needed",  color:"#EF4444" },
  { value:"approved",         label:"Approved",         color:"#22C55E" },
  { value:"completed",        label:"Completed",        color:"#0E9F8E" },
];

/* ── Tab button ── */
function Tab({ active, onClick, icon: Icon, label }) {
  return (
    <button onClick={onClick} style={{
      display:"flex", alignItems:"center", gap:7,
      padding:"11px 20px",
      borderBottom:`2.5px solid ${active ? "#0E9F8E" : "transparent"}`,
      color: active ? "#0E9F8E" : "#64748B",
      fontFamily:"Inter,sans-serif", fontSize:13.5,
      fontWeight: active ? 600 : 500,
      background:"none", cursor:"pointer",
      transition:"all .18s", whiteSpace:"nowrap",
    }}>
      <Icon size={15} />
      {label}
    </button>
  );
}

/* ── Status dropdown ── */
function StatusDropdown({ current, onChange, loading }) {
  const [open, setOpen] = useState(false);
  const cur = STATUSES.find(s => s.value === current) || STATUSES[0];

  return (
    <div style={{ position:"relative" }}>
      <button
        onClick={() => setOpen(!open)}
        disabled={loading}
        style={{
          display:"flex", alignItems:"center", gap:8,
          padding:"8px 14px",
          background:"#fff", border:"1.5px solid #E2E8F0",
          borderRadius:10, cursor:loading?"not-allowed":"pointer",
          fontSize:13, fontWeight:600, color:"#0F172A",
          fontFamily:"Inter,sans-serif",
          transition:"border-color .18s",
          boxShadow:"0 1px 3px rgba(0,0,0,.06)",
        }}
        onMouseEnter={e => !loading && (e.currentTarget.style.borderColor="#0E9F8E")}
        onMouseLeave={e => e.currentTarget.style.borderColor="#E2E8F0"}
      >
        {loading
          ? <Loader2 size={14} style={{ animation:"spin .7s linear infinite" }} />
          : <div style={{ width:8, height:8, borderRadius:"50%",
              background:cur.color, flexShrink:0 }} />
        }
        {cur.label}
        <ChevronDown size={13} style={{
          transform: open ? "rotate(180deg)" : "rotate(0deg)",
          transition:"transform .2s", color:"#94A3B8",
        }} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity:0, y:-6, scale:.97 }}
            animate={{ opacity:1, y:0, scale:1 }}
            exit={{ opacity:0, y:-6, scale:.97 }}
            transition={{ duration:.15 }}
            style={{
              position:"absolute", top:"calc(100% + 6px)", left:0,
              minWidth:180, background:"#fff",
              borderRadius:12, border:"1.5px solid #E2E8F0",
              boxShadow:"0 8px 32px rgba(0,0,0,.12)",
              zIndex:50, overflow:"hidden",
            }}
          >
            {STATUSES.map(s => (
              <button key={s.value}
                onClick={() => { onChange(s.value); setOpen(false); }}
                style={{
                  display:"flex", alignItems:"center", gap:10,
                  width:"100%", padding:"10px 14px",
                  background: s.value === current ? "#F8FAFC" : "#fff",
                  color:"#0F172A", fontSize:13, fontFamily:"Inter,sans-serif",
                  fontWeight: s.value === current ? 700 : 500,
                  cursor:"pointer", textAlign:"left",
                  transition:"background .15s",
                  borderBottom:"1px solid #F8FAFC",
                }}
                onMouseEnter={e => e.currentTarget.style.background="#F0FDFB"}
                onMouseLeave={e => e.currentTarget.style.background=s.value===current?"#F8FAFC":"#fff"}
              >
                <div style={{ width:8, height:8, borderRadius:"50%",
                  background:s.color, flexShrink:0 }} />
                {s.label}
                {s.value === current && (
                  <CheckCircle2 size={13} color="#0E9F8E" style={{ marginLeft:"auto" }} />
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {open && (
        <div onClick={() => setOpen(false)}
          style={{ position:"fixed", inset:0, zIndex:49 }} />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════ */
export default function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [collapsed,       setCollapsed]       = useState(false);
  const [project,         setProject]         = useState(null);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState(false);
  const [tab,             setTab]             = useState("info");
  const [statusUpdating,  setStatusUpdating]  = useState(false);
  const [versionModal,    setVersionModal]    = useState(false);
  const [editModal,       setEditModal]       = useState(false);
  const [deleteModal,     setDeleteModal]     = useState(false);
  const [calcResults,     setCalcResults]     = useState(null);
  const [existingCalc,    setExistingCalc]    = useState(null);

  const sidebarW = collapsed ? 68 : 232;

  /* Fetch */
  const fetchProject = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const { data } = await getProjectApi(id);
      setProject(data.project);
    } catch (err) {
      setError(true);
      if (err.response?.status === 404) toast.error("Project not found");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchProject(); }, [fetchProject]);

  /* Fetch existing calculations */
  useEffect(() => {
    if (!id) return;
    getCalculationsApi(id).then(({ data }) => {
      if (data.calculations?.length > 0) {
        setExistingCalc(data.calculations[0]);
        setCalcResults(data.calculations[0].results);
      }
    }).catch(() => {});
  }, [id]);

  /* Status change */
  const handleStatusChange = async (newStatus) => {
    setStatusUpdating(true);
    try {
      const { data } = await updateProjectApi(id, { status: newStatus });
      setProject(data.project);
      toast.success("Status updated");
    } catch {
      toast.error("Failed to update status");
    } finally {
      setStatusUpdating(false);
    }
  };

  /* Helpers */
  const fmtDate = (d) => d
    ? new Date(d).toLocaleDateString("en-GB",
        { day:"2-digit", month:"short", year:"numeric" })
    : "—";

  /* ── Render ── */
  if (loading) return (
    <div style={{ display:"flex", minHeight:"100vh", background:"#F8FAFC" }}>
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      <div style={{ flex:1, marginLeft:sidebarW, display:"flex",
        alignItems:"center", justifyContent:"center", flexDirection:"column", gap:14 }}>
        <div style={{ width:38, height:38, border:"3px solid #E2E8F0",
          borderTopColor:"#0E9F8E", borderRadius:"50%",
          animation:"spin .75s linear infinite" }} />
        <p style={{ color:"#94A3B8", fontSize:13, fontFamily:"Inter,sans-serif" }}>
          Loading project…
        </p>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );

  if (error || !project) return (
    <div style={{ display:"flex", minHeight:"100vh", background:"#F8FAFC" }}>
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      <div style={{ flex:1, marginLeft:sidebarW, display:"flex",
        alignItems:"center", justifyContent:"center", flexDirection:"column", gap:14 }}>
        <AlertCircle size={44} color="#EF4444" />
        <p style={{ fontSize:16, fontWeight:700, color:"#0F172A",
          fontFamily:"Plus Jakarta Sans,sans-serif" }}>Project not found</p>
        <button onClick={() => navigate("/engineer")}
          style={{ padding:"10px 22px", borderRadius:10,
            background:"#0E9F8E", color:"#fff",
            fontSize:14, fontWeight:600, fontFamily:"Inter,sans-serif",
            border:"none", cursor:"pointer" }}>
          Back to Dashboard
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ display:"flex", minHeight:"100vh", background:"#F8FAFC",
      fontFamily:"var(--font-body)" }}>

      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />

      <div style={{ flex:1, marginLeft:sidebarW,
        transition:"margin-left .25s cubic-bezier(.4,0,.2,1)" }}>

        {/* ── Page Header ── */}
        <div style={{
          position:"sticky", top:0, zIndex:30,
          background:"rgba(248,250,252,.95)", backdropFilter:"blur(12px)",
          borderBottom:"1px solid #E2E8F0",
        }}>
          {/* Breadcrumb row */}
          <div style={{
            display:"flex", alignItems:"center", justifyContent:"space-between",
            padding:"14px 32px 0",
          }}>
            {/* Left: back + title */}
            <div style={{ display:"flex", alignItems:"center", gap:14 }}>
              <button onClick={() => navigate("/engineer")}
                style={{
                  display:"flex", alignItems:"center", gap:6,
                  padding:"7px 12px", borderRadius:9,
                  border:"1.5px solid #E2E8F0", background:"#fff",
                  color:"#64748B", fontSize:13, fontWeight:500,
                  cursor:"pointer", transition:"all .18s",
                  fontFamily:"Inter,sans-serif",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor="#0E9F8E"; e.currentTarget.style.color="#0E9F8E"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor="#E2E8F0"; e.currentTarget.style.color="#64748B"; }}
              >
                <ArrowLeft size={14} /> Dashboard
              </button>

              <div style={{ width:1, height:24, background:"#E2E8F0" }} />

              <div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  {project.jobNumber && (
                    <span style={{ fontSize:11.5, fontWeight:700, color:"#0E9F8E",
                      fontFamily:"Inter,sans-serif", letterSpacing:".04em" }}>
                      {project.jobNumber}
                    </span>
                  )}
                  {project.jobNumber && <span style={{ color:"#CBD5E1" }}>·</span>}
                  <h1 style={{ fontFamily:"Plus Jakarta Sans,sans-serif",
                    fontWeight:800, fontSize:18, color:"#0F172A", margin:0 }}>
                    {project.name}
                  </h1>
                </div>
                <p style={{ fontSize:12, color:"#94A3B8",
                  fontFamily:"Inter,sans-serif", margin:"2px 0 0" }}>
                  {project.clientName}
                  {project.siteLocation && ` · ${project.siteLocation}`}
                  {` · Updated ${fmtDate(project.updatedAt)}`}
                </p>
              </div>
            </div>

            {/* Right: action buttons */}
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              {/* Status dropdown */}
              <StatusDropdown
                current={project.status}
                onChange={handleStatusChange}
                loading={statusUpdating}
              />

              {/* Save version */}
              <motion.button
                onClick={() => setVersionModal(true)}
                whileHover={{ scale:1.03, y:-1 }}
                whileTap={{ scale:0.97 }}
                style={{
                  display:"flex", alignItems:"center", gap:7,
                  padding:"8px 16px",
                  background:"linear-gradient(135deg,#0E9F8E,#0B8276)",
                  color:"#fff", borderRadius:10, border:"none",
                  fontSize:13, fontWeight:700,
                  fontFamily:"Plus Jakarta Sans,sans-serif",
                  boxShadow:"0 4px 14px rgba(14,159,142,.3)",
                  cursor:"pointer",
                }}>
                <GitCommit size={14} strokeWidth={2.5} />
                Save Version
              </motion.button>

              {/* Edit */}
              <button onClick={() => setEditModal(true)}
                style={{
                  width:36, height:36, borderRadius:9,
                  border:"1.5px solid #E2E8F0", background:"#fff",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  color:"#64748B", cursor:"pointer", transition:"all .18s",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor="#0E9F8E"; e.currentTarget.style.color="#0E9F8E"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor="#E2E8F0"; e.currentTarget.style.color="#64748B"; }}>
                <Edit2 size={15} />
              </button>

              {/* Delete */}
              <button onClick={() => setDeleteModal(true)}
                style={{
                  width:36, height:36, borderRadius:9,
                  border:"1.5px solid #E2E8F0", background:"#fff",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  color:"#64748B", cursor:"pointer", transition:"all .18s",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor="#FECACA"; e.currentTarget.style.color="#EF4444"; e.currentTarget.style.background="#FEF2F2"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor="#E2E8F0"; e.currentTarget.style.color="#64748B"; e.currentTarget.style.background="#fff"; }}>
                <Trash2 size={15} />
              </button>

              {/* Refresh */}
              <button onClick={fetchProject}
                style={{
                  width:36, height:36, borderRadius:9,
                  border:"1.5px solid #E2E8F0", background:"#fff",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  color:"#64748B", cursor:"pointer",
                }}>
                <RefreshCw size={14} />
              </button>
            </div>
          </div>

          {/* Tab bar */}
          <div style={{ display:"flex", padding:"0 32px",
            borderTop:"none", gap:4, marginTop:4 }}>
            <Tab active={tab==="info"}     onClick={() => setTab("info")}
              icon={Info}       label="Project Info" />
            <Tab active={tab==="versions"} onClick={() => setTab("versions")}
              icon={GitBranch}  label={`Version History (${project.versions?.length || 0})`} />
            <Tab active={tab==="acoustic"} onClick={() => setTab("acoustic")}
              icon={CheckCircle2}  label="Acoustic Calculation" />
          </div>
        </div>

        {/* ── Main content ── */}
        <main style={{ padding:"32px", maxWidth:1100, margin:"0 auto" }}>
          <AnimatePresence mode="wait">
            {tab === "info" && (
              <motion.div key="info"
                initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
                exit={{ opacity:0 }} transition={{ duration:.22 }}
              >
                <div style={{
                  display:"grid",
                  gridTemplateColumns:"1fr 340px",
                  gap:24, alignItems:"start",
                }}>
                  {/* Left: Project info card */}
                  <div style={{
                    background:"#fff", borderRadius:16,
                    border:"1px solid #E2E8F0",
                    padding:"28px 28px",
                    boxShadow:"0 1px 4px rgba(0,0,0,.05)",
                  }}>
                    <h2 style={{ fontFamily:"Plus Jakarta Sans,sans-serif",
                      fontWeight:800, fontSize:16, color:"#0F172A",
                      margin:"0 0 4px" }}>
                      Project Details
                    </h2>
                    <p style={{ fontSize:12.5, color:"#94A3B8",
                      fontFamily:"Inter,sans-serif", margin:"0 0 20px" }}>
                      Full project information
                    </p>
                    <ProjectInfoPanel project={project} />
                  </div>

                  {/* Right: Quick stats */}
                  <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                    {/* Version snapshot */}
                    <div style={{
                      background:"linear-gradient(135deg,#0D2137,#1A3352)",
                      borderRadius:16, padding:"22px 22px",
                      boxShadow:"0 4px 20px rgba(13,33,55,.2)",
                    }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
                        <div style={{ width:36, height:36, borderRadius:10,
                          background:"rgba(14,159,142,.2)",
                          display:"flex", alignItems:"center", justifyContent:"center" }}>
                          <GitBranch size={18} color="#2EC4B6" />
                        </div>
                        <div>
                          <p style={{ fontSize:11, color:"rgba(255,255,255,.5)",
                            fontFamily:"Inter,sans-serif", margin:0,
                            textTransform:"uppercase", letterSpacing:".05em" }}>
                            Current Version
                          </p>
                          <p style={{ fontSize:22, fontWeight:800, color:"#fff",
                            fontFamily:"Plus Jakarta Sans,sans-serif", margin:0 }}>
                            v{project.currentVersion || 1}
                          </p>
                        </div>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr",
                        gap:10 }}>
                        {[
                          { label:"Total Versions", value: project.versions?.length || 1 },
                          { label:"Equipment Items", value: (project.equipment||[]).filter(e=>e.type||e.tag).length },
                        ].map(s => (
                          <div key={s.label} style={{ background:"rgba(255,255,255,.07)",
                            borderRadius:10, padding:"12px 14px" }}>
                            <p style={{ fontSize:20, fontWeight:800, color:"#fff",
                              fontFamily:"Plus Jakarta Sans,sans-serif", margin:0 }}>
                              {s.value}
                            </p>
                            <p style={{ fontSize:11, color:"rgba(255,255,255,.4)",
                              fontFamily:"Inter,sans-serif", margin:"2px 0 0" }}>
                              {s.label}
                            </p>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => setVersionModal(true)}
                        style={{
                          width:"100%", marginTop:14,
                          padding:"10px",
                          background:"rgba(14,159,142,.2)",
                          border:"1px solid rgba(14,159,142,.4)",
                          borderRadius:10, color:"#2EC4B6",
                          fontSize:13, fontWeight:700,
                          fontFamily:"Inter,sans-serif", cursor:"pointer",
                          display:"flex", alignItems:"center",
                          justifyContent:"center", gap:7,
                          transition:"background .18s",
                        }}
                        onMouseEnter={e => e.currentTarget.style.background="rgba(14,159,142,.3)"}
                        onMouseLeave={e => e.currentTarget.style.background="rgba(14,159,142,.2)"}
                      >
                        <GitCommit size={14} /> Save New Version
                      </button>
                    </div>

                    {/* Timeline */}
                    <div style={{ background:"#fff", borderRadius:16,
                      border:"1px solid #E2E8F0", padding:"20px 20px",
                      boxShadow:"0 1px 4px rgba(0,0,0,.05)" }}>
                      <p style={{ fontSize:12, fontWeight:700, color:"#94A3B8",
                        textTransform:"uppercase", letterSpacing:".06em",
                        fontFamily:"Inter,sans-serif", margin:"0 0 14px" }}>
                        Timeline
                      </p>
                      {[
                        { label:"Created", value: fmtDate(project.createdAt), color:"#0E9F8E" },
                        { label:"Last Updated", value: fmtDate(project.updatedAt), color:"#3B82F6" },
                        { label:"Report Date", value: project.reportDate
                            ? fmtDate(project.reportDate) : "Not set", color:"#8B5CF6" },
                      ].map(t => (
                        <div key={t.label} style={{ display:"flex", justifyContent:"space-between",
                          alignItems:"center", padding:"8px 0",
                          borderBottom:"1px solid #F8FAFC" }}>
                          <span style={{ fontSize:12.5, color:"#64748B",
                            fontFamily:"Inter,sans-serif" }}>{t.label}</span>
                          <span style={{ fontSize:12.5, fontWeight:600,
                            color:t.color, fontFamily:"Inter,sans-serif" }}>
                            {t.value}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Next step hint */}
                    <div style={{ background:"#FFF7ED", border:"1px solid #FED7AA",
                      borderRadius:14, padding:"16px 18px" }}>
                      <p style={{ fontSize:12, fontWeight:700, color:"#C2410C",
                        fontFamily:"Inter,sans-serif", margin:"0 0 6px",
                        textTransform:"uppercase", letterSpacing:".05em" }}>
                        Next Step
                      </p>
                      <p style={{ fontSize:13, color:"#92400E",
                        fontFamily:"Inter,sans-serif", lineHeight:1.6, margin:0 }}>
                        Acoustic input forms and calculation engine coming in Step 5.
                        You will be able to enter octave-band data and run assessments here.
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {tab === "acoustic" && (
              <motion.div key="acoustic"
                initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
                exit={{ opacity:0 }} transition={{ duration:.22 }}
              >
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24, alignItems:"start" }}>
                  <div>
                    <h2 style={{ fontFamily:"Plus Jakarta Sans,sans-serif",
                      fontWeight:800, fontSize:16, color:"#0F172A",
                      margin:"0 0 4px" }}>Acoustic Inputs</h2>
                    <p style={{ fontSize:12.5, color:"#94A3B8",
                      fontFamily:"Inter,sans-serif", margin:"0 0 20px" }}>
                      Enter calculation data and click Run or Save & Calculate
                    </p>
                    <AcousticInputForm
                      projectId={id}
                      existing={existingCalc}
                      onSaved={(c) => setExistingCalc(c)}
                      onResults={(r) => setCalcResults(r)}
                    />
                  </div>
                  <div>
                    <h2 style={{ fontFamily:"Plus Jakarta Sans,sans-serif",
                      fontWeight:800, fontSize:16, color:"#0F172A",
                      margin:"0 0 4px" }}>Results</h2>
                    <p style={{ fontSize:12.5, color:"#94A3B8",
                      fontFamily:"Inter,sans-serif", margin:"0 0 20px" }}>
                      {calcResults ? "Calculation results" : "Run a calculation to see results here"}
                    </p>
                    <AcousticResults
                      results={calcResults}
                      receiver={existingCalc?.receiver}
                    />
                    {!calcResults && (
                      <div style={{ textAlign:"center", padding:"48px 24px",
                        background:"#F8FAFC", borderRadius:14,
                        border:"1.5px dashed #E2E8F0" }}>
                        <p style={{ color:"#94A3B8", fontSize:14,
                          fontFamily:"Inter,sans-serif" }}>
                          Fill in the inputs on the left and click<br />
                          <strong style={{ color:"#0E9F8E" }}>Run Calculation</strong> to see results
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {tab === "versions" && (
              <motion.div key="versions"
                initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
                exit={{ opacity:0 }} transition={{ duration:.22 }}
              >
                <div style={{ maxWidth:680 }}>
                  <div style={{ display:"flex", alignItems:"center",
                    justifyContent:"space-between", marginBottom:20 }}>
                    <div>
                      <h2 style={{ fontFamily:"Plus Jakarta Sans,sans-serif",
                        fontWeight:800, fontSize:16, color:"#0F172A", margin:0 }}>
                        Version History
                      </h2>
                      <p style={{ fontSize:12.5, color:"#94A3B8",
                        fontFamily:"Inter,sans-serif", margin:"3px 0 0" }}>
                        {project.versions?.length || 0} saved versions
                      </p>
                    </div>
                    <motion.button onClick={() => setVersionModal(true)}
                      whileHover={{ scale:1.03 }} whileTap={{ scale:0.97 }}
                      style={{
                        display:"flex", alignItems:"center", gap:7,
                        padding:"9px 18px",
                        background:"linear-gradient(135deg,#0E9F8E,#0B8276)",
                        color:"#fff", borderRadius:10, border:"none",
                        fontSize:13, fontWeight:700,
                        fontFamily:"Plus Jakarta Sans,sans-serif",
                        boxShadow:"0 4px 14px rgba(14,159,142,.3)",
                        cursor:"pointer",
                      }}>
                      <GitCommit size={14} /> Save New Version
                    </motion.button>
                  </div>

                  <div style={{ background:"#fff", borderRadius:16,
                    border:"1px solid #E2E8F0", padding:"22px",
                    boxShadow:"0 1px 4px rgba(0,0,0,.05)" }}>
                    <VersionHistory
                      versions={project.versions || []}
                      currentVersion={project.currentVersion}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* ── Modals ── */}
      <SaveVersionModal
        open={versionModal}
        onClose={() => setVersionModal(false)}
        project={project}
        onSaved={fetchProject}
      />
      <ProjectModal
        open={editModal}
        onClose={() => setEditModal(false)}
        project={project}
        onSaved={fetchProject}
      />
      <DeleteModal
        project={deleteModal ? project : null}
        onClose={() => setDeleteModal(false)}
        onDeleted={() => navigate("/engineer")}
      />

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
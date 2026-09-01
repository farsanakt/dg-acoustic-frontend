import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  FolderOpen, FileText, Clock, CheckCircle2,
  LayoutGrid, List, RefreshCw, AlertCircle,
} from "lucide-react";
import Sidebar      from "../../components/Sidebar";
import Topbar       from "../../components/Topbar";
import StatCard     from "../../components/StatCard";
import ProjectCard  from "../../components/ProjectCard";
import ProjectModal from "../../components/ProjectModal";
import DeleteModal  from "../../components/DeleteModal";
import { getProjectsApi } from "@/api/projectApi";

const FILTERS = ["All","Draft","In Progress","Sent to Client","Approved","Completed"];
const STATUS_MAP = {
  "Draft":"draft","In Progress":"in_progress",
  "Sent to Client":"sent_to_client","Approved":"approved","Completed":"completed",
};

const EmptyState = ({ filter, onNew }) => (
  <motion.div initial={{ opacity:0,y:20 }} animate={{ opacity:1,y:0 }}
    style={{ gridColumn:"1/-1", textAlign:"center", padding:"64px 24px",
      background:"#fff", borderRadius:16,
      border:"1.5px dashed var(--slate-200)" }}>
    <div style={{ width:60,height:60,borderRadius:"50%",
      background:"var(--teal-50)",margin:"0 auto 16px",
      display:"flex",alignItems:"center",justifyContent:"center" }}>
      <FolderOpen size={26} color="#0E9F8E" />
    </div>
    <h3 style={{ fontFamily:"var(--font-display)",fontSize:17,
      fontWeight:800,color:"var(--text)",marginBottom:8 }}>
      {filter==="All"?"No projects yet":`No "${filter}" projects`}
    </h3>
    <p style={{ color:"var(--text-muted)",fontSize:14,
      maxWidth:320,margin:"0 auto 24px" }}>
      {filter==="All"?"Create your first acoustic assessment project."
        :"No projects match this filter."}
    </p>
    {filter==="All" && (
      <motion.button onClick={onNew}
        whileHover={{ scale:1.03 }} whileTap={{ scale:0.97 }}
        style={{ padding:"11px 28px",
          background:"linear-gradient(135deg,#0E9F8E,#0B8276)",
          color:"#fff",borderRadius:"var(--r-full)",
          fontSize:14,fontWeight:700,
          fontFamily:"var(--font-display)",
          boxShadow:"var(--shadow-teal)",
          border:"none",cursor:"pointer" }}>
        + Create First Project
      </motion.button>
    )}
  </motion.div>
);

export default function EngineerDashboard() {
  const [collapsed,     setCollapsed]     = useState(false);
  const [mobileOpen,    setMobileOpen]    = useState(false);
  const [projects,      setProjects]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(false);
  const [filter,        setFilter]        = useState("All");
  const [viewMode,      setViewMode]      = useState("grid");
  const [modalOpen,     setModalOpen]     = useState(false);
  const [editProject,   setEditProject]   = useState(null);
  const [deleteProject, setDeleteProject] = useState(null);

  const sidebarW = collapsed ? 68 : 232;

  const fetchProjects = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const { data } = await getProjectsApi();
      setProjects(data.projects || []);
    } catch { setError(true); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const stats = {
    total:      projects.length,
    inProgress: projects.filter(p=>p.status==="in_progress").length,
    pending:    projects.filter(p=>["draft","revision_needed"].includes(p.status)).length,
    completed:  projects.filter(p=>["approved","completed"].includes(p.status)).length,
  };

  const filtered = filter==="All"
    ? projects
    : projects.filter(p=>p.status===STATUS_MAP[filter]);

  const openNew  = () => { setEditProject(null); setModalOpen(true); };
  const openEdit = (p) => { setEditProject(p);   setModalOpen(true); };

  return (
    <div style={{ display:"flex", minHeight:"100vh", background:"var(--bg)" }}>
      <Sidebar
        collapsed={collapsed} setCollapsed={setCollapsed}
        mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}
      />

      {/* Main area */}
      <div className="page-content" style={{ marginLeft: sidebarW }}>
        <Topbar
          sidebarW={sidebarW}
          onNewProject={openNew}
          onMenuClick={() => setMobileOpen(true)}
        />

        <main className="page-main">
          {/* Stat cards */}
          <div className="grid-4 stat-cards" style={{ marginBottom:28 }}>
            <StatCard icon={FolderOpen}   label="Total Projects" value={stats.total}      color="teal"  delay={0}    />
            <StatCard icon={Clock}        label="In Progress"     value={stats.inProgress} color="blue"  delay={0.07} />
            <StatCard icon={FileText}     label="Draft / Pending" value={stats.pending}    color="amber" delay={0.14} />
            <StatCard icon={CheckCircle2} label="Completed"       value={stats.completed}  color="green" delay={0.21} />
          </div>

          {/* Toolbar */}
          <div style={{ display:"flex", alignItems:"center",
            justifyContent:"space-between",
            marginBottom:18, flexWrap:"wrap", gap:10 }}>
            {/* Filter chips — scroll on mobile */}
            <div style={{ display:"flex", gap:6, flexWrap:"wrap",
              overflowX:"auto", paddingBottom:2 }}>
              {FILTERS.map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  style={{
                    padding:"6px 13px", borderRadius:"var(--r-full)",
                    fontSize:12.5, fontWeight:600, whiteSpace:"nowrap",
                    background: filter===f ? "#0E9F8E":"#fff",
                    color:      filter===f ? "#fff":"var(--slate-600)",
                    border:     filter===f ? "1.5px solid #0E9F8E":"1.5px solid var(--slate-200)",
                    cursor:"pointer", transition:"all .18s",
                  }}>
                  {f}
                  {f!=="All" && STATUS_MAP[f] && (
                    <span style={{ marginLeft:5, fontSize:10.5, borderRadius:99,
                      padding:"1px 5px",
                      background: filter===f ? "rgba(255,255,255,.25)":"var(--slate-100)" }}>
                      {projects.filter(p=>p.status===STATUS_MAP[f]).length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <span style={{ fontSize:12.5, color:"var(--text-muted)", whiteSpace:"nowrap" }}>
                {filtered.length} project{filtered.length!==1?"s":""}
              </span>
              {[{mode:"grid",Icon:LayoutGrid},{mode:"list",Icon:List}].map(({mode,Icon})=>(
                <button key={mode} onClick={()=>setViewMode(mode)} style={{
                  width:32,height:32,borderRadius:"var(--r-md)",
                  border:`1.5px solid ${viewMode===mode?"#0E9F8E":"var(--slate-200)"}`,
                  background: viewMode===mode ? "var(--teal-50)":"#fff",
                  color:      viewMode===mode ? "#0E9F8E":"var(--slate-500)",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  cursor:"pointer",transition:"all .18s",
                }}>
                  <Icon size={14} />
                </button>
              ))}
              <button onClick={fetchProjects} style={{
                width:32,height:32,borderRadius:"var(--r-md)",
                border:"1.5px solid var(--slate-200)",background:"#fff",
                color:"var(--slate-500)",display:"flex",alignItems:"center",
                justifyContent:"center",cursor:"pointer",
              }}>
                <RefreshCw size={13} style={{ animation:loading?"spin .8s linear infinite":"none" }} />
              </button>
            </div>
          </div>

          {/* Project grid */}
          {loading ? (
            <div style={{
              display:"grid",
              gridTemplateColumns: viewMode==="grid"
                ? "repeat(auto-fill,minmax(280px,1fr))" : "1fr",
              gap:16 }}>
              {[1,2,3,4,5,6].map(i=>(
                <div key={i} style={{ height:200,borderRadius:16,
                  background:"linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)",
                  backgroundSize:"200% 100%",
                  animation:"shimmer 1.5s infinite" }} />
              ))}
            </div>
          ) : error ? (
            <div style={{ textAlign:"center",padding:"60px 24px" }}>
              <AlertCircle size={40} color="#EF4444" style={{ margin:"0 auto 14px" }} />
              <p style={{ color:"var(--text-muted)",marginBottom:16 }}>Failed to load projects.</p>
              <button onClick={fetchProjects} style={{ padding:"9px 20px",
                borderRadius:"var(--r-md)",border:"1.5px solid var(--slate-200)",
                fontSize:13,fontWeight:600,cursor:"pointer" }}>
                Try again
              </button>
            </div>
          ) : (
            <div style={{
              display:"grid",
              gridTemplateColumns: viewMode==="grid"
                ? "repeat(auto-fill,minmax(280px,1fr))" : "1fr",
              gap:16 }}>
              {filtered.length===0
                ? <EmptyState filter={filter} onNew={openNew} />
                : filtered.map((p,i)=>(
                    <ProjectCard key={p._id} project={p} index={i}
                      onEdit={openEdit} onDelete={setDeleteProject} />
                  ))
              }
            </div>
          )}
        </main>
      </div>

      <ProjectModal open={modalOpen} onClose={()=>setModalOpen(false)}
        onSaved={fetchProjects} project={editProject} />
      <DeleteModal project={deleteProject} onClose={()=>setDeleteProject(null)}
        onDeleted={fetchProjects} />

      <style>{`
        @keyframes spin    { to { transform:rotate(360deg); } }
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @media (max-width: 768px) {
          .page-content { margin-left: 0 !important; }
        }
      `}</style>
    </div>
  );
}